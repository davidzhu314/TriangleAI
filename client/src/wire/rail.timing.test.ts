/**
 * Rail step() timing (V7). The Drive screen calls one step per frame, inside a 16.7 ms frame, so the
 * budget is median < 1 ms per step (DECISIONS.md, "Engine timing budgets"). Timed over full
 * autopilot drives of every frontier route on fixture-y and every synthetic fixture; only step()
 * is inside the timer.
 *
 * UPDATE_METRICS=1 writes metrics/vaibhav/v7-rail-step-timing.md.
 */

import { describe, expect, it } from 'vitest';
import type { LoadedCase } from '../contracts';
import { loadFixtureY } from '../optimize/fixture-y.testutil';
import { buildGraph } from '../optimize/graph';
import { loadSynthetic } from '../optimize/graphs.testutil';
import { optimizeCase } from '../optimize/optimizer';
import { fmt, machineLine, shouldWriteMetrics, summarize, writeMetrics } from '../optimize/timing.testutil';
import { railAutopilot } from './rail-autopilot';
import { createRailModel, initialRailState, step } from './rail';
import { RAIL_DT_S } from './rail-source';

export const STEP_BUDGET_MS = 1;
const SYNTHETIC = ['straight', 'arc90', 'helix', 'bend', 'y-branch', 'junction', 'diamond'];

/** Per-step durations over every frontier route's autopilot drive in the case. */
function stepDurations(c: LoadedCase): { durations: number[]; drives: number; maxSteps: number } {
  const g = buildGraph(c);
  const durations: number[] = [];
  let drives = 0;
  let maxSteps = 0;
  for (const t of c.targets) {
    const res = optimizeCase(g, { caseId: c.id, targetId: t.id });
    if (res.kind !== 'frontier') continue;
    for (const route of res.routes) {
      const model = createRailModel(c, route.entryId, t.id, route.presetId, route.edges);
      let st = initialRailState(model);
      let steps = 0;
      while (!st.atTarget && steps < 6000) {
        const input = railAutopilot(model, st, RAIL_DT_S);
        const a = performance.now();
        st = step(model, st, input, RAIL_DT_S).state;
        durations.push(performance.now() - a);
        steps++;
      }
      drives++;
      maxSteps = Math.max(maxSteps, steps);
    }
  }
  return { durations, drives, maxSteps };
}

describe('rail step() timing', () => {
  const rows: string[] = [];
  const cases: [string, () => LoadedCase][] = [['fixture-y', loadFixtureY], ...SYNTHETIC.map((n) => [n, () => loadSynthetic(n)] as [string, () => LoadedCase])];

  it.each(cases)('%s: median step < 1 ms over every frontier drive', (name, load) => {
    const c = load();
    stepDurations(c); // warm-up pass: JIT and the model's memo
    const { durations, drives, maxSteps } = stepDurations(c);
    const t = summarize(durations);
    rows.push(`| ${name} | ${drives} | ${maxSteps} | ${fmt(t.medianMs)} | ${fmt(t.p95Ms)} | ${fmt(t.maxMs)} |`);
    expect(drives).toBeGreaterThan(0);
    expect(t.medianMs).toBeLessThan(STEP_BUDGET_MS);
  });

  it('writes the metrics summary when asked', () => {
    if (!shouldWriteMetrics()) return;
    writeMetrics('v7-rail-step-timing.md', [
      '# V7 — rail step() timing',
      '',
      'Written by `UPDATE_METRICS=1 pnpm exec vitest run client/src/wire/rail.timing.test.ts`. The same test asserts median step < 1 ms on every CI run (DECISIONS.md, "Engine timing budgets").',
      '',
      `${machineLine()} Each case: every frontier route to every target, driven by the rail autopilot at 30 Hz; one untimed pass first. Only step() is timed (not the autopilot).`,
      '',
      '| Case | Drives | Steps in longest drive | Median ms/step | p95 ms/step | Max ms/step |',
      '| --- | --- | --- | --- | --- | --- |',
      ...rows,
      '',
      'D6-min generated cases are not on main yet; they join this table when they land.',
    ]);
  });
});
