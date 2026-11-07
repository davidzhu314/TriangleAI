/**
 * Centripetal Catmull–Rom splines and arc-length resampling, for the generator (spec §3.4).
 * Arithmetic and Math.sqrt only (no trig), so output is stable across Node versions. The curve
 * passes through every control point; end tangents point along the first and last control legs.
 */
import type { Vec3 } from '../../client/src/contracts/events';

const SAMPLES_PER_SEGMENT = 64;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dist = (a: Vec3, b: Vec3) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
const lerp = (a: Vec3, b: Vec3, ta: number, tb: number, t: number): Vec3 => {
  if (tb === ta) return a;
  const u = (t - ta) / (tb - ta);
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
};

/** Dense polyline through `control` (at least two points). */
export function catmullRom(control: Vec3[]): Vec3[] {
  if (control.length < 2) throw new Error('a spline needs at least two control points');
  const n = control.length;
  const first = control[0]!;
  const last = control[n - 1]!;
  // Phantom end points: reflect the first and last legs.
  const pts: Vec3[] = [sub(first, sub(control[1]!, first)), ...control, sub(last, sub(control[n - 2]!, last))];
  const out: Vec3[] = [first];
  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[i + 2]!;
    const t0 = 0;
    const t1 = t0 + Math.sqrt(dist(p0, p1));
    const t2 = t1 + Math.sqrt(dist(p1, p2));
    const t3 = t2 + Math.sqrt(dist(p2, p3));
    for (let k = 1; k <= SAMPLES_PER_SEGMENT; k++) {
      const t = t1 + ((t2 - t1) * k) / SAMPLES_PER_SEGMENT;
      const a1 = lerp(p0, p1, t0, t1, t);
      const a2 = lerp(p1, p2, t1, t2, t);
      const a3 = lerp(p2, p3, t2, t3, t);
      const b1 = lerp(a1, a2, t0, t2, t);
      const b2 = lerp(a2, a3, t1, t3, t);
      out.push(k === SAMPLES_PER_SEGMENT ? p2 : lerp(b1, b2, t1, t2, t));
    }
  }
  return out;
}

export function cumulative(points: Vec3[]): number[] {
  const cs = [0];
  for (let i = 1; i < points.length; i++) cs.push(cs[i - 1]! + dist(points[i - 1]!, points[i]!));
  return cs;
}

/** The point at arc length `s` along a dense polyline with cumulative lengths `cs`. */
export function pointAt(points: Vec3[], cs: number[], s: number): Vec3 {
  if (s <= 0) return points[0]!;
  const L = cs[cs.length - 1]!;
  if (s >= L) return points[points.length - 1]!;
  let lo = 0;
  let hi = cs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cs[mid]! <= s) lo = mid;
    else hi = mid;
  }
  return lerp(points[lo]!, points[hi]!, cs[lo]!, cs[hi]!, s);
}

/** Resample arc lengths a..b of a dense polyline into round(b − a) equal steps (about 1 mm). */
export function resample(points: Vec3[], cs: number[], a: number, b: number): Vec3[] {
  const n = Math.max(2, Math.round(b - a));
  const out: Vec3[] = [];
  for (let k = 0; k <= n; k++) out.push(pointAt(points, cs, a + ((b - a) * k) / n));
  return out;
}
