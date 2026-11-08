/**
 * Chain simulation of a guidewire inside a catheter, in the browser (DECISIONS.md 2026-11-08, "Chain simulation").
 *
 * Modeling reference: the ISMR 2026 catheter tutorial (https://rosmed.github.io/ismr2026/catheter_model) models a
 * catheter as a serial chain of short rigid links joined by spring-damper universal joints, driven at the base, in
 * Gazebo. Its repository has no license, so nothing is copied; this file adapts the same structure for a responsive,
 * deterministic browser model:
 *
 * - **Serial chain in joint space.** Links of `spacingM` run from the sheath at the entry to the furthest tip. Each
 *   joint holds a two-axis bend (a universal joint) relative to its parent link's frame. Forward kinematics from the
 *   sheath gives the node positions, so link lengths are exact by construction.
 * - **Coaxial devices.** The guidewire and the catheter share the chain but have their own inserted lengths, so
 *   either can lead. A joint's spring and rest bend depend on what is there: catheter over wire, catheter alone, or
 *   wire alone. The pre-shaped tips (the wire preset's tip angle, an angled catheter) are rest bends, turned by that
 *   device's tip roll.
 * - **Springs and walls.** Each step, every joint relaxes part of the way toward its rest bend (stiffer material
 *   faster), then one sweep from the sheath to the tip re-bends any joint whose next node would leave the lumen
 *   (physics-chain-lumen.ts), so the device slides along the wall. Bends travel with the material as it is fed or
 *   withdrawn, so a tip that has entered a branch stays there. Which branch the tip enters follows from where its
 *   shaped tip points as it reaches the junction; folding when the tip is blocked follows from the same sweep.
 * - **Contact.** A joint the wall forced away from its rest bend presses on the wall: its load is the forced bend times
 *   that material's bending stiffness, plus any penetration left over. It is an illustrative proxy, not a measured or
 *   clinical force. The educational contact-risk index integrates load, duration and pushing.
 * - **Torsion.** Rotating a device turns its hub roll at once. Its tip roll follows by stick-slip: the shaft stores
 *   twist up to a limit that grows with inserted length and wall contact, then the tip turns with a short lag. That
 *   gives torsional lag, stored twist, and whip when contact drops.
 *
 * Not modeled: inertia and dynamics, axial friction passing less push to the tip, vessel deformation, and the shaft
 * bowing proximally while the tip stays stuck (a blocked tip folds distally instead). Every constant is illustrative.
 * No AI model computes any number here. Positions are metres in the case's Y-up frame.
 */
import { BACK_OUT_THRESHOLD_M, type DeviceId, type LoadedCase, type Vec3, type WireEvent, type WirePresetId } from '../contracts';
import { getPreset } from '../optimize/presets';
import { Lumen } from './physics-chain-lumen';

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
  /** Torsion: extra twist stored per newton of contact load along the device, radians. */
  stickRadPerN: number;
  /** Torsion: tip roll lag time constant, seconds. */
  rollLagS: number;
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
    stickRadPerN: 1.5,
    rollLagS: 0.12,
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
  /** Length of the first link (it grows and splits as length is fed in). */
  first: number;
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
    first: h,
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
  };
  for (let i = 0; i < 20; i++) relaxAndSweep(model, state, 1);
  updateProgress(model, state);
  return state;
}

// ---------------------------------------------------------------- composition and rest shape

/** Arc length from the sheath of each node. */
function arcs(state: ChainState, h: number): number[] {
  return state.bend.map((_, i) => (i === 0 ? 0 : state.first + (i - 1) * h));
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

/** Which material is at arc `a`: its relax rate, bending stiffness, radius and device. */
function material(model: ChainModel, state: ChainState, a: number): { relax: number; bendN: number; radius: number; device: DeviceId } {
  const p = model.params;
  if (a <= state.inserted.catheter) {
    const over = a <= state.inserted.wire;
    return { relax: p.catheter.relax, bendN: p.catheter.bendNPerRad + (over ? p.wire.bendNPerRad : 0), radius: p.catheter.radiusM, device: 'catheter' };
  }
  return { relax: p.wire.relax, bendN: p.wire.bendNPerRad, radius: p.wire.radiusM, device: 'wire' };
}

// ---------------------------------------------------------------- solver

/** The deflection search when a link would leave the lumen: cones every 6° up to 72°, 12 directions each. */
const SLIDE_STEP_DEG = 6;
const SLIDE_RINGS = 12;
const SLIDE_AZIMUTHS = 12;

/** Feed or withdraw `dTotal` metres of chain at the sheath, splitting or merging the first link. */
function feed(model: ChainModel, state: ChainState, dTotal: number): void {
  const h = model.params.spacingM;
  state.first += dTotal;
  while (state.first > h * 1.5) {
    state.first -= h;
    state.bend.splice(1, 0, [0, 0]);
    state.load.splice(1, 0, 0);
  }
  while (state.first < h * 0.5 && state.bend.length > 3) {
    state.bend.splice(1, 1);
    state.load.splice(1, 1);
    state.first += h;
  }
  state.first = Math.max(state.first, h * 0.25);
}

/**
 * Relax every joint part of the way to its rest bend, then sweep from the sheath to the tip: forward kinematics, and
 * wherever the next node would leave the lumen, re-bend that joint so the node lands on the wall. Sets nodes and loads.
 */
function relaxAndSweep(model: ChainModel, state: ChainState, share: number): void {
  const p = model.params;
  const h = p.spacingM;
  const n = state.bend.length;
  const arc = arcs(state, h);
  const nodes: Vec3[] = new Array<Vec3>(n);
  const load = new Array<number>(n).fill(0);
  let t = model.sheathDir;
  let nrm = model.sheathNormal;
  nodes[0] = model.sheath;
  nodes[1] = add(model.sheath, scale(t, state.first));
  for (let j = 1; j + 1 < n; j++) {
    const m = material(model, state, arc[j]!);
    const rest = restBend(model, state, arc[j]!);
    const k = 1 - (1 - m.relax) ** share;
    const was = state.bend[j]!;
    let bend: Bend = [was[0] + (rest[0] - was[0]) * k, was[1] + (rest[1] - was[1]) * k];
    let [t2, n2] = bendFrame(t, nrm, bend);
    let x = add(nodes[j]!, scale(t2, h));
    let q = model.lumen.query(x);
    const room = Math.max(q.radius - material(model, state, arc[j + 1]!).radius, 0.0002);
    if (q.dist > room) {
      // Slide along the wall: deflect the link from where it wanted to go by the smallest angle that keeps the next node
      // inside, so the wall turns the device instead of folding it, and at a junction the side the tip already points
      // to wins. Search widening cones around the intended direction; on the first cone with any inside direction,
      // take the one nearest the wall (the device keeps sliding along the wall it met, rather than jumping to the middle).
      const wanted = t2;
      const p1 = anyNormal(wanted);
      const p2 = cross(wanted, p1);
      let found: Vec3 | null = null;
      for (let ring = 1; ring <= SLIDE_RINGS && !found; ring++) {
        const cone = (ring * SLIDE_STEP_DEG * Math.PI) / 180;
        let bestSlack = -Infinity;
        for (let k = 0; k < SLIDE_AZIMUTHS; k++) {
          const phi = (2 * Math.PI * k) / SLIDE_AZIMUTHS;
          const u = unit(add(scale(wanted, Math.cos(cone)), scale(add(scale(p1, Math.cos(phi)), scale(p2, Math.sin(phi))), Math.sin(cone))));
          if (dot(u, t) < 0) continue; // never back on itself
          const xq = add(nodes[j]!, scale(u, h));
          const qq = model.lumen.query(xq);
          const slackHere = qq.dist - room;
          if (slackHere <= 0 && slackHere > bestSlack) {
            bestSlack = slackHere;
            found = u;
          }
        }
      }
      if (found) {
        bend = bendTo(t, nrm, found);
        [t2, n2] = bendFrame(t, nrm, bend);
        x = add(nodes[j]!, scale(t2, h));
        q = model.lumen.query(x);
      }
      // Still outside (a dead end, or narrower than the device): project onto the wall.
      for (let it = 0; it < 3 && q.dist > room + 1e-6; it++) {
        const inward = q.dist > 1e-12 ? scale(sub(x, q.centre), 1 / q.dist) : anyNormal(sub(q.seg.b, q.seg.a));
        const y = add(q.centre, scale(inward, room));
        bend = bendTo(t, nrm, unit(sub(y, nodes[j]!)));
        [t2, n2] = bendFrame(t, nrm, bend);
        x = add(nodes[j]!, scale(t2, h));
        q = model.lumen.query(x);
      }
      const forced = Math.hypot(bend[0] - rest[0], bend[1] - rest[1]);
      load[j + 1] = m.bendN * forced + p.wallNPerM * Math.max(0, q.dist - room);
    }
    state.bend[j] = bend;
    nodes[j + 1] = x;
    t = t2;
    nrm = n2;
  }
  state.nodes = nodes;
  state.load = load;
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
export const PROGRESS_WINDOW_M = 0.015;

/** Thresholds (illustrative). */
export const CONTACT_MIN_N = 0.02;
export const SPIKE_N = 0.5;
export const PROLAPSE_FEED_M = 0.015;
export const PROLAPSE_PROGRESS_M = 0.003;
export const PROLAPSE_WINDOW_S = 1;
export const RISK_SCALE = 2;

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

  // Torsion: the hub turns at once; the tip follows by stick-slip, limited by length and the last contact loads.
  state.roll[dev].base += rotate * p.rollRadPerS * dt;
  const arcBefore = arcs(state, p.spacingM);
  for (const d of ['wire', 'catheter'] as const) {
    const L = state.inserted[d];
    let contact = 0;
    state.load.forEach((f, i) => {
      if (arcBefore[i]! <= L) contact += f;
    });
    const limit = p.stickRadPerM * L + p.stickRadPerN * contact;
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
    relaxAndSweep(model, state, 1 / p.substeps);
  }

  state.t = prev.t + dt;
  updateProgress(model, state);

  // Contacts and the educational risk index.
  const arc = arcs(state, p.spacingM);
  const contacts: ContactSample[] = [];
  let peak = 0;
  state.load.forEach((f, i) => {
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
    // Count it once the tip is 3 mm inside the branch, not while it grazes the junction.
    const q = model.lumen.query(state.nodes.at(-1)!);
    const local = model.lumen.edgeArc(q);
    const deep = Math.min(local, (model.edgeLength.get(q.seg.edge) ?? 0) - local) > 0.003;
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
