/**
 * Steering at branch points (spec §5.3), shared by the rail wire and the steerability check.
 *
 * The rule: at a branch point, the tip direction is the heading over the last 5 mm, bent by the
 * preset's tip angle and rolled by φ. The tip enters the branch closest to that direction if it is
 * within 25°; otherwise it continues the straightest way (the branch closest to the heading).
 * `pickBranch` is that rule; wire/rail.ts calls it on every branch point it reaches, and
 * `steerableAt` calls it for each branch point of a planned route with the roll the autopilot would
 * set, so a route `steerableAt` accepts is one the rail autopilot drives without a wrong branch.
 *
 * Geometry is scale-free (unit directions), so the same functions work in metres (rail) and in
 * millimetres (the route graph). Pure; DECISIONS.md, "Steerability check".
 */

import type { WirePresetId } from '../contracts';
import type { RouteGraph } from './graph';
import { orientRoute } from './measure-route';
import { angleBetween, cross, cumulativeArclength, joinRoute, norm, pointAt, sub, type Point3 } from './measures';
import { getPreset } from './presets';

/** Spec §5.3: a branch is entered when the tip points within this of it. */
export const BRANCH_ENTRY_DEG = 25;
/** Window for headings and branch directions, mm (the 5 mm the measures use). */
export const STEER_WINDOW_MM = 5;

const DEG = 180 / Math.PI;
const EPS = 1e-12;

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

/** The roll that points the tip most nearly along `dir` from heading t. */
export function bestRoll(t: readonly number[], dir: readonly number[]): number {
  const { n0, b0 } = rollFrame([t[0]!, t[1]!, t[2]!]);
  return Math.atan2(dir[0]! * b0[0] + dir[1]! * b0[1] + dir[2]! * b0[2], dir[0]! * n0[0] + dir[1]! * n0[1] + dir[2]! * n0[2]);
}

/** Unit heading over the window before arc length s. */
export function headingAt(points: readonly Point3[], cs: Float64Array, s: number, window: number): Point3 {
  return unit(sub(pointAt(points as Point3[], s, cs), pointAt(points as Point3[], s - window, cs)));
}

/** Unit direction of a polyline leaving its first point: its first window. */
export function leavingDirection(points: readonly Point3[], window: number): Point3 {
  const cs = cumulativeArclength(points as Point3[]);
  return unit(sub(pointAt(points as Point3[], window, cs), points[0]!));
}

export interface BranchPick {
  index: number;
  how: 'pointed' | 'continued';
}

/** The §5.3 branch-entry rule over candidate directions (ties go to the lower index). Null with none. */
export function pickBranch(t: Point3, tipAngleDeg: number, rollRad: number, dirs: readonly Point3[]): BranchPick | null {
  if (dirs.length === 0) return null;
  const tip = tipDirection(t, tipAngleDeg, rollRad);
  let best = 0;
  for (let i = 1; i < dirs.length; i++) if (angleBetween(tip, dirs[i]!) < angleBetween(tip, dirs[best]!) - EPS) best = i;
  if (angleBetween(tip, dirs[best]!) * DEG <= BRANCH_ENTRY_DEG) return { index: best, how: 'pointed' };
  best = 0;
  for (let i = 1; i < dirs.length; i++) if (angleBetween(t, dirs[i]!) < angleBetween(t, dirs[best]!) - EPS) best = i;
  return { index: best, how: 'continued' };
}

/** Roll samples tried when aiming straight at the wanted branch does not enter it, degrees apart. */
export const ROLL_SEARCH_STEP_DEG = 1;

/**
 * The roll a careful driver sets to enter branch `want`: aim the tip at it (bestRoll) when that
 * enters it; otherwise, of the rolls 0°, 1°, … 359°, the one that enters it while keeping the tip
 * farthest from every other branch (rolling the tip away, so the wire continues the straightest
 * way). Ties go to the smaller roll. Null when no roll enters `want`.
 */
export function steerRoll(t: Point3, tipAngleDeg: number, dirs: readonly Point3[], want: number): number | null {
  if (tipAngleDeg === 0) return pickBranch(t, 0, 0, dirs)?.index === want ? 0 : null;
  const aim = bestRoll(t, dirs[want]!);
  if (pickBranch(t, tipAngleDeg, aim, dirs)?.index === want) return aim;
  let best: number | null = null;
  let bestClear = -Infinity;
  for (let k = 0; k * ROLL_SEARCH_STEP_DEG < 360; k++) {
    const roll = (k * ROLL_SEARCH_STEP_DEG) / DEG;
    if (pickBranch(t, tipAngleDeg, roll, dirs)?.index !== want) continue;
    const tip = tipDirection(t, tipAngleDeg, roll);
    let clear = Infinity;
    for (let i = 0; i < dirs.length; i++) if (i !== want) clear = Math.min(clear, angleBetween(tip, dirs[i]!));
    if (clear > bestClear + EPS) {
      bestClear = clear;
      best = roll;
    }
  }
  return best;
}

// ---------------------------------------------------------------- the route check

export interface SteerFailure {
  /** Branch point. */
  node: string;
  /** The planned edge the tip should enter there. */
  edge: string;
  /** Deflection from the incoming heading into the planned edge (its takeoff), degrees. */
  takeoffDeg: number;
  /** The preset's tip angle, degrees. */
  tipDeg: number;
  /** The edge the tip enters instead. */
  entered: string;
}

export interface Steerability {
  ok: boolean;
  failures: SteerFailure[];
}

const orientedPoints = (pointsMm: readonly Point3[], reversed: boolean): Point3[] => (reversed ? [...pointsMm].reverse() : [...pointsMm]);

/**
 * Whether the preset's tip can be steered along `path` (edge ids from the entry) under the §5.3
 * rule: at each branch point some roll enters the planned edge (`steerRoll`, which the rail
 * autopilot also uses). A failure names the branch the tip enters when aimed at the planned edge.
 */
export function steerableAt(graph: RouteGraph, path: readonly string[], presetId: WirePresetId, startNode?: string): Steerability {
  const tipDeg = getPreset(presetId).tipAngleDeg;
  const route = orientRoute(graph, path, startNode === undefined ? {} : { startNode });
  const failures: SteerFailure[] = [];
  const walked: Point3[][] = [];
  for (let i = 0; i < route.edges.length - 1; i++) {
    walked.push(orientedPoints(route.edges[i]!.pointsMm, route.reversed[i]!));
    const node = route.nodes[i + 1]!;
    const next = route.edges[i + 1]!.id;
    const cands = [...(graph.adjacency.get(node) ?? [])].filter((id) => id !== route.edges[i]!.id).sort();
    if (cands.length < 2) continue; // no choice to make
    const { points } = joinRoute(walked, walked.map(() => false));
    const cs = cumulativeArclength(points);
    const t = headingAt(points, cs, cs[cs.length - 1]!, STEER_WINDOW_MM);
    const dirs = cands.map((id) => {
      const e = graph.edges.get(id)!;
      return leavingDirection(orientedPoints(e.pointsMm, e.from !== node), STEER_WINDOW_MM);
    });
    const want = cands.indexOf(next);
    if (steerRoll(t, tipDeg, dirs, want) === null) {
      const pick = pickBranch(t, tipDeg, tipDeg === 0 ? 0 : bestRoll(t, dirs[want]!), dirs)!;
      failures.push({ node, edge: next, takeoffDeg: angleBetween(t, dirs[want]!) * DEG, tipDeg, entered: cands[pick.index]! });
    }
  }
  return { ok: failures.length === 0, failures };
}
