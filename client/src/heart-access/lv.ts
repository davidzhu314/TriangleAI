/**
 * The left ventricle of a placed heart: its axis, its apex, its outer (epicardial) and inner (endocardial) faces, and
 * the wall thickness at every outer vertex.
 *
 * The template's `lv_myocardium` is one closed surface: the outer wall, the inner wall facing the cavity, and the
 * septum's right-ventricle side, joined at the base. A vertex is "inner" when its normal points back toward the LV's
 * long axis, "outer" otherwise. Wall thickness at an outer vertex is the distance to the nearest inner vertex: the
 * shortest way through the wall (the inner face is sampled about every millimetre, so this is within about half a
 * millimetre of the true shortest distance).
 */
import { add, cross, dist, dot, norm, PointGrid, scale, sub, unit, type V3 } from './geometry';
import { centroid, type MeshPart } from './heart';

export interface LeftVentricle {
  /** Centre of the base: the mean of the mitral and aortic valve centres. */
  base: V3;
  /** The outer vertex farthest from the mitral valve centre. */
  apex: V3;
  /** Unit vector from base to apex. */
  axis: V3;
  /** Base-to-apex length, mm. */
  lengthMm: number;
  /** All LV wall vertices (case frame, mm) and per-vertex unit normals pointing out of the muscle. */
  pts: V3[];
  normals: V3[];
  /** Indices into pts. */
  outer: number[];
  inner: number[];
  /** Wall thickness at each outer vertex (same order as `outer`), mm. */
  thicknessMm: Float64Array;
}

/** Area-weighted vertex normals; flipped as a whole if the surface's signed volume says its winding points inward. */
export function vertexNormals(part: MeshPart): V3[] {
  const n: V3[] = part.pts.map(() => [0, 0, 0]);
  let vol = 0;
  for (let k = 0; k < part.tris.length; k += 3) {
    const ia = part.tris[k]!;
    const ib = part.tris[k + 1]!;
    const ic = part.tris[k + 2]!;
    const a = part.pts[ia]!;
    const b = part.pts[ib]!;
    const c = part.pts[ic]!;
    const fn = cross(sub(b, a), sub(c, a));
    for (const i of [ia, ib, ic]) n[i] = add(n[i]!, fn);
    vol += dot(a, cross(b, c));
  }
  const s = vol < 0 ? -1 : 1;
  return n.map((v) => scale(unit(v), s));
}

/**
 * Split the LV wall and measure it.
 * @param lv     the placed `lv_myocardium`
 * @param mvCentre, avCentre  the placed mitral and aortic valve centres
 */
export function leftVentricle(lv: MeshPart, mvCentre: V3, avCentre: V3): LeftVentricle {
  const normals = vertexNormals(lv);
  const base: V3 = scale(add(mvCentre, avCentre), 0.5);
  const apex0 = lv.pts.reduce((best, p) => (dist(p, mvCentre) > dist(best, mvCentre) ? p : best));
  const axis = unit(sub(apex0, base));
  const lengthMm = dist(apex0, base);
  // The point on the axis a vertex is judged from: its foot on the axis, but never closer than 25 mm to the apex,
  // so near the apex "back toward the axis" still means back toward the cavity.
  const foot = (p: V3): V3 => {
    const t = Math.max(0, Math.min(lengthMm - 25, dot(sub(p, base), axis)));
    return add(base, scale(axis, t));
  };
  const outer: number[] = [];
  const inner: number[] = [];
  lv.pts.forEach((p, i) => (dot(normals[i]!, sub(p, foot(p))) >= 0 ? outer : inner).push(i));
  const innerGrid = new PointGrid(inner.map((i) => lv.pts[i]!), 3);
  const thicknessMm = Float64Array.from(outer, (i) => innerGrid.nearest(lv.pts[i]!, 60).d);
  // The apex is an outer vertex: the outer one farthest from the mitral valve.
  const apex = outer.map((i) => lv.pts[i]!).reduce((best, p) => (dist(p, mvCentre) > dist(best, mvCentre) ? p : best));
  return { base, apex, axis, lengthMm, pts: lv.pts, normals, outer, inner, thicknessMm };
}

/** A unit vector perpendicular to `v`. */
export function perpendicular(v: V3): V3 {
  const t: V3 = Math.abs(v[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  return unit(cross(v, t));
}

/** Plane through points by least squares: centre and unit normal (the direction of least spread). */
export function fitPlane(pts: readonly V3[]): { centre: V3; normal: V3 } {
  const c = centroid(pts);
  const C = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const p of pts) {
    const d = sub(p, c);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[3 * i + j]! += d[i]! * d[j]!;
  }
  // Power iteration on (trace·I − C) finds C's smallest eigenvector.
  const tr = C[0]! + C[4]! + C[8]!;
  const M = C.map((v, k) => (k % 4 === 0 ? tr - v : -v));
  let v: V3 = [0.3, 0.5, 0.8];
  for (let it = 0; it < 200; it++) {
    const w: V3 = [M[0]! * v[0] + M[1]! * v[1] + M[2]! * v[2], M[3]! * v[0] + M[4]! * v[1] + M[5]! * v[2], M[6]! * v[0] + M[7]! * v[1] + M[8]! * v[2]];
    const l = norm(w);
    if (l === 0) break;
    v = [w[0] / l, w[1] / l, w[2] / l];
  }
  return { centre: c, normal: v };
}
