/**
 * Generated coronary arteries and pericardium for a placed heart. [ASSUMPTION] Nothing here is segmented: the template
 * has no coronaries, so the LAD is a tube laid along the anterior interventricular groove (where the right ventricle's
 * free wall meets the LV's outer wall on the front), carried on toward the apex, with two diagonal branches over the
 * anterolateral wall. docs/ASSUMPTIONS.md rows 3 and 4. Replace with coronaries segmented from a CTA when one exists.
 */
import { add, cross, dist, dot, norm, PointGrid, scale, sub, unit, type V3 } from './geometry';
import type { MeshPart } from './heart';
import type { LeftVentricle } from './lv';

/** [ASSUMPTION] Tube radii, mm: a 3 mm LAD (the brief's value) and 2 mm diagonals. */
export const LAD_RADIUS_MM = 1.5;
export const DIAGONAL_RADIUS_MM = 1.0;
/** [ASSUMPTION] Where the generated LAD stops, mm short of the apex. */
export const LAD_STOP_SHORT_OF_APEX_MM = 15;
/** How close the LV's outer wall and the RV free wall must be to count as their junction (the groove), mm. */
export const GROOVE_MM = 4;
/** [ASSUMPTION] Diagonal branches: where they leave the LAD (share of its length) and how long they are, mm. */
export const DIAGONALS = [
  { at: 0.35, lengthMm: 45 },
  { at: 0.6, lengthMm: 35 },
] as const;
/** [ASSUMPTION] Pericardium: the LV's outer wall offset outward by this much, mm. */
export const PERICARDIUM_OFFSET_MM = 3;

export interface Vessel {
  name: string;
  /** Centerline, case frame, mm, about 2 mm apart. */
  line: V3[];
  radiusMm: number;
  source: 'generated';
}

export interface Coronaries {
  lad: Vessel;
  diagonals: Vessel[];
  /** The groove points the LAD was laid through, for review. */
  groove: V3[];
}

function smoothLine(line: V3[], passes = 3): V3[] {
  let cur = line;
  for (let k = 0; k < passes; k++) cur = cur.map((p, i) => (i === 0 || i === cur.length - 1 ? p : scale(add(add(cur[i - 1]!, p), cur[i + 1]!), 1 / 3)));
  return cur;
}

/** Walk over the outer wall: step `stepMm` along `dir`, snapping each step to the nearest outer-wall vertex. */
function walk(start: V3, dir: (p: V3) => V3, stepMm: number, steps: number, surface: PointGrid, stop: (p: V3) => boolean): V3[] {
  const out: V3[] = [start];
  let p = start;
  for (let s = 0; s < steps; s++) {
    const q = add(p, scale(dir(p), stepMm));
    const hit = surface.nearest(q, 15);
    if (hit.at < 0) break;
    const next = surface.pts[hit.at]!;
    if (dist(next, p) < 0.3 * stepMm) break; // stuck
    out.push(next);
    p = next;
    if (stop(p)) break;
  }
  return out;
}

export function generateCoronaries(lv: LeftVentricle, rvWall: MeshPart): Coronaries {
  const outerPts = lv.outer.map((i) => lv.pts[i]!);
  const surface = new PointGrid(outerPts, 4);
  const rv = new PointGrid(rvWall.pts, 4);
  const rvCentre = rvWall.pts.reduce<V3>((s, p) => add(s, p), [0, 0, 0]).map((v) => v / rvWall.pts.length) as V3;
  const t = (p: V3) => dot(sub(p, lv.base), lv.axis);
  const radial = (p: V3) => {
    const r = sub(p, add(lv.base, scale(lv.axis, t(p))));
    return norm(r) > 0 ? unit(r) : r;
  };

  // The junction band, front half only (radial direction toward the patient's front, +y in RAS).
  const groove = outerPts.filter((p) => rv.nearest(p, GROOVE_MM).at >= 0 && radial(p)[1] > 0.2);
  // Ordered base to apex: mean position in 3 mm bins along the axis.
  const bins = new Map<number, V3[]>();
  for (const p of groove) {
    const k = Math.floor(t(p) / 3);
    const list = bins.get(k);
    if (list) list.push(p);
    else bins.set(k, [p]);
  }
  const keys = [...bins.keys()].sort((a, b) => a - b);
  let line: V3[] = keys.map((k) => {
    const list = bins.get(k)!;
    const m = list.reduce<V3>((s, p) => add(s, p), [0, 0, 0]);
    const c = scale(m, 1 / list.length);
    return surface.pts[surface.nearest(c, 20).at]!;
  });
  // Carry it on over the wall toward the apex, stopping short of it.
  const tail = walk(line[line.length - 1]!, (p) => unit(sub(lv.apex, p)), 2, 60, surface, (p) => dist(p, lv.apex) <= LAD_STOP_SHORT_OF_APEX_MM);
  line = smoothLine([...line, ...tail.slice(1)]);
  // The groove itself can run nearer the apex than the stop; the generated LAD ends at the stop either way.
  const cut = line.findIndex((p) => dist(p, lv.apex) < LAD_STOP_SHORT_OF_APEX_MM);
  if (cut > 1) line = line.slice(0, cut);
  const lad: Vessel = { name: 'lad', line, radiusMm: LAD_RADIUS_MM, source: 'generated' };

  // Diagonals: off the LAD, away from the right ventricle, slanting toward the apex.
  const length = line.reduce((s, p, i) => (i ? s + dist(p, line[i - 1]!) : 0), 0);
  const pointAt = (share: number): { p: V3; tangent: V3 } => {
    let left = share * length;
    for (let i = 1; i < line.length; i++) {
      const l = dist(line[i]!, line[i - 1]!);
      if (l >= left) return { p: line[i]!, tangent: unit(sub(line[Math.min(line.length - 1, i + 1)]!, line[i - 1]!)) };
      left -= l;
    }
    return { p: line[line.length - 1]!, tangent: unit(sub(line[line.length - 1]!, line[line.length - 2]!)) };
  };
  const diagonals = DIAGONALS.map((d, k) => {
    const { p, tangent } = pointAt(d.at);
    const n = radial(p);
    let side = unit(cross(n, tangent));
    if (dot(side, sub(rvCentre, p)) > 0) side = scale(side, -1);
    const dir = (q: V3): V3 => {
      const nq = radial(q);
      const want = add(scale(side, 0.8), scale(unit(sub(lv.apex, q)), 0.6));
      return unit(sub(want, scale(nq, dot(want, nq))));
    };
    const steps = Math.ceil(d.lengthMm / 2);
    return { name: `diagonal_${k + 1}`, line: smoothLine(walk(p, dir, 2, steps, surface, () => false)), radiusMm: DIAGONAL_RADIUS_MM, source: 'generated' as const };
  });
  return { lad, diagonals, groove };
}

/** Shortest distance from a point to a vessel's wall, mm (centerline distance minus radius; negative inside). */
export function distanceToVessel(p: V3, v: Vessel): number {
  let best = Infinity;
  for (let i = 1; i < v.line.length; i++) {
    const a = v.line[i - 1]!;
    const b = v.line[i]!;
    const ab = sub(b, a);
    const l2 = dot(ab, ab);
    const s = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)) : 0;
    best = Math.min(best, dist(p, add(a, scale(ab, s))));
  }
  return best - v.radiusMm;
}

/** [ASSUMPTION] The pericardium over the LV: each outer-wall vertex moved out along its normal. */
export function pericardium(lv: LeftVentricle): V3[] {
  return lv.outer.map((i) => add(lv.pts[i]!, scale(lv.normals[i]!, PERICARDIUM_OFFSET_MM)));
}
