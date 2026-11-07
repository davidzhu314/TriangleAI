/**
 * Polyline basics for the spec §4.2 measures. A port of tests/crosscheck/numpy_measures.py
 * that follows the algorithm in tests/crosscheck/README.md exactly.
 *
 * Plain arrays, no contract types. These functions don't care about units; the window and epsilon
 * constants are in millimetres, matching the case files.
 */

export type Point3 = readonly [number, number, number];
export type Polyline = ReadonlyArray<Point3>;

/** Cumulative arc length at each vertex; [0] for a single point, [] for none. */
export function cumulativeArclength(points: Polyline): Float64Array {
  const n = points.length;
  const cs = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    cs[i] = cs[i - 1]! + dist(points[i - 1]!, points[i]!);
  }
  return cs;
}

/** L = Σ ‖pᵢ − pᵢ₋₁‖. */
export function lengthMm(points: Polyline): number {
  const cs = cumulativeArclength(points);
  return cs.length ? cs[cs.length - 1]! : 0;
}

/**
 * Position at arc length s, clamped to [0, L], by linear interpolation along the polyline.
 * Same semantics as numpy.interp on the cumulative arc length: it uses the last vertex j with
 * cs[j] ≤ s, so zero-length segments are never interpolated across.
 */
export function pointAt(points: Polyline, s: number, cs: Float64Array = cumulativeArclength(points)): Point3 {
  const n = points.length;
  if (n === 0) throw new Error('pointAt: empty polyline');
  const L = cs[n - 1]!;
  const x = Math.min(Math.max(s, 0), L);
  if (x >= L) return points[n - 1]!;
  // largest j with cs[j] <= x (binary search)
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cs[mid]! <= x) lo = mid;
    else hi = mid;
  }
  const j = lo;
  const p = points[j]!;
  const q = points[j + 1]!;
  const t = (x - cs[j]!) / (cs[j + 1]! - cs[j]!);
  return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
}

export function sub(a: Point3, b: Point3): Point3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function dot(a: Point3, b: Point3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Point3, b: Point3): Point3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function norm(a: Point3): number {
  return Math.sqrt(dot(a, a));
}

export function dist(a: Point3, b: Point3): number {
  return norm(sub(a, b));
}

/** Unsigned angle between u and v in radians, atan2(‖u×v‖, u·v); 0 if either is (near) zero length. */
export function angleBetween(u: Point3, v: Point3): number {
  const nu = norm(u);
  const nv = norm(v);
  if (!(nu > 1e-12 && nv > 1e-12)) return 0;
  const c = Math.min(Math.max(dot(u, v) / (nu * nv), -1), 1);
  const s = norm(cross(u, v)) / (nu * nv);
  return Math.atan2(s, c);
}
