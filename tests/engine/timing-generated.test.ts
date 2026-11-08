/**
 * G1: engine timings on the generated cases, against the V7 budgets (DECISIONS.md, "Engine timing
 * budgets", illustrative). The same budgets and the same statistic each V7 test asserts:
 * - optimize, cold (buildGraph + optimizeCase, as when a case opens): median < 50 ms;
 * - measureRoute, per Plan click (every prefix of every frontier route): p95 < 16.7 ms (one frame);
 * - rail step, per 30 Hz frame (RailWireSource.tick on the autopilot): median < 1 ms;
 * - scoreCase, end to end on a clean drive of each frontier route: median < 100 ms.
 *
 * UPDATE_METRICS=1 pnpm exec vitest run tests/engine/timing-generated.test.ts
 * writes metrics/gibran/d6-timing.md. Never loosen a budget without a DECISIONS.md line.
 */

import { describe, expect, it } from 'vitest';
import { buildGraph, measureRoute, optimizeCase } from '../../client/src/optimize';
import { DEFAULT_WEIGHTS } from '../../client/src/optimize';
import { scoreCase } from '../../client/src/score';
import type { EventLog, Frontier, LoadedCase } from '../../client/src/contracts';
import { RailWireSource } from '../../client/src/wire/rail-source';
import { autoDrive, fmt, G1_CASES, loadBundled, machineLine, MAX_TICKS, shouldWriteMetrics, summarize, time, writeMetrics, type Timing } from './engine.testutil';

const OPTIMIZE_MEDIAN_MS = 50;
const FRAME_MS = 1000 / 60;
const STEP_MEDIAN_MS = 1;
const SCORE_MEDIAN_MS = 100;

const rows: string[] = [];
const row = (id: string, step: string, budget: string, t: Timing, pass: boolean) =>
  rows.push(`| ${id} | ${step} | ${budget} | ${fmt(t.medianMs)} | ${fmt(t.p95Ms)} | ${fmt(t.maxMs)} | ${t.n} | ${pass ? 'Pass' : 'FAIL'} |`);

function frontiers(c: LoadedCase): Frontier[] {
  const g = buildGraph(c);
  return c.targets.map((t) => optimizeCase(g, { caseId: c.id, targetId: t.id })).filter((r): r is Frontier => r.kind === 'frontier');
}

/** Per-tick durations of an autopilot drive of `route`, timed around RailWireSource.tick(). */
async function tickTimes(c: LoadedCase, f: Frontier, routeIdx: number): Promise<number[]> {
  const r = f.routes[routeIdx]!;
  const src = new RailWireSource({ clock: 'manual', autoDrive: true });
  let reached = false;
  src.onState((s) => (reached = s.atTarget));
  await src.start({ case: c, entryId: r.entryId, targetId: f.targetId, presetId: r.presetId, path: r.edges });
  src.control({ push: 0, rotate: 0, fluoro: true, contrastPuff: false });
  const out: number[] = [];
  for (let i = 0; i < MAX_TICKS && !reached; i++) {
    const a = performance.now();
    src.tick();
    out.push(performance.now() - a);
  }
  await src.stop();
  return out;
}

for (const id of G1_CASES) {
  describe(`engine timing on ${id}`, async () => {
    const c = await loadBundled(id);
    const fs = frontiers(c);

    it(`optimize, cold: median < ${OPTIMIZE_MEDIAN_MS} ms`, () => {
      const t = time(() => {
        const g = buildGraph(c);
        for (const tg of c.targets) optimizeCase(g, { caseId: c.id, targetId: tg.id });
      }, 50);
      row(id, `optimize, cold (buildGraph + ${c.targets.length} targets)`, `median < ${OPTIMIZE_MEDIAN_MS} ms`, t, t.medianMs < OPTIMIZE_MEDIAN_MS);
      expect(t.medianMs).toBeLessThan(OPTIMIZE_MEDIAN_MS);
    });

    it('measureRoute per Plan click: p95 < one frame', () => {
      const g = buildGraph(c);
      const prefixes = fs.flatMap((f) => f.routes.flatMap((r) => r.edges.map((_, i) => r.edges.slice(0, i + 1))));
      for (let i = 0; i < 10; i++) for (const p of prefixes) measureRoute(g, p);
      const d: number[] = [];
      for (let k = 0; k < 20; k++)
        for (const p of prefixes) {
          const a = performance.now();
          measureRoute(g, p);
          d.push(performance.now() - a);
        }
      const t = summarize(d);
      row(id, `measureRoute, ${prefixes.length} frontier-route prefixes`, 'p95 < 16.7 ms', t, t.p95Ms < FRAME_MS);
      expect(t.p95Ms).toBeLessThan(FRAME_MS);
    });

    it(`rail step per frame: median < ${STEP_MEDIAN_MS} ms`, async () => {
      await tickTimes(c, fs[0]!, 0); // warm-up drive
      const d: number[] = [];
      for (const f of fs) for (let i = 0; i < f.routes.length; i++) d.push(...(await tickTimes(c, f, i)));
      const t = summarize(d);
      row(id, 'rail step (RailWireSource.tick, autopilot, every frontier route)', `median < ${STEP_MEDIAN_MS} ms`, t, t.medianMs < STEP_MEDIAN_MS);
      expect(t.medianMs).toBeLessThan(STEP_MEDIAN_MS);
    });

    it(`scoreCase end to end: median < ${SCORE_MEDIAN_MS} ms`, async () => {
      const drives: { log: EventLog; f: Frontier }[] = [];
      for (const f of fs) for (const r of f.routes) drives.push({ log: (await autoDrive(c, f.targetId, r)).log, f });
      const score = () => {
        for (const { log, f } of drives) scoreCase({ log, optimized: f, weights: DEFAULT_WEIGHTS, case: c });
      };
      for (let i = 0; i < 5; i++) score();
      const d: number[] = [];
      for (let k = 0; k < 10; k++)
        for (const { log, f } of drives) {
          const a = performance.now();
          scoreCase({ log, optimized: f, weights: DEFAULT_WEIGHTS, case: c });
          d.push(performance.now() - a);
        }
      const t = summarize(d);
      row(id, `scoreCase, ${drives.length} clean frontier drives at the default weights`, `median < ${SCORE_MEDIAN_MS} ms`, t, t.medianMs < SCORE_MEDIAN_MS);
      expect(t.medianMs).toBeLessThan(SCORE_MEDIAN_MS);
    }, 60_000);
  });
}

describe('d6 timing summary', () => {
  it('writes metrics/gibran/d6-timing.md when asked', () => {
    if (!shouldWriteMetrics()) return;
    writeMetrics('d6-timing.md', [
      '# G1 — engine timing on the generated cases',
      '',
      `Written by \`UPDATE_METRICS=1 pnpm exec vitest run tests/engine/timing-generated.test.ts\`. ${machineLine()}`,
      '',
      'The V7 budgets (DECISIONS.md, "Engine timing budgets", illustrative), on `type-iii` and `low-tort` loaded through `loadCase`. Each budget uses the statistic its V7 test asserts, and the test asserts it on every CI run. Rail step is timed around `RailWireSource.tick()`, which also emits the state, so it slightly overstates `step()` alone.',
      '',
      '| Case | Engine step | Budget (asserted) | Median ms | p95 ms | Max ms | n | Result |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
      ...rows,
    ]);
  });
});
