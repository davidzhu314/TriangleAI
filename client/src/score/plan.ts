/**
 * Plan score (spec §6.1). Checks run in order and the first failing one caps the score:
 * 1. feasible? (no → 0)  2. heavy crossings above the minimum? (cap 40)  3. on the frontier? (cap 80)
 * 4. regret at the player's own weights. score = min(cap, 100·(1 − min(1, R/Rmax))).
 *
 * S is V3's normalised weighted cost (§4.8): the same `measureRanges` over the candidates and the
 * same `weightedScore`. R = S(player) − min S over the frontier routes; Rmax = max S over feasible
 * candidates − that min (DECISIONS.md, "Plan score as implemented").
 */

import type { CostVector, Frontier, MeasureKey, NoSafeRoute, OptimizeResult, PlanScore, Route, Weights } from '../contracts';
import { dominates, MEASURE_KEYS } from '../optimize/frontier';
import { measureRanges, normalisedCost, normaliseWeights, rankRoutes, weightedScore, type MeasureRanges } from '../optimize/rank';
import { PLAN_CAPS } from './constants';

/**
 * Regrets this close to zero are floating-point noise, not a real difference: S is a sum of
 * normalised costs in 0..1, so a true gap is many orders of magnitude larger. Two tied routes once
 * gave R = Rmax = 5.6e-17, and R/Rmax = 1 scored a best-possible plan 0 (DECISIONS.md, "Regret noise").
 */
export const REGRET_EPS = 1e-9;
const snap = (x: number) => (Math.abs(x) <= REGRET_EPS ? 0 : x);

/** 100·(1 − min(1, R/Rmax)); 100 when Rmax is 0 (or noise). */
export function regretScore(regret: number, regretMax: number): number {
  if (snap(regretMax) <= 0) return 100;
  return 100 * (1 - Math.min(1, Math.max(0, snap(regret)) / regretMax));
}

/** The measure with the largest w_k·(ĉ_k(player) − ĉ_k(best)), when that is above 0. Ties go to measure order. */
export function topContributor(
  player: Route,
  best: CostVector,
  ranges: MeasureRanges,
  weights: Weights,
): PlanScore['topContributor'] {
  let bestK: MeasureKey | null = null;
  let bestC = 0;
  for (const k of MEASURE_KEYS) {
    const w = weights[k];
    if (!w || player.cost[k] === undefined) continue;
    const c = w * (normalisedCost(player.cost, k, ranges) - normalisedCost(best, k, ranges));
    if (c > bestC + REGRET_EPS) {
      bestC = c;
      bestK = k;
    }
  }
  if (bestK === null) return undefined;
  const out: NonNullable<PlanScore['topContributor']> = { measure: bestK, value: player.cost[bestK]! };
  if (bestK === 'sharpestTurnDeg' && player.sharpestTurnEdge) out.edge = player.sharpestTurnEdge;
  return out;
}

export function planScore(player: Route, optimized: OptimizeResult, weights: Weights): PlanScore {
  if (optimized.kind === 'no_safe_route') return noSafeRoutePlanScore(player, optimized);
  return frontierPlanScore(player, optimized, normaliseWeights(weights));
}

/**
 * No frontier to compare against, so the §6.1 caps decide: an infeasible route scores 0; a feasible
 * route over a heavy zone is capped at 40 (its regret part is 100, as there is nothing to regret
 * against), with no safer route to name. A feasible route with no heavy crossing cannot occur here
 * (it would be safe), so it falls back to 0 with the optimizer's reasons.
 */
function noSafeRoutePlanScore(player: Route, optimized: NoSafeRoute): PlanScore {
  const base = { regret: 0, regretMax: 0 };
  if (!player.feasible) {
    return { ...base, score: 0, decidedBy: 'feasible', cap: PLAN_CAPS.feasible, violations: player.violations.map((v) => ({ ...v })) };
  }
  if (player.cost.heavyCrossings > 0) {
    const p: PlanScore = { ...base, score: PLAN_CAPS.heavy_crossings, decidedBy: 'heavy_crossings', cap: PLAN_CAPS.heavy_crossings, violations: [] };
    const zone = player.crossings.find((c) => c.tier === 'heavy');
    if (zone) p.zoneCrossed = zone.zone;
    return p;
  }
  return { ...base, score: 0, decidedBy: 'feasible', cap: PLAN_CAPS.feasible, violations: optimized.reasons.map((v) => ({ ...v })) };
}

function frontierPlanScore(player: Route, f: Frontier, w: Weights): PlanScore {
  const ranges = measureRanges(f.candidates);
  const ranked = rankRoutes(f.routes, ranges, w).order;
  const byId = new Map(f.routes.map((r) => [r.id, r]));
  const best = byId.get(ranked[0]!.routeId)!;
  const minS = ranked[0]!.s;
  let maxS = minS;
  for (const r of f.candidates) if (r.feasible) maxS = Math.max(maxS, weightedScore(r.cost, ranges, w));
  const regret = snap(weightedScore(player.cost, ranges, w) - minS);
  const regretMax = snap(maxS - minS);
  const fromRegret = regretScore(regret, regretMax);
  const base = { regret, regretMax, violations: [] as PlanScore['violations'] };
  const contributor = topContributor(player, best.cost, ranges, w);
  const withContributor = (p: PlanScore): PlanScore => (contributor ? { ...p, topContributor: contributor } : p);

  if (!player.feasible) {
    return { ...base, score: 0, decidedBy: 'feasible', cap: PLAN_CAPS.feasible, violations: player.violations.map((v) => ({ ...v })) };
  }
  if (player.cost.heavyCrossings > f.minHeavyCrossings) {
    const zone = player.crossings.find((c) => c.tier === 'heavy');
    const p: PlanScore = { ...base, score: Math.min(PLAN_CAPS.heavy_crossings, fromRegret), decidedBy: 'heavy_crossings', cap: PLAN_CAPS.heavy_crossings, saferRouteId: best.id };
    if (zone) p.zoneCrossed = zone.zone;
    return withContributor(p);
  }
  if (!byId.has(player.id)) {
    const dominator = ranked.map((x) => byId.get(x.routeId)!).find((r) => dominates(r.cost, player.cost));
    if (dominator) {
      return withContributor({ ...base, score: Math.min(PLAN_CAPS.frontier, fromRegret), decidedBy: 'frontier', cap: PLAN_CAPS.frontier, dominatedByRouteId: dominator.id });
    }
    // not enumerated but dominated by no frontier route: it is on the frontier in effect
  }
  return withContributor({ ...base, score: Math.min(PLAN_CAPS.regret, fromRegret), decidedBy: 'regret', cap: PLAN_CAPS.regret });
}
