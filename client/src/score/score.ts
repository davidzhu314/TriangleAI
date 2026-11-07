/**
 * Real scoring (spec §6.1–6.4, §6.6): one finished drive's EventLog plus what the optimizer returned
 * gives a CaseResult. Pure and deterministic: no clocks, no randomness, fixed iteration order and
 * id tie-breaks, so the same inputs give the same CaseResult down to its JSON bytes.
 */

import type { CaseResult, EventLog, FrontierRoute, LoadedCase, OptimizeResult, Weights } from '../contracts';
import { normaliseWeights, measureRanges, rankRoutes } from '../optimize/rank';
import { driveScore } from './drive';
import { buildFeedback } from './feedback';
import { planScore } from './plan';
import { forceReference, type ForceReference } from './reference';
import { playerRoute } from './route-of-log';
import { applyFluoroBudget, starsFor } from './stars';

export interface ScoreInput {
  /** The drive's event log (scores come from it alone, plus the plan and case below). */
  log: EventLog;
  /** What the optimizer returned for this case and target. */
  optimized: OptimizeResult;
  /** The player's weights when they chose the route. */
  weights: Weights;
  /** The loaded case: planned centerline for fidelity, names for feedback, fluoro allowance. */
  case: LoadedCase;
}

/** The best-ranked frontier route at the player's weights; null with no safe route. Replay uses the same choice. */
export function bestFrontierRoute(optimized: OptimizeResult, weights: Weights): FrontierRoute | null {
  if (optimized.kind !== 'frontier' || optimized.routes.length === 0) return null;
  const order = rankRoutes(optimized.routes, measureRanges(optimized.candidates), normaliseWeights(weights)).order;
  return optimized.routes.find((r) => r.id === order[0]!.routeId)!;
}

/** The gentleness reference: the best-ranked frontier route at the player's weights, else the player's own path. */
export function referenceFor(input: ScoreInput): ForceReference {
  const { log, optimized } = input;
  const best = bestFrontierRoute(optimized, input.weights);
  if (best) return forceReference(input.case, best, log.sampleHz);
  return forceReference(
    input.case,
    { id: `${log.entryId}|${log.presetId}|${log.path.join(',')}`, entryId: log.entryId, targetId: log.targetId, presetId: log.presetId, edges: log.path },
    log.sampleHz,
  );
}

export function scoreCase(input: ScoreInput): CaseResult {
  const { log, optimized } = input;
  const c = input.case;
  if (log.caseId !== c.id || optimized.caseId !== c.id) {
    throw new Error(`score: case mismatch (log ${log.caseId}, optimizer ${optimized.caseId}, case ${c.id})`);
  }
  if (log.targetId !== optimized.targetId) throw new Error(`score: log target ${log.targetId} but optimizer target ${optimized.targetId}`);

  const { route } = playerRoute(log, optimized, c);
  const reference = referenceFor(input);
  const plan = planScore(route, optimized, input.weights);
  const drive = driveScore(log, c, route.cost.estFluoroS, reference);
  const reachedTarget = log.events.some((e) => e.kind === 'target_reached');
  const starsBeforeBudget = starsFor(reachedTarget, plan.score, drive.score);
  const budget = applyFluoroBudget(starsBeforeBudget, reachedTarget, drive.radiation.fluoroS, c.fluoroBudgetS);

  const result: CaseResult = {
    caseId: c.id,
    routeId: route.id,
    reachedTarget,
    plan,
    drive,
    stars: budget.stars,
    starsBeforeBudget,
    fluoroOverBudgetS: budget.overS,
    feedback: [],
  };
  result.feedback = buildFeedback(result, { log, case: c, optimized, player: route, reference });
  return result;
}
