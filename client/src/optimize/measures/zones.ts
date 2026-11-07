/**
 * Risk-zone overlap and proximity clearance (spec §4.2). The clearance is centerline to
 * centerline, with no radius subtracted (DECISIONS.md). A zone's geometry is its own edge's
 * centerline between from_mm and to_mm.
 */

import { cumulativeArclength, dot, norm, pointAt, sub, type Point3, type Polyline } from './polyline';

/** The part of a polyline between arc lengths fromMm and toMm (clamped to [0, L], ordered). */
export function subPolyline(points: Polyline, fromMm: number, toMm: number): Point3[] {
  const cs = cumulativeArclength(points);
  const L = cs[cs.length - 1]!;
  let lo = Math.min(fromMm, toMm);
  let hi = Math.max(fromMm, toMm);
  lo = Math.min(Math.max(lo, 0), L);
  hi = Math.min(Math.max(hi, 0), L);
  const out: Point3[] = [pointAt(points, lo, cs)];
  for (let i = 0; i < points.length; i++) {
    if (cs[i]! > lo && cs[i]! < hi) out.push(points[i]!);
  }
  out.push(pointAt(points, hi, cs));
  return out;
}

/** Whether a zone's [from, to] span (any order) overlaps an edge's [0, L]. */
export function zoneOverlapsEdge(edgeLengthMm: number, fromMm: number, toMm: number): boolean {
  const lo = Math.min(fromMm, toMm);
  const hi = Math.max(fromMm, toMm);
  return hi >= 0 && lo <= edgeLengthMm;
}

const EPS = 1e-12;
const clamp01 = (x: number): number => Math.min(Math.max(x, 0), 1);

/** Exact minimum distance between segments [a0, a1] and [b0, b1] (same branches as the NumPy version). */
export function segmentDistance(a0: Point3, a1: Point3, b0: Point3, b1: Point3): number {
  const d1 = sub(a1, a0);
  const d2 = sub(b1, b0);
  const r = sub(a0, b0);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  const c = dot(d1, r);
  const b = dot(d1, d2);
  const denom = a * e - b * b;
  const safeA = a > EPS ? a : 1;

  let s = denom > EPS ? clamp01((b * f - c * e) / denom) : 0;
  if (!(e > EPS)) s = clamp01(-c / safeA);
  let t = e > EPS ? (b * s + f) / e : 0;

  if (t < 0) {
    t = 0;
    s = clamp01(-c / safeA);
  } else if (t > 1) {
    t = 1;
    s = clamp01((b - c) / safeA);
  }
  if (!(a > EPS)) s = 0;

  const pa: Point3 = [a0[0] + d1[0] * s, a0[1] + d1[1] * s, a0[2] + d1[2] * s];
  const pb: Point3 = [b0[0] + d2[0] * t, b0[1] + d2[1] * t, b0[2] + d2[2] * t];
  return norm(sub(pa, pb));
}

/** Minimum Euclidean distance between two polylines (exact, segment to segment). */
export function polylineDistance(p: Polyline, q: Polyline): number {
  if (p.length === 0 || q.length === 0) throw new Error('polylineDistance: empty polyline');
  const P = p.length === 1 ? [p[0]!, p[0]!] : p;
  const Q = q.length === 1 ? [q[0]!, q[0]!] : q;
  let best = Infinity;
  for (let i = 1; i < P.length; i++) {
    for (let j = 1; j < Q.length; j++) {
      const d = segmentDistance(P[i - 1]!, P[i]!, Q[j - 1]!, Q[j]!);
      if (d < best) best = d;
    }
  }
  return best;
}

/** Minimum clearance from an edge's centerline to any proximity-zone polyline; null if there are none. */
export function proximityClearanceMm(edgePoints: Polyline, zoneLines: ReadonlyArray<Polyline>): number | null {
  let best: number | null = null;
  for (const z of zoneLines) {
    const d = polylineDistance(edgePoints, z);
    best = best === null ? d : Math.min(best, d);
  }
  return best;
}
