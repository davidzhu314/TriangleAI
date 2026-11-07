/**
 * Route-level turning (DECISIONS.md, "Route-level turning"). The edges are joined into one
 * polyline in travel order, and the same 5 mm-window algorithm runs on it, so windows span
 * branch points. Junction arc lengths are added to the sample grid, which makes a corner's
 * peak exact wherever the grid falls.
 *
 * A corner of deflection δ between two straight legs, each at least w long, gives
 * Θmax = ΘΣ = δ.
 */

import { dist, lengthMm, type Point3, type Polyline } from './polyline';
import { SAMPLE_STEP_MM, turningMeasures, WINDOW_MM, type TurningMeasures } from './turning';

/** Endpoints closer than this are one shared junction point. */
export const JOIN_EPS_MM = 1e-6;

export interface JoinedRoute {
  points: Point3[];
  /** Arc length, along the joined polyline, where each edge after the first starts. */
  junctionS: number[];
}

/**
 * Join edges, each walked forward or (when its flag is set) backward. A shared junction point
 * appears once; a larger gap is kept as a straight connecting segment.
 */
export function joinRoute(polylines: ReadonlyArray<Polyline>, reversed: readonly boolean[]): JoinedRoute {
  if (polylines.length !== reversed.length) throw new Error('joinRoute: one reversed flag per edge');
  if (polylines.length === 0) return { points: [], junctionS: [] };
  const parts = polylines.map((p, i) => (reversed[i] ? [...p].reverse() : [...p]));
  const points: Point3[] = [...parts[0]!];
  const junctionS: number[] = [];
  let joinedLen = lengthMm(points);
  for (let k = 1; k < parts.length; k++) {
    let part = parts[k]!;
    const prevEnd = points[points.length - 1]!;
    const first = part[0]!;
    const gap = dist(first, prevEnd);
    if (gap <= JOIN_EPS_MM) {
      junctionS.push(joinedLen);
      part = part.slice(1);
    } else {
      junctionS.push(joinedLen + gap);
    }
    // extend the running length exactly as the joined polyline's own segment sum
    let last = prevEnd;
    for (const p of part) {
      joinedLen += dist(last, p);
      last = p;
    }
    points.push(...part);
  }
  return { points, junctionS };
}

export function routeTurningMeasures(
  polylines: ReadonlyArray<Polyline>,
  reversed: readonly boolean[],
  windowMm: number = WINDOW_MM,
  stepMm: number = SAMPLE_STEP_MM,
): TurningMeasures {
  const { points, junctionS } = joinRoute(polylines, reversed);
  return turningMeasures(points, windowMm, stepMm, junctionS);
}

export function routeLengthMm(polylines: ReadonlyArray<Polyline>, reversed: readonly boolean[]): number {
  return lengthMm(joinRoute(polylines, reversed).points);
}
