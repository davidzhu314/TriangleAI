/**
 * Regression tests for two issues G1 found on the golden Type III demo drive
 * (tests/fixtures/engine/demo-type-iii-rcca.*). The player drives the best frontier route at the
 * starting weights, so:
 * - the engine must give regret exactly 0 and plan score exactly 100. Before Vaibhav's regret-noise
 *   fix (#41, DECISIONS.md "Regret noise") it gave 5.55e-17 and 99.99999999999997;
 * - Results' leadAction must offer "Retry the drive", not "Revise the plan", beside
 *   "Your route is the best available at your own weights."
 * These started as `it.fails` tests filed with team/requests/to-vaibhav-from-gibran-best-route-plan-score.md
 * and to-aroovee-from-gibran-results-revise-on-best.md. They are plain tests since #41.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildGraph, optimizeCase } from '../../client/src/optimize';
import { scoreCase } from '../../client/src/score';
import type { CaseResult, EventLog, Frontier, Weights } from '../../client/src/contracts';
import { leadAction } from '../../client/src/ui/results/model';
import { ENGINE_FIXTURES, loadBundled } from './engine.testutil';

describe('best route on the golden Type III demo drive', async () => {
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

  it('engine: the best route has regret exactly 0 and plan score exactly 100', () => {
    expect(result.plan.regret).toBe(0);
    expect(result.plan.score).toBe(100);
  });

  it('Results: leadAction offers "retry" when the lead line is plan.best', () => {
    expect(leadAction(result)).toBe('retry');
  });
});
