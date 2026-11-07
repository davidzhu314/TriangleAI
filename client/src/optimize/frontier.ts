/**
 * Pareto frontier and labels (spec §4.7).
 *
 * Route A is dominated when some route B is at least as good on every measure and strictly better
 * on one. Measures absent from either cost vector (the simulated ones, without real recorded runs)
 * are skipped. Higher is better only where MEASURE_LOWER_IS_BETTER says so (narrowest radius,
 * success rate).
 */

import { MEASURE_LOWER_IS_BETTER, type CostVector, type MeasureKey, type Route, type RouteLabel } from '../contracts';

export const MEASURE_KEYS = Object.keys(MEASURE_LOWER_IS_BETTER) as MeasureKey[];

/** Values within this relative tolerance count as equal (float noise from geometry). */
const EQ_REL = 1e-9;

function cmp(k: MeasureKey, a: number, b: number): -1 | 0 | 1 {
  const tol = EQ_REL * Math.max(1, Math.abs(a), Math.abs(b));
  if (Math.abs(a - b) <= tol) return 0;
  const better = MEASURE_LOWER_IS_BETTER[k] ? a < b : a > b;
  return better ? -1 : 1;
}

/** True when a dominates b. */
export function dominates(a: CostVector, b: CostVector): boolean {
  let strictly = false;
  for (const k of MEASURE_KEYS) {
    const x = a[k];
    const y = b[k];
    if (x === undefined || y === undefined) continue;
    const c = cmp(k, x, y);
    if (c > 0) return false;
    if (c < 0) strictly = true;
  }
  return strictly;
}

/** The non-dominated subset, in input order. O(n²), fine for the ≤ 150 routes per entry. */
export function paretoFrontier<T extends { cost: CostVector }>(routes: readonly T[]): T[] {
  return routes.filter((r) => !routes.some((o) => o !== r && dominates(o.cost, r.cost)));
}

/** Which measure each label rewards. The two simulated labels need real recorded runs. */
export const LABEL_MEASURE: Readonly<Record<RouteLabel, MeasureKey>> = {
  shortest: 'lengthM',
  gentlest: 'sharpestTurnDeg',
  least_radiation: 'estFluoroS',
  widest: 'narrowestRadiusM',
  farthest_from_risk: 'proximityPenalty',
  lowest_force: 'simPeakForceN',
  most_reliable: 'simSuccessRate',
};

/**
 * Labels for each frontier route: a route gets a label when it is best (ties included) on that
 * label's measure, and only when the frontier routes differ on it. A label every route shares says
 * nothing.
 */
export function frontierLabels(routes: readonly Route[]): RouteLabel[][] {
  const out: RouteLabel[][] = routes.map(() => []);
  for (const [label, k] of Object.entries(LABEL_MEASURE) as [RouteLabel, MeasureKey][]) {
    const vals = routes.map((r) => r.cost[k]);
    if (vals.some((v) => v === undefined) || vals.length === 0) continue;
    const nums = vals as number[];
    let best = nums[0]!;
    for (const v of nums) if (cmp(k, v, best) < 0) best = v;
    if (nums.every((v) => cmp(k, v, best) === 0)) continue;
    nums.forEach((v, i) => {
      if (cmp(k, v, best) === 0) out[i]!.push(label);
    });
  }
  return out;
}
