/**
 * Chain simulation of a guidewire inside a catheter, in the browser (DECISIONS.md 2026-11-08, "Chain simulation").
 *
 * Modeling reference: the ISMR 2026 catheter tutorial (https://rosmed.github.io/ismr2026/catheter_model) models a
 * catheter as a serial chain of short rigid links joined by spring-damper universal joints, driven at the base, in
 * Gazebo. Its repository has no license, so nothing is copied; this file adapts the same structure for a responsive,
 * deterministic browser model:
 *
 * - **Serial chain, follow-the-leader.** Links of `spacingM` run from the sheath at the entry to the furthest tip. Feeding
 *   grows the tip link along its own direction (a new joint every spacing); withdrawing shrinks it back. The shape
 *   already in the vessel stays where it is, as a device sliding along its own path does.
 * - **Body and shaped tip.** The shaped tips at the front (the leading device's, and the other device's when it is
 *   within 40 mm) are joint-based: each joint holds a two-axis bend (a universal joint) that relaxes part of the way to
 *   its rest bend each step, turned by that device's tip roll. Everything behind them is position-based: each link aims
 *   where its next node was, smoothed toward its neighbours, so the body straightens like a taut string without
 *   swinging everything beyond a joint (relaxing joint angles along the whole device whips the far tip across a wide
 *   vessel). Coaxial devices share the chain with their own inserted lengths, so either can lead.
 * - **Walls.** Wherever a link's next node would leave the lumen (physics-chain-lumen.ts), the link is re-aimed by the
 *   smallest deflection that keeps it inside and still heading away from the entry, preferring the direction furthest
 *   along the vessel. So the device slides along the wall instead of coiling or corkscrewing in a wide vessel, and which
 *   branch the tip enters follows from where its shaped tip points as it reaches the junction.
 * - **Contact.** A joint the wall forced away from its rest bend presses on the wall: its load is the forced bend beyond
 *   what following the vessel's own curve needs, times that material's bending stiffness, plus any penetration left
 *   over. It is an illustrative proxy, not a measured or clinical force. The educational contact-risk index integrates
 *   load, duration and pushing.
 * - **Torsion.** Rotating a device turns its hub roll at once. Its tip roll follows by stick-slip: the shaft stores
 *   twist up to a limit that grows with inserted length and the mean wall contact, capped at 90°, then the tip turns
 *   with a short lag. That gives torsional lag, stored twist, and whip when contact drops.
 *
 * Not modeled: inertia and dynamics, axial friction passing less push to the tip, vessel deformation, the shaft bowing
 * proximally while the tip stays stuck, and loops that turn back toward the entry (a link always keeps some headway).
 * Every constant is illustrative. No AI model computes any number here. Positions are metres in the case's Y-up frame.
 */
import { BACK_OUT_THRESHOLD_M, type DeviceId, type LoadedCase, type Vec3, type WireEvent, type WirePresetId } from '../contracts';
import { getPreset } from '../optimize/presets';
import { Lumen, type LumenQuery } from './physics-chain-lumen';

// ---------------------------------------------------------------- parameters (illustrative)

export type { DeviceId };

export interface DeviceSpec {
  /** Pre-shaped tip: total bend over `tipLenM`, degrees. */
  tipAngleDeg: number;
  tipLenM: number;
  /** Share of the way back to the rest bend per step, 0..1. */
  relax: number;
  /** Bending stiffness for the contact proxy, N per radian of forced bend. */
  bendNPerRad: number;
  /** Outer radius, metres. */
  radiusM: number;
}

export interface ChainParams {
  spacingM: number;
  substeps: number;
  /** Feed at full push, m/s. */
  speedMps: number;
  /** Hub roll at full rotate, rad/s. */
  rollRadPerS: number;
  wire: DeviceSpec;
  catheter: DeviceSpec;
  /** Share of the wire's pre-shape left inside the catheter (the catheter straightens it). */
  wireInCatheterShape: number;
  /** Share of the catheter's pre-shape left with the wire inside its tip (the wire straightens it). */
  catheterOverWireShape: number;
  /** Load per metre of penetration left after the sweep, N/m. */
  wallNPerM: number;
  /** Torsion: twist stored before the tip turns, per metre inserted (free shaft), radians. */
  stickRadPerM: number;
  /** Torsion: extra twist stored per newton of mean contact load per node along the device, radians. */
  stickRadPerN: number;
  /** Torsion: the most twist the shaft stores before the tip turns, radians. */
  stickMaxRad: number;
  /** Torsion: tip roll lag time constant, seconds. */
  rollLagS: number;
  /** Load at the tip when it is pushed into the wall with its shape fully straightened and not advancing, N. */
  tipPushN: number;
  /** Share of the tip's shape a wall straightens while the tip just glides along it (no push into the wall), 0..1. */
  glideShare: number;
}

const WIRE_RELAX: Record<string, number> = { low: 0.15, medium: 0.25, high: 0.45 };
const WIRE_BEND_N: Record<string, number> = { low: 0.25, medium: 0.4, high: 0.8 };

export function chainParams(presetId: WirePresetId): ChainParams {
  const p = getPreset(presetId);
  return {
    spacingM: 0.003,
    substeps: 2,
    speedMps: 0.02,
    rollRadPerS: Math.PI,
    wire: { tipAngleDeg: p.tipAngleDeg, tipLenM: 0.012, relax: WIRE_RELAX[p.stiffness] ?? 0.2, bendNPerRad: WIRE_BEND_N[p.stiffness] ?? 0.4, radiusM: p.diameterM / 2 },
    // An illustrative 5 F angled diagnostic catheter (about 1.7 mm).
    catheter: { tipAngleDeg: 35, tipLenM: 0.015, relax: 0.5, bendNPerRad: 1.0, radiusM: 0.00085 },
    wireInCatheterShape: 0,
    catheterOverWireShape: 0.4,
    wallNPerM: 400,
    stickRadPerM: 0.4,
    stickRadPerN: 4,
    stickMaxRad: Math.PI / 2,
    rollLagS: 0.12,
    tipPushN: 1.6,
    glideShare: 0.25,
  };
}

// ---------------------------------------------------------------- model and state

export interface ChainModel {
  caseId: string;
  params: ChainParams;
  lumen: Lumen;
  /** The sheath: the entry node, the direction into the vessel, and a reference normal. */
  sheath: Vec3;
  sheathDir: Vec3;
  sheathNormal: Vec3;
  plan: readonly string[];
  /** Cumulative arc length at the start of each plan edge, and whether the walk runs from → to. */
  planStart: Map<string, { start: number; forward: boolean; len: number }>;
  planLength: number;
  targetId: string;
  target: Vec3;
  targetRadius: number;
  edgeLength: Map<string, number>;
  /** +1 where an edge runs away from the entry (from → to), −1 where it runs toward it. */
  edgeAway: Map<string, number>;
  planEdges: ReadonlySet<string>;
  /** The vessel each plan edge belongs to, in plan order (a junction where it changes is a branch to take). */
  planVessels: readonly string[];
  /** The planned path as one polyline from the entry, with cumulative arc length, for progress. */
  planPoints: Vec3[];
  planArc: number[];
}

export interface DeviceRoll {
  /** Roll applied at the hub, radians. */
  base: number;
  /** Roll at the tip, radians. */
  tip: number;
}

export type Bend = [number, number];

export interface ChainState {
  t: number;
  /** Chain nodes, sheath first, tip last (forward kinematics of `bend`). */
  nodes: Vec3[];
  /** Joint bend at each node, in its parent link's frame (index 0 and the last are unused). */
  bend: Bend[];
  /** Length of the last link, at the tip (it grows and splits as length is fed in). */
  last: number;
  inserted: Record<DeviceId, number>;
  roll: Record<DeviceId, DeviceRoll>;
  /** Contact load per node from the last step, N (illustrative proxy). */
  load: number[];
  s: number;
  peakS: number;
  edge: string;
  atTarget: boolean;
  offPlanEdge: string | null;
  lastPlanEdge: string;
  spiking: boolean;
  prolapsed: boolean;
  feedHistory: { t: number; total: number; s: number }[];
  riskEnergy: number;
  /** How far the wall holds the leading shaped tip away from its own shape, as a share of its tip angle (0..1). */
  tipForced: number;
}

export interface ChainControl {
  /** −1..1: feed (+) or withdraw (−) the active device. */
  push: number;
  /** −1..1: turn the active device at the hub. */
  rotate: number;
  device: DeviceId;
}

// ---------------------------------------------------------------- vectors

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => {
  const l = len(a);
  return l > 1e-12 ? scale(a, 1 / l) : [0, 0, 1];
};
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** A unit normal to `t`, stable for any direction. */
function anyNormal(t: Vec3): Vec3 {
  const ref: Vec3 = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  return unit(cross(cross(t, ref), t));
}

/** Rotate `v` about unit axis `a` by `theta` (Rodrigues). */
function rotate(v: Vec3, a: Vec3, theta: number): Vec3 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return add(add(scale(v, c), scale(cross(a, v), s)), scale(a, dot(a, v) * (1 - c)));
}

/** Apply a joint bend to a link frame: tilt the tangent toward bx·n + by·b by |β|, turning n with it. */
function bendFrame(t: Vec3, n: Vec3, [bx, by]: Bend): [Vec3, Vec3] {
  const theta = Math.hypot(bx, by);
  if (theta < 1e-12) return [t, n];
  const d = unit(add(scale(n, bx), scale(cross(t, n), by)));
  const axis = unit(cross(t, d));
  const t2 = unit(rotate(t, axis, theta));
  const n2 = rotate(n, axis, theta);
  return [t2, unit(sub(n2, scale(t2, dot(n2, t2))))];
}

/** The bend that turns tangent `t` (frame n) to direction `u`. */
function bendTo(t: Vec3, n: Vec3, u: Vec3): Bend {
  const c = clamp(dot(t, u), -1, 1);
  const theta = Math.acos(c);
  if (theta < 1e-9) return [0, 0];
  const d = unit(sub(u, scale(t, c)));
  return [theta * dot(d, n), theta * dot(d, cross(t, n))];
}

// ---------------------------------------------------------------- model

/** For each edge, +1 if its `from` node is nearer the entry along the vessel tree, else −1 (shortest path). */
function awayFromEntry(c: LoadedCase, entryNode: string): Map<string, number> {
  const dist = new Map<string, number>([[entryNode, 0]]);
  const open = [entryNode];
  while (open.length) {
    open.sort((a, b) => dist.get(b)! - dist.get(a)!);
    const at = open.pop()!;
    for (const e of c.edges) {
      if (e.from !== at && e.to !== at) continue;
      const other = e.from === at ? e.to : e.from;
      const d = dist.get(at)! + e.lengthM;
      if (d < (dist.get(other) ?? Infinity)) {
        dist.set(other, d);
        open.push(other);
      }
    }
  }
  return new Map(c.edges.map((e) => [e.id, (dist.get(e.from) ?? 0) <= (dist.get(e.to) ?? 0) ? 1 : -1]));
}

export function createChainModel(c: LoadedCase, entryId: string, targetId: string, presetId: WirePresetId, plan: readonly string[]): ChainModel {
  const entry = c.entries.find((e) => e.id === entryId);
  const target = c.targets.find((t) => t.id === targetId);
  if (!entry || !target) throw new Error(`unknown entry ${entryId} or target ${targetId}`);
  const nodes = new Map(c.nodes.map((n) => [n.id, n]));
  const edges = new Map(c.edges.map((e) => [e.id, e]));
  const planStart = new Map<string, { start: number; forward: boolean; len: number }>();
  let at = entry.node;
  let s = 0;
  for (const id of plan) {
    const e = edges.get(id);
    if (!e) throw new Error(`plan edge ${id} not in case`);
    const forward = e.from === at;
    planStart.set(id, { start: s, forward, len: e.lengthM });
    s += e.lengthM;
    at = forward ? e.to : e.from;
  }
  const planPoints: Vec3[] = [];
  let walk = entry.node;
  for (const id of plan) {
    const e = edges.get(id)!;
    const ep = e.from === walk ? e.points : [...e.points].reverse();
    planPoints.push(...(planPoints.length ? ep.slice(1) : ep));
    walk = e.from === walk ? e.to : e.from;
  }
  const planArc = [0];
  for (let i = 1; i < planPoints.length; i++) planArc.push(planArc[i - 1]! + len(sub(planPoints[i]!, planPoints[i - 1]!)));
  const first = edges.get(plan[0]!)!;
  const pts = first.from === entry.node ? first.points : [...first.points].reverse();
  const sheath = pts[0]!;
  let k = 1;
  while (k < pts.length - 1 && len(sub(pts[k]!, sheath)) < 0.005) k++;
  const sheathDir = unit(sub(pts[k]!, sheath));
  const lastEdge = edges.get(plan.at(-1)!)!;
  const tr = lastEdge.to === target.node ? lastEdge.radiiM.at(-1)! : lastEdge.radiiM[0]!;
  return {
    caseId: c.id,
    params: chainParams(presetId),
    lumen: new Lumen(c),
    sheath,
    sheathDir,
    sheathNormal: anyNormal(sheathDir),
    plan,
    planStart,
    planLength: s,
    targetId,
    target: nodes.get(target.node)!.pos,
    targetRadius: tr,
    edgeLength: new Map(c.edges.map((e) => [e.id, e.lengthM])),
    edgeAway: awayFromEntry(c, entry.node),
    planEdges: new Set(plan),
    planVessels: plan.map((id) => edges.get(id)!.vessel),
    planPoints,
    planArc,
  };
}

/** The drive starts with the catheter 20 mm in and the wire leading by 10 mm, laid into the entry vessel. */
export function initialChainState(model: ChainModel): ChainState {
  const h = model.params.spacingM;
  const n = Math.round(0.03 / h) + 1;
  const state: ChainState = {
    t: 0,
    nodes: [],
    bend: Array.from({ length: n }, (): Bend => [0, 0]),
    last: h,
    inserted: { wire: (n - 1) * h, catheter: 0.02 },
    roll: { wire: { base: 0, tip: 0 }, catheter: { base: 0, tip: 0 } },
    load: new Array<number>(n).fill(0),
    s: 0,
    peakS: 0,
    edge: model.plan[0]!,
    atTarget: false,
    offPlanEdge: null,
    lastPlanEdge: model.plan[0]!,
    spiking: false,
    prolapsed: false,
    feedHistory: [],
    riskEnergy: 0,
    tipForced: 0,
  };
  for (let i = 0; i < 20; i++) relaxAndSweep(model, state, 1);
  updateProgress(model, state);
  return state;
}

// ---------------------------------------------------------------- composition and rest shape

/** Arc length from the sheath of each node. */
function arcs(state: ChainState, h: number): number[] {
  const n = state.bend.length;
  return state.bend.map((_, i) => (i < n - 1 ? i * h : (n - 2) * h + state.last));
}

/** Rest bend at a joint at arc `a`, in its parent frame. */
function restBend(model: ChainModel, state: ChainState, a: number): Bend {
  const p = model.params;
  const h = p.spacingM;
  const lw = state.inserted.wire;
  const lc = state.inserted.catheter;
  let angle = 0;
  let roll = 0;
  if (a > lw - p.wire.tipLenM && a <= lw) {
    angle = ((p.wire.tipAngleDeg * Math.PI) / 180) * (h / p.wire.tipLenM) * (a > lc ? 1 : p.wireInCatheterShape);
    roll = state.roll.wire.tip;
  } else if (a > lc - p.catheter.tipLenM && a <= lc) {
    angle = ((p.catheter.tipAngleDeg * Math.PI) / 180) * (h / p.catheter.tipLenM) * (a <= lw ? p.catheterOverWireShape : 1);
    roll = state.roll.catheter.tip;
  }
  return [angle * Math.cos(roll), angle * Math.sin(roll)];
}

/** How far back from the front the shaped tips are solved joint by joint, at most, metres. */
const TIP_REGION_MAX_M = 0.04;

/**
 * How many joints at the front are solved as the shaped tip: the leading device's shaped length, and the other
 * device's too when its tip is within TIP_REGION_MAX_M of the front (a wire just out of an angled catheter is aimed by
 * the catheter's shape as well as its own).
 */
function tipJoints(model: ChainModel, state: ChainState): number {
  const p = model.params;
  const lw = state.inserted.wire;
  const lc = state.inserted.catheter;
  const front = Math.max(lw, lc);
  const wireStart = lw - p.wire.tipLenM;
  const cathStart = lc - p.catheter.tipLenM;
  let start = lw >= lc ? wireStart : cathStart;
  const other = lw >= lc ? cathStart : wireStart;
  if (front - other <= TIP_REGION_MAX_M) start = Math.min(start, other);
  return clamp(Math.ceil((front - start) / p.spacingM) + 1, 2, state.bend.length - 2);
}

/** Which material is at arc `a`: its relax rate, bending stiffness, radius and device. */
function material(model: ChainModel, state: ChainState, a: number): { relax: number; bendN: number; radius: number; device: DeviceId } {
  const p = model.params;
  if (a <= state.inserted.catheter) {
    const over = a <= state.inserted.wire;
    return { relax: p.catheter.relax, bendN: p.catheter.bendNPerRad + (over ? p.wire.bendNPerRad : 0), radius: p.catheter.radiusM, device: 'catheter' };
  }
  // Behind its soft shaped tip, the wire's core is stiffer and straightens faster.
  const relax = a <= state.inserted.wire - p.wire.tipLenM ? Math.max(p.wire.relax, SHAFT_RELAX) : p.wire.relax;
  return { relax, bendN: p.wire.bendNPerRad, radius: p.wire.radiusM, device: 'wire' };
}

/** Share of the way back to straight per step for the wire's shaft behind the tip (illustrative). */
const SHAFT_RELAX = 0.6;

// ---------------------------------------------------------------- solver

/** The deflection search when a link would leave the lumen: cones every 6° up to 72°, 12 directions each. */
const SLIDE_STEP_DEG = 6;
const SLIDE_RINGS = 12;
const SLIDE_AZIMUTHS = 12;

/**
 * Feed or withdraw `dTotal` metres of chain, follow-the-leader: the shape already in the vessel stays where it is and
 * the tip link grows along its own direction (splitting off a new joint every spacing) or shrinks back along it. Feeding
 * at the sheath instead would shift the whole shape forward along the sheath direction, and every curve would have to
 * be forced back into the walls, which kinks and coils the shaft.
 */
function feed(model: ChainModel, state: ChainState, dTotal: number): void {
  const h = model.params.spacingM;
  state.last += dTotal;
  while (state.last > h * 1.5) {
    state.last -= h;
    const n = state.bend.length;
    state.bend.splice(n - 1, 0, restBend(model, state, (n - 1) * h));
    state.load.splice(n - 1, 0, 0);
    if (state.nodes.length === n) {
      const a = state.nodes[n - 2]!;
      state.nodes.splice(n - 1, 0, add(a, scale(unit(sub(state.nodes[n - 1]!, a)), h)));
    }
  }
  while (state.last < h * 0.5 && state.bend.length > 3) {
    const n = state.bend.length;
    state.bend.splice(n - 2, 1);
    state.load.splice(n - 2, 1);
    if (state.nodes.length === n) state.nodes.splice(n - 2, 1);
    state.last += h;
  }
  state.last = Math.max(state.last, h * 0.25);
}

/**
 * One solver pass, from the sheath to the tip. The body (everything behind the shaped tips) is position-based: each
 * link aims where its next node was, smoothed toward its neighbours. The shaped tip is joint-based: each joint relaxes
 * part of the way to its rest bend (the shape, turned by the tip roll). Either way, wherever the next node would leave
 * the lumen, the link is re-aimed so the node stays inside and slides along the wall. Sets nodes, bends and loads.
 */
function relaxAndSweep(model: ChainModel, state: ChainState, share: number, push = 0): void {
  const p = model.params;
  const h = p.spacingM;
  const n = state.bend.length;
  const arc = arcs(state, h);
  const nodes: Vec3[] = new Array<Vec3>(n);
  const load = new Array<number>(n).fill(0);
  let t = model.sheathDir;
  let nrm = model.sheathNormal;
  nodes[0] = model.sheath;
  const linkLen = (i: number): number => (i === n - 2 ? state.last : h);
  const prev = state.nodes;
  const base = n - 1 - tipJoints(model, state);
  let tipForced = 0;
  nodes[1] = add(model.sheath, scale(t, linkLen(0)));
  let qPrev = model.lumen.query(nodes[1]);
  for (let j = 1; j + 1 < n; j++) {
    const lj = linkLen(j);
    const m = material(model, state, arc[j]!);
    const rest = restBend(model, state, arc[j]!);
    const was = state.bend[j]!;
    const k = 1 - (1 - m.relax) ** share;
    let bend: Bend = [was[0] + (rest[0] - was[0]) * k, was[1] + (rest[1] - was[1]) * k];
    if (j + 1 <= base && prev.length === n) {
      // Body: aim at where the next node was, moved part of the way (the relax share) toward the midpoint of its
      // neighbours. The body keeps its place in space and straightens like a taut string, so relaxing a joint does not
      // swing everything beyond it.
      const at = prev[j + 1]!;
      const mid = scale(add(prev[j]!, prev[j + 2]!), 0.5);
      bend = bendTo(t, nrm, unit(sub(add(at, scale(sub(mid, at), k)), nodes[j]!)));
    }
    let [t2, n2] = bendFrame(t, nrm, bend);
    let x = add(nodes[j]!, scale(t2, lj));
    let q = model.lumen.query(x);
    const room = Math.max(q.radius - material(model, state, arc[j + 1]!).radius, 0.0002);
    if (q.dist > room) {
      // Slide along the wall: deflect the link from where it wanted to go by the smallest angle that keeps the next node
      // inside, so the wall turns the device instead of folding it, and at a junction the side the tip already points
      // to wins. Search widening cones around the intended direction; on the first cone with any inside direction,
      // take the one heading furthest along the vessel (the device slides along the wall, not around it in a corkscrew).
      const wanted = t2;
      const p1 = anyNormal(wanted);
      const p2 = cross(wanted, p1);
      let found: Vec3 | null = null;
      for (let ring = 1; ring <= SLIDE_RINGS && !found; ring++) {
        const cone = (ring * SLIDE_STEP_DEG * Math.PI) / 180;
        let bestAhead = -Infinity;
        for (let k = 0; k < SLIDE_AZIMUTHS; k++) {
          const phi = (2 * Math.PI * k) / SLIDE_AZIMUTHS;
          const u = unit(add(scale(wanted, Math.cos(cone)), scale(add(scale(p1, Math.cos(phi)), scale(p2, Math.sin(phi))), Math.sin(cone))));
          if (dot(u, t) < 0) continue; // never back on itself
          const xq = add(nodes[j]!, scale(u, lj));
          const qq = model.lumen.query(xq);
          if (qq.dist > room) continue;
          const ahead = headway(model, qq, u);
          if (ahead < MIN_HEADWAY) continue; // never back toward the entry: no coils in a wide vessel
          if (ahead > bestAhead) {
            bestAhead = ahead;
            found = u;
          }
        }
      }
      if (!found) {
        // Nothing near where it wanted to go: search around the vessel's forward direction instead, and take the inside
        // direction nearest to where it wanted to go. This keeps a hooked tip from bending further back on itself.
        const qj = model.lumen.query(nodes[j]!);
        const fwd = scale(unit(sub(qj.seg.b, qj.seg.a)), model.edgeAway.get(qj.seg.edge) ?? 1);
        const f1 = anyNormal(fwd);
        const f2 = cross(fwd, f1);
        let bestAlign = -Infinity;
        for (let ring = 0; ring <= SLIDE_RINGS && !found; ring++) {
          const cone = (ring * SLIDE_STEP_DEG * Math.PI) / 180;
          for (let k = 0; k < (ring ? SLIDE_AZIMUTHS : 1); k++) {
            const phi = (2 * Math.PI * k) / SLIDE_AZIMUTHS;
            const u = unit(add(scale(fwd, Math.cos(cone)), scale(add(scale(f1, Math.cos(phi)), scale(f2, Math.sin(phi))), Math.sin(cone))));
            const qq = model.lumen.query(add(nodes[j]!, scale(u, lj)));
            if (qq.dist > room || headway(model, qq, u) < MIN_HEADWAY) continue;
            const align = dot(u, wanted);
            if (align > bestAlign) {
              bestAlign = align;
              found = u;
            }
          }
          // Keep widening only while nothing is inside; the first ring with an inside direction gives the answer.
        }
      }
      if (found) {
        bend = bendTo(t, nrm, found);
        [t2, n2] = bendFrame(t, nrm, bend);
        x = add(nodes[j]!, scale(t2, lj));
        q = model.lumen.query(x);
      }
      // Still outside (a dead end, or narrower than the device): project onto the wall.
      for (let it = 0; it < 3 && q.dist > room + 1e-6; it++) {
        const inward = q.dist > 1e-12 ? scale(sub(x, q.centre), 1 / q.dist) : anyNormal(sub(q.seg.b, q.seg.a));
        const y = add(q.centre, scale(inward, room));
        bend = bendTo(t, nrm, unit(sub(y, nodes[j]!)));
        [t2, n2] = bendFrame(t, nrm, bend);
        x = add(nodes[j]!, scale(t2, lj));
        q = model.lumen.query(x);
      }
      // Load counts only the bend beyond what following the vessel needs (the centreline's turn over this link):
      // a device lying along a curved vessel is not pressing harder than one lying along a straight one.
      const forced = Math.hypot(bend[0] - rest[0], bend[1] - rest[1]);
      const conform = vesselTurn(qPrev, q);
      load[j + 1] = m.bendN * Math.max(0, forced - conform) + p.wallNPerM * Math.max(0, q.dist - room);
      if (j + 1 > base) tipForced += Math.max(0, forced - conform);
    }
    qPrev = q;
    state.bend[j] = bend;
    nodes[j + 1] = x;
    t = t2;
    nrm = n2;
  }
  const lead = leadingDevice(state) === 'wire' ? p.wire : p.catheter;
  state.tipForced = clamp(tipForced / Math.max(1e-6, (lead.tipAngleDeg * Math.PI) / 180), 0, 1);
  state.nodes = nodes;
  state.load = load;
}

/**
 * How far a link in direction `u` heads away from the entry along the vessel it is in, as a cosine. A link must keep
 * some headway: deflecting sideways or back would let the shaft coil in a wide vessel, which this quasi-static model
 * cannot resolve (it has no axial force to push a coil straight again).
 */
const MIN_HEADWAY = 0.2;
function headway(model: ChainModel, q: LumenQuery, u: Vec3): number {
  return dot(u, unit(sub(q.seg.b, q.seg.a))) * (model.edgeAway.get(q.seg.edge) ?? 1);
}

/** The device whose tip leads. */
function leadingDevice(state: ChainState): DeviceId {
  return state.inserted.wire >= state.inserted.catheter ? 'wire' : 'catheter';
}

/** The angle between the centreline directions at two lumen queries, radians (either edge orientation). */
function vesselTurn(a: LumenQuery, b: LumenQuery): number {
  if (a.seg === b.seg) return 0;
  const da = unit(sub(a.seg.b, a.seg.a));
  const db = unit(sub(b.seg.b, b.seg.a));
  return Math.acos(clamp(Math.abs(dot(da, db)), 0, 1));
}

// ---------------------------------------------------------------- derived quantities

export interface TipPose {
  position: Vec3;
  /** Unit tangent of the last link. */
  tangent: Vec3;
  /** Curvature over the last two links, 1/m. */
  curvature: number;
  /** Where the tip points: the last link's direction, which already includes the shaped tip. */
  pointing: Vec3;
  leading: DeviceId;
  /** Roll of the leading device at the tip and at the hub, radians. Their difference is the stored twist. */
  tipRoll: number;
  hubRoll: number;
}

export function tipPose(model: ChainModel, state: ChainState): TipPose {
  const nodes = state.nodes;
  const n = nodes.length;
  const a = nodes[Math.max(0, n - 3)]!;
  const b = nodes[n - 2]!;
  const c = nodes[n - 1]!;
  const t1 = unit(sub(b, a));
  const t2 = unit(sub(c, b));
  const turn = Math.acos(clamp(dot(t1, t2), -1, 1));
  const leading: DeviceId = state.inserted.wire >= state.inserted.catheter ? 'wire' : 'catheter';
  // The shaped tip is already in the chain's last links, so the tip points along the last link.
  return { position: c, tangent: t2, curvature: turn / model.params.spacingM, pointing: t2, leading, tipRoll: state.roll[leading].tip, hubRoll: state.roll[leading].base };
}

/**
 * Progress: the tip projected onto the planned path, searched only within PROGRESS_WINDOW_M of the last progress (the
 * tip moves a few millimetres per step at most). Where vessels overlap near a junction, "which edge is the tip in" is
 * ambiguous; the planned path near the last progress is not.
 */
function updateProgress(model: ChainModel, state: ChainState): void {
  const tip = state.nodes.at(-1)!;
  const q = model.lumen.query(tip);
  state.edge = q.seg.edge;
  const P = model.planPoints;
  const A = model.planArc;
  const lo = state.t === 0 ? 0 : state.s - PROGRESS_WINDOW_M;
  const hi = state.t === 0 ? Infinity : state.s + PROGRESS_WINDOW_M;
  let best = Infinity;
  let bestS = state.s;
  for (let i = 0; i + 1 < P.length; i++) {
    if (A[i + 1]! < lo || A[i]! > hi) continue;
    const ab = sub(P[i + 1]!, P[i]!);
    const l2 = dot(ab, ab);
    const u = l2 > 0 ? clamp(dot(sub(tip, P[i]!), ab) / l2, 0, 1) : 0;
    const d = len(sub(tip, add(P[i]!, scale(ab, u))));
    if (d < best) {
      best = d;
      bestS = A[i]! + (A[i + 1]! - A[i]!) * u;
    }
  }
  state.s = bestS;
  if (model.planStart.has(q.seg.edge)) state.lastPlanEdge = q.seg.edge;
  state.atTarget = len(sub(tip, model.target)) <= Math.max(0.004, model.targetRadius);
}

/**
 * Where the leading device's shaped tip is turned to point: the shaft's tangent at the start of the shaped tip and the
 * unit direction, square to it, that the tip roll bends toward. The reference frame is carried from the sheath along
 * the device by the smallest rotation at each joint, the same frame the solver bends in.
 */
export function shapedTipAim(model: ChainModel, state: ChainState): { origin: Vec3; tangent: Vec3; pointing: Vec3 } {
  const nodes = state.nodes;
  const base = Math.max(1, nodes.length - 1 - tipJoints(model, state));
  let t = model.sheathDir;
  let nrm = model.sheathNormal;
  for (let i = 1; i < base; i++) {
    const t2 = unit(sub(nodes[i + 1]!, nodes[i]!));
    const axis = cross(t, t2);
    const sn = len(axis);
    if (sn > 1e-12) nrm = rotate(nrm, scale(axis, 1 / sn), Math.atan2(sn, dot(t, t2)));
    nrm = unit(sub(nrm, scale(t2, dot(nrm, t2))));
    t = t2;
  }
  const leading: DeviceId = state.inserted.wire >= state.inserted.catheter ? 'wire' : 'catheter';
  const roll = state.roll[leading].tip;
  return { origin: nodes[base]!, tangent: t, pointing: add(scale(nrm, Math.cos(roll)), scale(cross(t, nrm), Math.sin(roll))) };
}

/** The chain as points, sheath to tip, and the part each device covers. */
export function devicePoints(model: ChainModel, state: ChainState): Record<DeviceId, Vec3[]> {
  const arc = arcs(state, model.params.spacingM);
  return {
    wire: state.nodes.filter((_, i) => arc[i]! <= state.inserted.wire + 1e-9),
    catheter: state.nodes.filter((_, i) => arc[i]! <= state.inserted.catheter + 1e-9),
  };
}

// ---------------------------------------------------------------- step

/** One node pressing on the wall this step (N proxy). */
export interface ContactSample {
  node: number;
  /** Arc from the sheath, metres. */
  arcM: number;
  edge: string;
  loadN: number;
  device: DeviceId;
}

export interface ChainStepResult {
  state: ChainState;
  events: WireEvent[];
  contacts: ContactSample[];
  /** Largest node load this step, N (illustrative proxy). */
  peakLoadN: number;
  /** Educational contact-risk index, 0..100. Not a clinical force or an injury prediction. */
  riskIndex: number;
}

/** How far from the last progress the tip is looked for along the planned path, metres. */
export const PROGRESS_WINDOW_M = 0.005;

/** Thresholds (illustrative). */
export const CONTACT_MIN_N = 0.05;
export const SPIKE_N = 0.5;
/** Share of the push-into-wall load that counts even while the tip still slides forward. */
const STALL_FLOOR = 0.5;

/** How far outside every planned vessel the tip must be for a wrong branch, metres. */
export const WRONG_BRANCH_M = 0.002;
export const PROLAPSE_FEED_M = 0.015;
export const PROLAPSE_PROGRESS_M = 0.003;
export const PROLAPSE_WINDOW_S = 1;
export const RISK_SCALE = 8;

export function stepChain(model: ChainModel, prev: ChainState, control: ChainControl, dt: number): ChainStepResult {
  const p = model.params;
  const state: ChainState = {
    ...prev,
    bend: prev.bend.map((b): Bend => [b[0], b[1]]),
    load: [...prev.load],
    inserted: { ...prev.inserted },
    roll: { wire: { ...prev.roll.wire }, catheter: { ...prev.roll.catheter } },
    feedHistory: prev.feedHistory.filter((f) => f.t >= prev.t - PROLAPSE_WINDOW_S),
  };
  const events: WireEvent[] = [];
  const push = clamp(control.push, -1, 1);
  const rotate = clamp(control.rotate, -1, 1);
  const dev = control.device;

  // Torsion: the hub turns at once; the tip follows by stick-slip. The twist stored before the tip turns grows with
  // inserted length and with how hard the device presses on the wall on average (not in total, which would grow with
  // length a second time), up to a cap: past it the shaft always passes the turn on.
  state.roll[dev].base += rotate * p.rollRadPerS * dt;
  const arcBefore = arcs(state, p.spacingM);
  for (const d of ['wire', 'catheter'] as const) {
    const L = state.inserted[d];
    let contact = 0;
    let count = 0;
    state.load.forEach((f, i) => {
      if (arcBefore[i]! > L) return;
      contact += f;
      count++;
    });
    const limit = Math.min(p.stickMaxRad, p.stickRadPerM * L + p.stickRadPerN * (count ? contact / count : 0));
    const r = state.roll[d];
    const twist = r.base - r.tip;
    if (Math.abs(twist) > limit) {
      const want = r.base - Math.sign(twist) * limit;
      r.tip += (want - r.tip) * (1 - Math.exp(-dt / p.rollLagS));
    }
  }

  // Feed the active device; the chain is as long as the furthest tip. Then relax and sweep.
  for (let s = 0; s < p.substeps; s++) {
    const before = Math.max(state.inserted.wire, state.inserted.catheter);
    // The wire can't be pulled out entirely; the catheter can't go back past the sheath.
    state.inserted[dev] = Math.max(dev === 'wire' ? 0.005 : 0, state.inserted[dev] + (push * p.speedMps * dt) / p.substeps);
    const after = Math.max(state.inserted.wire, state.inserted.catheter);
    if (after !== before) feed(model, state, after - before);
    relaxAndSweep(model, state, 1 / p.substeps, push);
  }

  state.t = prev.t + dt;
  updateProgress(model, state);

  // Pushing a shaped tip into the wall: the wall holds the tip away from its shape (it points into the wall), and the
  // push does not turn into progress along the vessel. Both have to be true: a tip gliding along a wall is straightened
  // a little anyway (only the share beyond `glideShare` counts), and a tip that slides on is not digging in.
  let ramN = 0;
  if (push > 0) {
    const into = clamp((state.tipForced - p.glideShare) / (1 - p.glideShare), 0, 1);
    const fed = push * p.speedMps * dt;
    const stall = clamp(1 - (state.s - prev.s) / fed, 0, 1);
    ramN = p.tipPushN * push * into * (STALL_FLOOR + (1 - STALL_FLOOR) * stall);
  }

  // Contacts and the educational risk index. The push into the wall counts at the tip, but not in `state.load`, which
  // feeds the solver (so reporting it does not change how the device moves).
  const arc = arcs(state, p.spacingM);
  const contacts: ContactSample[] = [];
  let peak = 0;
  const loads = state.load.map((f, i) => (i === state.load.length - 1 ? f + ramN : f));
  loads.forEach((f, i) => {
    if (f < CONTACT_MIN_N) return;
    peak = Math.max(peak, f);
    contacts.push({ node: i, arcM: arc[i]!, edge: model.lumen.query(state.nodes[i]!).seg.edge, loadN: f, device: material(model, state, arc[i]!).device });
  });
  const pressing = contacts.reduce((acc, c) => acc + Math.max(0, c.loadN - CONTACT_MIN_N), 0);
  state.riskEnergy += pressing * (1 + 2 * Math.max(0, push)) * dt;
  const riskIndex = 100 * (1 - Math.exp(-state.riskEnergy / RISK_SCALE));

  // Events, in the EventLog vocabulary.
  if (!state.spiking && peak > SPIKE_N) events.push({ kind: 'force_spike', t: state.t, forceN: peak, thresholdN: SPIKE_N });
  state.spiking = peak > SPIKE_N;
  if (!model.planStart.has(state.edge)) {
    // Count it once the tip has left every planned vessel by WRONG_BRANCH_M, not while it crosses a junction (where a
    // wide vessel's tube overlaps the branches).
    const deep = model.lumen.query(state.nodes.at(-1)!, model.planEdges).slack > WRONG_BRANCH_M;
    if (deep && state.offPlanEdge !== state.edge) {
      const i = model.plan.indexOf(state.lastPlanEdge);
      events.push({ kind: 'wrong_branch', t: state.t, edge: state.edge, expectedEdge: model.plan[i + 1] ?? state.lastPlanEdge });
      state.offPlanEdge = state.edge;
    }
  } else state.offPlanEdge = null;
  if (state.s > state.peakS) state.peakS = state.s;
  if (state.peakS - state.s > BACK_OUT_THRESHOLD_M) {
    events.push({ kind: 'back_out', t: state.t, fromS: state.peakS, toS: state.s });
    state.peakS = state.s;
  }
  const total = Math.max(state.inserted.wire, state.inserted.catheter);
  state.feedHistory.push({ t: state.t, total, s: state.s });
  const oldest = state.feedHistory[0]!;
  if (!state.prolapsed && push > 0 && total - oldest.total >= PROLAPSE_FEED_M && state.s - oldest.s <= PROLAPSE_PROGRESS_M) {
    events.push({ kind: 'prolapse', t: state.t, edge: state.edge });
    state.prolapsed = true;
  }
  if (state.prolapsed && push < 0 && oldest.total - total > 0.01) state.prolapsed = false;
  if (!prev.atTarget && state.atTarget) events.push({ kind: 'target_reached', t: state.t, target: model.targetId });
  return { state, events, contacts, peakLoadN: peak, riskIndex };
}
