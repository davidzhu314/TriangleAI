/**
 * Scoring timing (V7). The Results screen opens on scoreCase, so the budget is median < 100 ms per
 * golden log end to end (DECISIONS.md, "Engine timing budgets"). The gentleness reference drive is
 * timed alone and logged, not asserted. It is well under budget, so the reference is not cached
 * (DECISIONS.md, "Gentleness reference cache: not needed").
 *
 * UPDATE_METRICS=1 writes metrics/vaibhav/v7-score-timing.md.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EventLog, LoadedCase, Weights } from '../contracts';
import { loadFixtureY } from '../optimize/fixture-y.testutil';
import { buildGraph } from '../optimize/graph';
import { loadSynthetic } from '../optimize/graphs.testutil';
import { optimizeCase } from '../optimize/optimizer';
import { measureRanges, normaliseWeights, rankRoutes } from '../optimize/rank';
import { fmt, machineLine, shouldWriteMetrics, time, writeMetrics } from '../optimize/timing.testutil';
import { forceReference } from './reference';
import { scoreCase } from './score';

export const SCORE_BUDGET_MS = 100;
const LOGS = join(import.meta.dirname, '../../../tests/fixtures/logs');

interface Golden {
  name: string;
  c: LoadedCase;
  log: EventLog;
  weights: Weights;
}

function goldens(): Golden[] {
  const read = (f: string) => JSON.parse(readFileSync(join(LOGS, f), 'utf8'));
  const out: Golden[] = [];
  for (const name of ['score-clean-fixture-y', 'score-wrong-branch-fixture-y', 'score-prolapse-fixture-y', 'score-over-budget-fixture-y']) {
    const g = read(`${name}.json`) as { log: EventLog; weights: Weights };
    out.push({ name, c: loadFixtureY(), log: g.log, weights: g.weights });
  }
  const r = read('rail-golden-diamond-j.result.json') as { log: string; weights: Weights };
  out.push({ name: 'rail-golden-diamond-j', c: loadSynthetic('diamond'), log: (read(r.log) as { log: EventLog }).log, weights: r.weights });
  return out;
}

describe('scoreCase timing', () => {
  const rows: string[] = [];

  it.each(goldens().map((g) => [g.name, g] as const))('%s: median scoreCase < 100 ms', (name, g) => {
    // the optimizer result is an input to scoring (the Plan screen already has it), so it is not timed
    const optimized = optimizeCase(buildGraph(g.c), { caseId: g.c.id, targetId: g.log.targetId });
    const input = { log: g.log, optimized, weights: g.weights, case: g.c };
    const t = time(() => scoreCase(input), 20, 3);
    let refMs = 0;
    if (optimized.kind === 'frontier') {
      const order = rankRoutes(optimized.routes, measureRanges(optimized.candidates), normaliseWeights(g.weights)).order;
      const best = optimized.routes.find((r) => r.id === order[0]!.routeId)!;
      refMs = time(() => forceReference(g.c, best, g.log.sampleHz), 20, 3).medianMs;
    }
    rows.push(`| ${name} | ${g.log.samples.length} | ${fmt(t.medianMs)} | ${fmt(t.p95Ms)} | ${fmt(t.maxMs)} | ${fmt(refMs)} |`);
    expect(t.medianMs).toBeLessThan(SCORE_BUDGET_MS);
  });

  it('writes the metrics summary when asked', () => {
    if (!shouldWriteMetrics()) return;
    writeMetrics('v7-score-timing.md', [
      '# V7 — scoring timing',
      '',
      'Written by `UPDATE_METRICS=1 pnpm exec vitest run client/src/score/score.timing.test.ts`. The same test asserts median scoreCase < 100 ms on every CI run (DECISIONS.md, "Engine timing budgets").',
      '',
      `${machineLine()} 20 runs each after 3 warm-up runs. Every run includes the gentleness reference drive (it is not cached). The optimizer result is an input (the Plan screen already has it) and is not timed.`,
      '',
      '| Golden log | Samples | scoreCase median ms | p95 ms | Max ms | Reference drive alone, median ms |',
      '| --- | --- | --- | --- | --- | --- |',
      ...rows,
    ]);
  });
});
