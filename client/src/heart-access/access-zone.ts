/**
 * The apical access zone: which points on the LV's outer wall a sheath could go in through, for a given target, and
 * why the others are ruled out. Pure geometry; no AI, no outcome prediction. Research and education only.
 *
 * A point p on the outer wall is allowed when all four hold:
 *  1. Coronary clearance: p is at least CORONARY_CLEARANCE_MM from the wall of the LAD and of each diagonal.
 *  2. Wall thickness at p is at least MIN_WALL_MM.
 *  3. Clear entry line: the sheath's line runs from the target through p and on outward. Along it, out to
 *     ENTRY_LINE_MM past p, it stays BONE_CLEAR_MM from every rib, cartilage and the sternum, LUNG_CLEAR_MM from the
 *     lungs, and HEART_CLEAR_MM from every other heart part (so it does not come through the right ventricle). And it
 *     must cross the chest wall through an entry window: between two neighbouring left ribs, from the 4th intercostal
 *     space to the 7th (the brief's intercostal_4..7), passing within WINDOW_REACH_MM of both. A line that misses the
 *     ribs altogether would leave through the diaphragm, which this model does not have, so it is not counted as clear.
 *  4. Coaxial: the angle between that line and the target valve's axis is at most COAXIAL_MAX_DEG.
 * Rules 1, 2 and 4 are checked for every point; rule 3 only for points that pass the other three (it is the costly
 * one), and is null otherwise.
 */
import { add, angleDeg, dist, dot, PointGrid, scale, sub, unit, type V3 } from './geometry';
import type { ChestPart } from './chest';
import { distanceToVessel, type Coronaries } from './coronary';
import type { LeftVentricle } from './lv';

/** [ASSUMPTION] docs/ASSUMPTIONS.md row 1. */
export const CORONARY_CLEARANCE_MM = 10;
/** [ASSUMPTION] docs/ASSUMPTIONS.md row 2. */
export const MIN_WALL_MM = 8;
/** Half of an illustrative 8 mm sheath plus 1 mm, as the Apex plan uses (client/src/apex BONE_CLEAR_MM). */
export const BONE_CLEAR_MM = 5;
/** [ASSUMPTION] Lung clearance along the entry line, mm. */
export const LUNG_CLEAR_MM = 5;
/** [ASSUMPTION] Clearance from the other heart parts along the entry line, mm. */
export const HEART_CLEAR_MM = 2;
/** How far past the puncture the entry line is checked, mm: past the ribs, which lie 15 to 45 mm out. */
export const ENTRY_LINE_MM = 100;
/** The illustrative coaxial limit the Apex plan calls "fair" (client/src/apex COAXIAL_FAIR_DEG). docs/ASSUMPTIONS.md row 14. */
export const COAXIAL_MAX_DEG = 30;
/** The entry windows: the left intercostal spaces a transapical line may cross (the brief's intercostal_4..7). */
export const ENTRY_SPACES = [4, 5, 6, 7] as const;
/** A line "crosses" a space when its closest approach to the rib cage is within this of both ribs, mm. */
export const WINDOW_REACH_MM = 25;
/** Entry-line sampling step, mm. Smaller than every clearance above, so a crossing cannot slip between samples. */
export const STEP_MM = 1.5;

export interface Target {
  id: 'aortic_valve' | 'mitral_valve';
  label: string;
  /** Valve centre, case frame, mm. */
  centre: V3;
  /** Unit valve axis, pointing the way a transapical device crosses it (LV → aorta, LV → left atrium). */
  axis: V3;
}

export interface EntryLine {
  clear: boolean;
  /** Closest approach along the line, mm. A line is followed only until it breaks a clearance, so for a line that is
   *  not clear these are the closest approaches up to that point. */
  boneMm: number;
  lungMm: number;
  heartMm: number;
  /** What it came closest to, by part name. */
  nearestBone: string;
  /** The ribs either side where the line passes the rib cage, when it does (e.g. rib_left_5 and rib_left_6). */
  between: [string, string] | null;
  /** The intercostal space it crosses when that is an entry window (4 to 7), else null. */
  space: number | null;
}

export interface ZonePoint {
  /** Index into LeftVentricle.pts. */
  vertex: number;
  coronaryMm: number;
  wallMm: number;
  coaxialDeg: number;
  /** null when rules 1, 2 or 4 already ruled it out. */
  entry: EntryLine | null;
  allowed: boolean;
  /** The rules it fails: 'coronary', 'wall', 'entry', 'coaxial'. */
  fails: ('coronary' | 'wall' | 'entry' | 'coaxial')[];
}

export interface AccessZone {
  target: Target;
  rules: ZoneRules;
  /** Every n-th outer vertex was checked. */
  every: number;
  points: ZonePoint[];
  allowed: number;
  /** Counts of points failing each rule (a point can fail several). */
  failCounts: Record<'coronary' | 'wall' | 'entry' | 'coaxial', number>;
  /** The allowed point with the smallest coaxial angle, if any. */
  best: ZonePoint | null;
}

/** The three numeric rules a caller may change (tests do; the defaults are the constants above). */
export interface ZoneRules {
  coronaryClearanceMm: number;
  minWallMm: number;
  coaxialMaxDeg: number;
}
export const DEFAULT_RULES: ZoneRules = { coronaryClearanceMm: CORONARY_CLEARANCE_MM, minWallMm: MIN_WALL_MM, coaxialMaxDeg: COAXIAL_MAX_DEG };

export interface ZoneInputs {
  lv: LeftVentricle;
  coronaries: Coronaries;
  chest: ReadonlyMap<string, ChestPart>;
  /** Every other placed heart part (not the LV wall, not valve markers). */
  otherHeart: { name: string; pts: V3[] }[];
  /** Check every n-th outer vertex (1 = all). */
  every?: number;
  /** Check only these vertices (indices into LeftVentricle.pts), instead of every n-th. */
  only?: readonly number[];
  rules?: Partial<ZoneRules>;
}

export function grids(chest: ReadonlyMap<string, ChestPart>, otherHeart: { name: string; pts: V3[] }[]) {
  const named = (parts: { name: string; pts: V3[] }[]) => {
    const pts: V3[] = [];
    const owner: string[] = [];
    for (const p of parts) for (const q of p.pts) {
      pts.push(q);
      owner.push(p.name);
    }
    return { grid: new PointGrid(pts, 6), owner };
  };
  const all = [...chest.values()];
  return {
    bone: named(all.filter((p) => p.group !== 'lung')),
    lung: named(all.filter((p) => p.group === 'lung')),
    heart: named(otherHeart),
    ribs: all.filter((p) => p.group === 'rib').map((p) => ({ name: p.name, grid: new PointGrid(p.pts, 6) })),
  };
}

export function accessZone(target: Target, inputs: ZoneInputs): AccessZone {
  const { lv, coronaries } = inputs;
  const g = grids(inputs.chest, inputs.otherHeart);
  const vessels = [coronaries.lad, ...coronaries.diagonals];
  const step = Math.max(1, inputs.every ?? 1);
  const rules: ZoneRules = { ...DEFAULT_RULES, ...inputs.rules };
  const points: ZonePoint[] = [];
  const only = inputs.only ? new Set(inputs.only) : null;
  for (let k = 0; k < lv.outer.length; k += only ? 1 : step) {
    const vertex = lv.outer[k]!;
    if (only && !only.has(vertex)) continue;
    const p = lv.pts[vertex]!;
    const coronaryMm = Math.min(...vessels.map((v) => distanceToVessel(p, v)));
    const wallMm = lv.thicknessMm[k]!;
    const travel = unit(sub(target.centre, p));
    const coaxialDeg = angleDeg(travel, target.axis);
    const fails: ZonePoint['fails'] = [];
    if (coronaryMm < rules.coronaryClearanceMm) fails.push('coronary');
    if (wallMm < rules.minWallMm) fails.push('wall');
    if (coaxialDeg > rules.coaxialMaxDeg) fails.push('coaxial');
    let entry: EntryLine | null = null;
    if (fails.length === 0) {
      entry = entryLine(p, scale(travel, -1), g);
      if (!entry.clear) fails.push('entry');
    }
    points.push({ vertex, coronaryMm, wallMm, coaxialDeg, entry, allowed: fails.length === 0, fails });
  }
  const failCounts = { coronary: 0, wall: 0, entry: 0, coaxial: 0 };
  for (const z of points) for (const f of z.fails) failCounts[f]++;
  const allowed = points.filter((z) => z.allowed);
  const best = allowed.reduce<ZonePoint | null>((b, z) => (b === null || z.coaxialDeg < b.coaxialDeg ? z : b), null);
  return { target, rules, every: step, points, allowed: allowed.length, failCounts, best };
}

/** March the entry line outward from p (the sheath's line, away from the target). */
export function entryLine(p: V3, outward: V3, g: ReturnType<typeof grids>): EntryLine {
  let boneMm = Infinity;
  let lungMm = Infinity;
  let heartMm = Infinity;
  let nearestBone = '';
  let closestAt: V3 | null = null;
  // Skip the first few millimetres for the heart check: the line starts on the LV's own wall, next to the RV's.
  for (let s = STEP_MM; s <= ENTRY_LINE_MM; s += STEP_MM) {
    const q = add(p, scale(outward, s));
    const b = g.bone.grid.nearest(q, 20);
    if (b.d < boneMm) {
      boneMm = b.d;
      nearestBone = g.bone.owner[b.at] ?? '';
      closestAt = q;
    }
    // Only whether these come within their clearance matters, so a short search radius will do.
    const l = g.lung.grid.nearest(q, 2 * LUNG_CLEAR_MM);
    if (l.d < lungMm) lungMm = l.d;
    if (s >= 4) {
      const h = g.heart.grid.nearest(q, 2 * HEART_CLEAR_MM + 4);
      if (h.d < heartMm) heartMm = h.d;
    }
    if (boneMm < BONE_CLEAR_MM || lungMm < LUNG_CLEAR_MM || heartMm < HEART_CLEAR_MM) break;
  }
  // Where it passes the rib cage: the two nearest distinct ribs at its closest approach to bone.
  let between: [string, string] | null = null;
  let space: number | null = null;
  if (closestAt) {
    const near = g.ribs
      .map((r) => ({ name: r.name, d: r.grid.nearest(closestAt!, WINDOW_REACH_MM + 15).d }))
      .filter((r) => Number.isFinite(r.d))
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    if (near.length === 2) between = near.map((r) => r.name).sort((a, b) => ribNumber(a) - ribNumber(b)) as [string, string];
    if (between && near.every((r) => r.d <= WINDOW_REACH_MM)) {
      const [a, b] = between;
      const n = ribNumber(a);
      if (a.startsWith('rib_left_') && b.startsWith('rib_left_') && ribNumber(b) === n + 1 && (ENTRY_SPACES as readonly number[]).includes(n)) space = n;
    }
  }
  return { clear: boneMm >= BONE_CLEAR_MM && lungMm >= LUNG_CLEAR_MM && heartMm >= HEART_CLEAR_MM && space !== null, boneMm, lungMm, heartMm, nearestBone, between, space };
}

const ribNumber = (name: string): number => Number(/_(\d+)$/.exec(name)?.[1] ?? 0);

/** "the 5th intercostal space" for ribs n and n+1 on one side; otherwise names the two ribs. */
export function intercostalLabel(between: [string, string] | null): string {
  if (!between) return 'no rib nearby';
  const [a, b] = between;
  const side = (n: string) => (n.includes('_left_') ? 'left' : 'right');
  if (side(a) === side(b) && ribNumber(b) === ribNumber(a) + 1) {
    const n = ribNumber(a);
    const suffix = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
    return `${side(a)} ${n}${suffix} intercostal space`;
  }
  return `between ${a} and ${b}`;
}

/** A valve's axis from its marker's points: the plane's normal, turned to point toward `toward`. */
export function valveAxis(marker: V3[], toward: V3, fitPlane: (pts: readonly V3[]) => { centre: V3; normal: V3 }): Target['axis'] {
  const { centre, normal } = fitPlane(marker);
  return dot(normal, sub(toward, centre)) >= 0 ? normal : scale(normal, -1);
}

export { dist };
