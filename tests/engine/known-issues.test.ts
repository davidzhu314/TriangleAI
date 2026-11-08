/**
 * Known issues found by G1, each filed to its owner with this file as the failing test.
 *
 * These use `it.fails`, so CI stays green while the bug exists. When the owner's fix lands, the
 * assertion starts passing, `it.fails` reports a failure, and the owner (or Gibran) turns it into a
 * plain `it`, and moves it to the test file it belongs in.
 *
 * Found on the golden Type III demo drive (tests/fixtures/engine/demo-type-iii-rcca.*): the player
 * drives the best frontier route at the starting weights, yet
 * - the engine gives regret 5.55e-17 and plan score 99.99999999999997, not exactly 0 and 100
 *   (team/requests/to-vaibhav-from-gibran-best-route-plan-score.md);
 * - Results' leadAction compares that with `< 100` and offers "Revise the plan" beside
 *   "Your route is the best available at your own weights."
 *   (team/requests/to-aroovee-from-gibran-results-revise-on-best.md).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildGraph, optimizeCase } from '../../client/src/optimize';
import { scoreCase } from '../../client/src/score';
import type { CaseResult, EventLog, Frontier, Weights } from '../../client/src/contracts';
import { leadAction } from '../../client/src/ui/results/model';
import { ENGINE_FIXTURES, loadBundled } from './engine.testutil';

describe('known issues on the golden Type III demo drive', async () => {
  const golden = JSON.parse(readFileSync(join(ENGINE_FIXTURES, 'demo-type-iii-rcca.json'), 'utf8')) as {
    targetId: string;
    weights: Weights;
    log: EventLog;
  };
  const c = await loadBundled('type-iii');
  const f = optimizeCase(buildGraph(c), { caseId: c.id, targetId: golden.targetId }) as Frontier;
  const result: CaseResult = scoreCase({ log: golden.log, optimized: f, weights: golden.weights, case: c });

  it('the drive is on the best frontier route, and the lead line says so', () => {
    expect(result.plan.decidedBy).toBe('regret');
    expect(result.feedback[0]?.template).toBe('plan.best');
  });

  // Vaibhav: R = S(player) − min S should be exactly 0 when the player's route is the best one.
  it.fails('engine: the best route has regret exactly 0 and plan score exactly 100', () => {
    expect(result.plan.regret).toBe(0);
    expect(result.plan.score).toBe(100);
  });

  // Aroovee: a plan line at a full plan score should offer "Retry the drive", never "Revise the plan".
  it.fails('Results: leadAction offers "retry" when the lead line is plan.best', () => {
    expect(leadAction(result)).toBe('retry');
  });
});
