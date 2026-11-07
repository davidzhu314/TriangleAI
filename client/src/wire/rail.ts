/**
 * Rail wire model (spec §5.3, §5.6). The core is a pure `step(model, state, input, dt)`: the same
 * model, state and inputs always give the same next state and events, bit for bit. Time is
 * simulation time (accumulated dt). Positions and s are metres in the loaded case's Y-up frame.
 *
 * - State: the tip's arc length s along the walked path (entry → tip), its roll φ, and the walked
 *   edges (the active edge is the last). Push/pull moves s at push × RAIL_SPEED_MPS; rotate turns
 *   φ at rotate × RAIL_ROLL_RAD_PER_S.
 * - Branch entry (§5.3): at a branch point the tip enters the candidate edge whose direction is
 *   closest to the tip direction (the preset's tip angle, rolled by φ) if within 25°. Otherwise it
 *   continues the straightest way, along the edge closest to the incoming direction. Entering an
 *   edge not on the planned path records wrong_branch. Pulling back past a branch point backs out
 *   of that edge.
 * - Prolapse (scripted): pushing into a turn sharper than the preset's maximum, or pushing against
 *   a wall (a dead end) for more than 1 s, bows the wire and records one prolapse. The tip holds
 *   until the player pulls back.
 * - Wall-force proxy: F = K × push speed × (θ − 30°) / 60°, where θ is the angle between the tip's
 *   heading (the last 5 mm) and the vessel ahead (the next 5 mm); F = K × push speed while stuck.
 *   A force_spike fires when F rises through FORCE_SPIKE_THRESHOLD_N.
 * - back_out: once per retreat, when s falls more than 20 mm below its peak since the tip last
 *   moved forward (DECISIONS.md, "One back_out per retreat").
 *
 * The constants are illustrative (DECISIONS.md, "Rail wire constants"). No AI model computes any
 * number here.
 */

import {
  BACK_OUT_THRESHOLD_M,
  clampControl,
  type ControlInput,
  type LoadedCase,
  type LoadedEdge,
  type WireEvent,
  type WirePreset,
  type WirePresetId,
} from '../contracts';
import { angleBetween, cumulativeArclength, cross, joinRoute, norm, pointAt, sub, windowedTurning, type Point3 } from '../optimize/measures';
import { getPreset } from '../optimize/presets';

// ---------------------------------------------------------------- constants (illustrative)

/** Tip speed at full push, m/s. */
export const RAIL_SPEED_MPS = 0.02;
/** Roll rate at full rotate, rad/s. */
export const RAIL_ROLL_RAD_PER_S = Math.PI;
/** Spec §5.3: a branch is entered when the tip points within this of it. */
export const BRANCH_ENTRY_DEG = 25;
/** Spec §5.3: the force proxy grows only when tip and vessel directions differ by more than this. */
export const WALL_ANGLE_DEG = 30;
/** Force proxy gain, N per (m/s) of push at a 90° mismatch (and while stuck). */
export const FORCE_N_PER_MPS = 30;
/** force_spike threshold. Scoring owns it (events.ts); every spike event records the value. */
export const FORCE_SPIKE_THRESHOLD_N = 0.5;
/** Spec §5.3: pushing against a wall for longer than this prolapses the wire. */
export const WALL_PROLAPSE_S = 1;
/** Window for the tip heading, the vessel direction and branch directions (as the measures use). */
export const RAIL_WINDOW_M = 0.005;

const DEG = 180 / Math.PI;
const EPS = 1e-12;

// ---------------------------------------------------------------- model (immutable per drive)

interface OrientedEdge {
  id: string;
  /** Node the walk enters this edge from, and the node it leaves by. */
  start: string;
  end: string;
  points: Point3[];
  lengthM: number;
  /** Arc lengths (edge-local, from `start`) where the edge's own 5 mm-window turn exceeds the preset maximum. */
  blocks: number[];
}

export interface RailModel {
  caseId: string;
  entryId: string;
  entryNode: string;
  targetId: string;
  targetNode: string;
  preset: WirePreset;
  plan: readonly string[];
  edges: ReadonlyMap<string, LoadedEdge>;
  adjacency: ReadonlyMap<string, readonly string[]>;
  /** Memo for oriented edges and walked paths. It never changes a result. */
  cache: Map<string, unknown>;
}

export function createRailModel(c: LoadedCase, entryId: string, targetId: string, presetId: WirePresetId, plan: readonly string[]): RailModel {
  const entry = c.entries.find((e) => e.id === entryId);
  const target = c.targets.find((t) => t.id === targetId);
  if (!entry) throw new Error(`rail: unknown entry ${entryId}`);
  if (!target) throw new Error(`rail: unknown target ${targetId}`);
  const edges = new Map(c.edges.map((e) => [e.id, e]));
  for (const id of plan) if (!edges.has(id)) throw new Error(`rail: plan has unknown edge ${id}`);
  const adjacency = new Map<string, string[]>();
  for (const e of c.edges) {
    for (const n of [e.from, e.to]) {
      const list = adjacency.get(n) ?? [];
      if (!list.includes(e.id)) list.push(e.id);
      adjacency.set(n, list);
    }
  }
  for (const list of adjacency.values()) list.sort();
  return {
    caseId: c.id,
    entryId,
    entryNode: entry.node,
    targetId,
    targetNode: target.node,
    preset: getPreset(presetId),
    plan: [...plan],
    edges,
    adjacency,
    cache: new Map(),
  };
}

function oriented(model: RailModel, id: string, fromNode: string): OrientedEdge {
  const key = `o:${id}:${fromNode}`;
  const hit = model.cache.get(key) as OrientedEdge | undefined;
  if (hit) return hit;
  const e = model.edges.get(id)!;
  const fwd = e.from === fromNode;
  const points = (fwd ? e.points : [...e.points].reverse()).map((p) => [p[0], p[1], p[2]] as Point3);
  const cs = cumulativeArclength(points);
  const wt = windowedTurning(points, RAIL_WINDOW_M, RAIL_WINDOW_M / 20);
  const maxRad = model.preset.maxTurnDeg / DEG;
  const blocks = wt.s.filter((_, i) => wt.thetaRad[i]! > maxRad);
  const o: OrientedEdge = { id, start: fromNode, end: fwd ? e.to : e.from, points, lengthM: cs[cs.length - 1]!, blocks };
  model.cache.set(key, o);
  return o;
}

export interface WalkStep {
  edge: string;
  reversed: boolean;
}

interface WalkGeometry {
  points: Point3[];
  cs: Float64Array;
  lengthM: number;
  /** Arc length where each walked edge starts. */
  starts: number[];
  edges: OrientedEdge[];
}

function walkGeometry(model: RailModel, walked: readonly WalkStep[]): WalkGeometry {
  const key = `w:${walked.map((w) => (w.reversed ? '-' : '+') + w.edge).join(',')}`;
  const hit = model.cache.get(key) as WalkGeometry | undefined;
  if (hit) return hit;
  let at = model.entryNode;
  const edges = walked.map((w) => {
    const o = oriented(model, w.edge, at);
    at = o.end;
    return o;
  });
  const { points, junctionS } = joinRoute(
    edges.map((e) => e.points),
    edges.map(() => false),
  );
  const cs = cumulativeArclength(points);
  const g: WalkGeometry = { points, cs, lengthM: cs[cs.length - 1] ?? 0, starts: [0, ...junctionS], edges };
  model.cache.set(key, g);
  return g;
}

// ---------------------------------------------------------------- directions

const unit = (v: Point3): Point3 => {
  const n = norm(v);
  return n > EPS ? [v[0] / n, v[1] / n, v[2] / n] : [0, 0, 0];
};

/**
 * Roll reference for a heading t: the world +Z axis made perpendicular to t, or +X when t is
 * within ~25° of ±Z. φ = 0 points the tip toward it, and φ = π/2 toward t × n0.
 */
export function rollFrame(t: Point3): { n0: Point3; b0: Point3 } {
  const ref: Point3 = Math.abs(t[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  const d = ref[0] * t[0] + ref[1] * t[1] + ref[2] * t[2];
  const n0 = unit([ref[0] - d * t[0], ref[1] - d * t[1], ref[2] - d * t[2]]);
  return { n0, b0: cross(t, n0) };
}

/** The tip direction: the heading t bent by the preset's tip angle, rolled by φ. */
export function tipDirection(t: Point3, tipAngleDeg: number, rollRad: number): Point3 {
  const a = tipAngleDeg / DEG;
  const { n0, b0 } = rollFrame(t);
  const c = Math.cos(rollRad);
  const s = Math.sin(rollRad);
  return unit([
    Math.cos(a) * t[0] + Math.sin(a) * (c * n0[0] + s * b0[0]),
    Math.cos(a) * t[1] + Math.sin(a) * (c * n0[1] + s * b0[1]),
    Math.cos(a) * t[2] + Math.sin(a) * (c * n0[2] + s * b0[2]),
  ]);
}

/** Heading over the last window before arc length s on a polyline. */
function headingBefore(g: { points: Point3[]; cs: Float64Array }, s: number): Point3 {
  return unit(sub(pointAt(g.points, s, g.cs), pointAt(g.points, s - RAIL_WINDOW_M, g.cs)));
}

/** Direction of an edge leaving `node`: its first window. */
function edgeDirection(o: OrientedEdge): Point3 {
  const cs = cumulativeArclength(o.points);
  return unit(sub(pointAt(o.points, RAIL_WINDOW_M, cs), o.points[0]!));
}

export interface BranchChoice {
  edge: string;
  /** 'pointed' when the tip aimed within 25°, 'continued' when it took the straightest way. */
  how: 'pointed' | 'continued';
  /** Deflection from the incoming heading into the chosen edge, degrees (the windowed turn). */
  turnDeg: number;
}

/** The §5.3 branch-entry rule at the end of the walked path. Null at a dead end. */
export function chooseBranch(model: RailModel, walked: readonly WalkStep[], rollRad: number): BranchChoice | null {
  const g = walkGeometry(model, walked);
  const last = g.edges[g.edges.length - 1]!;
  const node = last.end;
  const cands = (model.adjacency.get(node) ?? []).filter((id) => id !== last.id).map((id) => oriented(model, id, node));
  if (cands.length === 0) return null;
  const t = headingBefore(g, g.lengthM);
  const tip = tipDirection(t, model.preset.tipAngleDeg, rollRad);
  const dirs = cands.map(edgeDirection);
  let best = 0;
  for (let i = 1; i < cands.length; i++) if (angleBetween(tip, dirs[i]!) < angleBetween(tip, dirs[best]!) - EPS) best = i;
  let how: BranchChoice['how'] = 'pointed';
  if (angleBetween(tip, dirs[best]!) * DEG > BRANCH_ENTRY_DEG) {
    how = 'continued';
    best = 0;
    for (let i = 1; i < cands.length; i++) if (angleBetween(t, dirs[i]!) < angleBetween(t, dirs[best]!) - EPS) best = i;
  }
  return { edge: cands[best]!.id, how, turnDeg: angleBetween(t, dirs[best]!) * DEG };
}

// ---------------------------------------------------------------- state and step

export interface RailState {
  /** Simulation time, s. */
  t: number;
  /** Tip arc length along the walked path from the entry, m. */
  s: number;
  rollRad: number;
  /** Edges walked from the entry; the last is the active edge. */
  walked: WalkStep[];
  /** back_out bookkeeping (see the header). */
  peakS: number;
  retreating: boolean;
  backOutFired: boolean;
  /** Bowed after a prolapse; the tip holds until the player pulls back. */
  prolapsed: boolean;
  /** Seconds the tip has been pushed without moving. */
  stuckS: number;
  forceN: number;
  fluoro: boolean;
  atTarget: boolean;
}

export function initialRailState(model: RailModel): RailState {
  const first = model.plan[0] ?? (model.adjacency.get(model.entryNode) ?? [])[0];
  if (!first) throw new Error('rail: the entry has no edge');
  const e = model.edges.get(first)!;
  if (e.from !== model.entryNode && e.to !== model.entryNode) throw new Error(`rail: plan edge ${first} does not start at the entry`);
  return {
    t: 0,
    s: 0,
    rollRad: 0,
    walked: [{ edge: first, reversed: e.from !== model.entryNode }],
    peakS: 0,
    retreating: false,
    backOutFired: false,
    prolapsed: false,
    stuckS: 0,
    forceN: 0,
    fluoro: false,
    atTarget: false,
  };
}

export interface StepResult {
  state: RailState;
  /** Events at the new time, in the order they happened. */
  events: WireEvent[];
}

function expectedEdge(model: RailModel, walked: readonly WalkStep[]): string {
  const plan = model.plan;
  let i = 0;
  while (i < walked.length && i < plan.length && walked[i]!.edge === plan[i]) i++;
  return plan[Math.min(i, plan.length - 1)] ?? '';
}

/** Pure: never mutates `state`, never reads a clock or a random source. */
export function step(model: RailModel, state: RailState, input: ControlInput, dt: number): StepResult {
  const events: WireEvent[] = [];
  const t = state.t + dt;
  const push = clampControl(input.push);
  const rotate = clampControl(input.rotate);
  let walked = state.walked;
  let s = state.s;
  let prolapsed = state.prolapsed;
  let atTarget = state.atTarget;
  const rollRad = state.rollRad + rotate * RAIL_ROLL_RAD_PER_S * dt;

  if (input.contrastPuff) events.push({ t, kind: 'contrast_puff' });

  const prolapse = (edge: string) => {
    if (!prolapsed) events.push({ t, kind: 'prolapse', edge });
    prolapsed = true;
  };

  let blocked = false;
  const ds = atTarget ? 0 : push * RAIL_SPEED_MPS * dt;
  if (ds < 0) {
    s = Math.max(0, s + ds);
    let g = walkGeometry(model, walked);
    while (walked.length > 1 && s < g.starts[g.starts.length - 1]!) {
      walked = walked.slice(0, -1);
      g = walkGeometry(model, walked);
    }
    if (s < state.s) prolapsed = false;
  } else if (ds > 0) {
    if (prolapsed) blocked = true;
    let remaining = ds;
    while (remaining > EPS && !blocked && !atTarget) {
      const g = walkGeometry(model, walked);
      const last = g.edges[g.edges.length - 1]!;
      const edgeStart = g.starts[g.starts.length - 1]!;
      const ahead = Math.min(s + remaining, g.lengthM);
      const block = last.blocks.map((b) => edgeStart + b).find((b) => b > s + EPS && b <= ahead);
      if (block !== undefined) {
        s = block;
        prolapse(last.id);
        blocked = true;
        break;
      }
      if (s + remaining <= g.lengthM) {
        s += remaining;
        remaining = 0;
        break;
      }
      remaining -= g.lengthM - s;
      s = g.lengthM;
      if (last.end === model.targetNode) {
        atTarget = true;
        events.push({ t, kind: 'target_reached', target: model.targetId });
        break;
      }
      const choice = chooseBranch(model, walked, rollRad);
      if (!choice) {
        blocked = true;
        break;
      }
      if (choice.turnDeg > model.preset.maxTurnDeg) {
        prolapse(last.id);
        blocked = true;
        break;
      }
      const ce = model.edges.get(choice.edge)!;
      const next: WalkStep = { edge: choice.edge, reversed: ce.from !== last.end };
      if (!model.plan.includes(choice.edge)) {
        events.push({ t, kind: 'wrong_branch', edge: choice.edge, expectedEdge: expectedEdge(model, walked) });
      }
      walked = [...walked, next];
    }
  }

  // stuck: pushing without moving (a dead end, a too-sharp turn, or bowed)
  const stuck = push > 0 && !atTarget && s <= state.s + EPS && (blocked || prolapsed);
  const stuckS = stuck ? state.stuckS + dt : 0;
  if (stuck && stuckS > WALL_PROLAPSE_S) {
    const g = walkGeometry(model, walked);
    prolapse(g.edges[g.edges.length - 1]!.id);
  }

  // wall-force proxy
  let forceN = 0;
  if (push > 0 && !atTarget) {
    const speed = push * RAIL_SPEED_MPS;
    if (stuck) forceN = FORCE_N_PER_MPS * speed;
    else {
      const g = walkGeometry(model, walked);
      const back = sub(pointAt(g.points, s, g.cs), pointAt(g.points, s - RAIL_WINDOW_M, g.cs));
      const fwd = sub(pointAt(g.points, s + RAIL_WINDOW_M, g.cs), pointAt(g.points, s, g.cs));
      const theta = angleBetween(back, fwd) * DEG;
      forceN = (FORCE_N_PER_MPS * speed * Math.max(0, theta - WALL_ANGLE_DEG)) / 60;
    }
  }
  if (state.forceN <= FORCE_SPIKE_THRESHOLD_N && forceN > FORCE_SPIKE_THRESHOLD_N) {
    events.push({ t, kind: 'force_spike', forceN, thresholdN: FORCE_SPIKE_THRESHOLD_N });
  }

  // back_out: once per retreat
  let { peakS, retreating, backOutFired } = state;
  if (s > state.s) {
    if (retreating) {
      retreating = false;
      backOutFired = false;
      peakS = state.s;
    }
    peakS = Math.max(peakS, s);
  } else if (s < state.s) {
    retreating = true;
  }
  if (!backOutFired && peakS - s > BACK_OUT_THRESHOLD_M) {
    events.push({ t, kind: 'back_out', fromS: peakS, toS: s });
    backOutFired = true;
  }

  return {
    state: { t, s, rollRad, walked, peakS, retreating, backOutFired, prolapsed, stuckS, forceN, fluoro: input.fluoro, atTarget },
    events,
  };
}

// ---------------------------------------------------------------- read-outs

/** Tip position, m. */
export function railTip(model: RailModel, state: RailState): Point3 {
  const g = walkGeometry(model, state.walked);
  return pointAt(g.points, state.s, g.cs);
}

/** The edge the tip is on: the last walked edge that starts at or before s. */
export function railEdge(model: RailModel, state: RailState): string {
  const g = walkGeometry(model, state.walked);
  let i = g.starts.length - 1;
  while (i > 0 && g.starts[i]! > state.s) i--;
  return g.edges[i]!.id;
}

/** Arc length of the walked path, m (for tests and the autopilot). */
export function railPathLength(model: RailModel, walked: readonly WalkStep[]): number {
  return walkGeometry(model, walked).lengthM;
}

/** Heading of the walked path just before s (the incoming direction at a branch point). */
export function railHeading(model: RailModel, walked: readonly WalkStep[], s: number): Point3 {
  return headingBefore(walkGeometry(model, walked), s);
}

/** An oriented edge's leaving direction, for the autopilot. */
export function railEdgeDirection(model: RailModel, edgeId: string, fromNode: string): Point3 {
  return edgeDirection(oriented(model, edgeId, fromNode));
}

/** The node at the end of the walked path. */
export function railEndNode(model: RailModel, walked: readonly WalkStep[]): string {
  const g = walkGeometry(model, walked);
  return g.edges[g.edges.length - 1]!.end;
}

// ---------------------------------------------------------------- wire body

/** Body point spacing, m. */
export const BODY_STEP_M = 0.002;
/** Sinusoidal offset amplitude and wavelength, m. The offset fades to 0 over the last 10 mm, so the tip stays on the centerline. */
export const BODY_OFFSET_M = 0.0003;
export const BODY_WAVELENGTH_M = 0.04;
/** Prolapse bow: amplitude and the span behind the tip it covers, m. */
export const PROLAPSE_BOW_M = 0.004;
export const PROLAPSE_SPAN_M = 0.03;

/** Wire body points, base to tip, m. Rail picks its own count (one per 2 mm, plus the tip). */
export function railBody(model: RailModel, state: RailState): Point3[] {
  const g = walkGeometry(model, state.walked);
  const s = state.s;
  const n = Math.max(1, Math.ceil(s / BODY_STEP_M));
  const out: Point3[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i === n ? s : i * BODY_STEP_M;
    const p = pointAt(g.points, u, g.cs);
    if (i === n) {
      out.push(p);
      break;
    }
    const tangent = unit(sub(pointAt(g.points, u + 0.001, g.cs), pointAt(g.points, u - 0.001, g.cs)));
    const { n0, b0 } = rollFrame(tangent);
    const fade = Math.min(1, (s - u) / 0.01);
    let a = BODY_OFFSET_M * Math.sin((2 * Math.PI * u) / BODY_WAVELENGTH_M) * fade;
    let bow = 0;
    if (state.prolapsed && u > s - PROLAPSE_SPAN_M) bow = PROLAPSE_BOW_M * Math.sin((Math.PI * (u - (s - PROLAPSE_SPAN_M))) / PROLAPSE_SPAN_M);
    if (!Number.isFinite(a)) a = 0;
    out.push([p[0] + a * n0[0] + bow * b0[0], p[1] + a * n0[1] + bow * b0[1], p[2] + a * n0[2] + bow * b0[2]]);
  }
  return out;
}
