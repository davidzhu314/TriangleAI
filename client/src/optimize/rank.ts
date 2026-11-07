/**
 * Weighted ranking for display (spec §4.8). Each measure is min–max normalised to 0..1 across the
 * candidate set (the feasible candidates; all of them if none is feasible), with "higher is better"
 * measures flipped so 0 is always best. Then S(route) = Σ w_k ĉ_k, and lower is better.
 *
 * Weights change the order, never feasibility. They are normalised to sum to 1, so slider
 * rounding is harmless. If every weight is 0, every S is 0 and the order falls back to route id.
 * A measure with no spread (max = min) adds 0.
 */

import { MEASURE_LOWER_IS_BETTER, type CostVector, type Frontier, type MeasureKey, type Ranking, type Route, type Weights } from '../contracts';
import { MEASURE_KEYS } from './frontier';

export type MeasureRanges = Partial<Record<MeasureKey, { min: number; max: number }>>;

export function measureRanges(candidates: readonly Route[]): MeasureRanges {
  const pool = candidates.some((r) => r.feasible) ? candidates.filter((r) => r.feasible) : candidates;
  const out: MeasureRanges = {};
  for (const k of MEASURE_KEYS) {
    let min = Infinity;
    let max = -Infinity;
    for (const r of pool) {
      const v = r.cost[k];
      if (v === undefined) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (min <= max) out[k] = { min, max };
  }
  return out;
}

/** Validate and normalise weights to sum 1. Throws on negative or non-finite weights. */
export function normaliseWeights(weights: Weights): Weights {
  let sum = 0;
  for (const [k, w] of Object.entries(weights) as [MeasureKey, number | undefined][]) {
    if (w === undefined) continue;
    if (!Number.isFinite(w) || w < 0) throw new RangeError(`weight for ${k} must be a finite number ≥ 0, got ${w}`);
    sum += w;
  }
  const out: Weights = {};
  if (sum === 0) return out;
  for (const [k, w] of Object.entries(weights) as [MeasureKey, number | undefined][]) if (w) out[k] = w / sum;
  return out;
}

/** Normalised cost ĉ_k in 0..1 (0 best). 0 when the measure has no spread or is absent. */
export function normalisedCost(cost: CostVector, k: MeasureKey, ranges: MeasureRanges): number {
  const v = cost[k];
  const r = ranges[k];
  if (v === undefined || !r || r.max - r.min <= 0) return 0;
  const t = (v - r.min) / (r.max - r.min);
  const c = MEASURE_LOWER_IS_BETTER[k] ? t : 1 - t;
  return Math.min(1, Math.max(0, c));
}

/** S(route) = Σ w_k ĉ_k with weights already normalised. */
export function weightedScore(cost: CostVector, ranges: MeasureRanges, weights: Weights): number {
  let s = 0;
  for (const [k, w] of Object.entries(weights) as [MeasureKey, number][]) s += w * normalisedCost(cost, k, ranges);
  return s;
}

export function rankRoutes(routes: readonly Route[], ranges: MeasureRanges, weights: Weights): Ranking {
  const w = normaliseWeights(weights);
  const order = routes
    .map((r) => ({ routeId: r.id, s: weightedScore(r.cost, ranges, w) }))
    .sort((a, b) => a.s - b.s || (a.routeId < b.routeId ? -1 : a.routeId > b.routeId ? 1 : 0));
  return { weights: w, order };
}

/**
 * Re-ranks a frontier for each slider move. The ranges are computed once, so each call only
 * re-weights.
 */
export function createRanker(frontier: Frontier): (weights: Weights) => Ranking {
  const ranges = measureRanges(frontier.candidates);
  return (weights) => rankRoutes(frontier.routes, ranges, weights);
}
