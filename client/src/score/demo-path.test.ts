/**
 * The engine half of team/DEMO.md, with no UI, on real case files loaded through David's loadCase:
 * Plan → Compare → Drive (rail, autoDrive) → Results → progression. The type-iii cases turn on by
 * themselves when D6-min lands in client/public/cases/; until then they are skipped.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCase } from '../case';
import type { EventLog, Frontier, LoadedCase, Weights } from '../contracts';
import { buildGraph } from '../optimize/graph';
import { optimizeCase } from '../optimize/optimizer';
import { measureRanges, rankRoutes } from '../optimize/rank';
import { fmt, machineLine, shouldWriteMetrics, writeMetrics } from '../optimize/timing.testutil';
import { RailWireSource } from '../wire/rail-source';
import { isUnlocked, ladderTier, nextCase } from './progress';
import { scoreCase } from './score';

const CASES = join(import.meta.dirname, '../../public/cases');
const HAS_TYPE_III = existsSync(join(CASES, 'type-iii', 'case.json'));
const SAFETY: Weights = { proximityPenalty: 0.5, sharpestTurnDeg: 0.3, narrowestRadiusM: 0.2 };
const SHORT: Weights = { lengthM: 0.7, estFluoroS: 0.3 };

async function bundled(id: string): Promise<LoadedCase> {
  const bytes = (f: string) => new Uint8Array(readFileSync(join(CASES, id, f)));
  const r = await loadCase({ kind: 'files', origin: 'bundled', files: { 'case.json': bytes('case.json'), 'centerlines.json': bytes('centerlines.json'), 'vessels.glb': bytes('vessels.glb') } });
  if (!r.ok) throw new Error(`${id}: ${JSON.stringify(r.results)}`);
  return r.case;
}

/** Drive the best frontier route at `weights` with RailWireSource's autopilot, to stop(). */
async function drive(c: LoadedCase, f: Frontier, weights: Weights): Promise<EventLog> {
  const best = f.routes.find((r) => r.id === rankRoutes(f.routes, measureRanges(f.candidates), weights).order[0]!.routeId)!;
  const src = new RailWireSource({ clock: 'manual', autoDrive: true });
  let arrived = false;
  src.onState((s) => (arrived = s.atTarget));
  await src.start({ case: c, entryId: best.entryId, targetId: f.targetId, presetId: best.presetId, path: best.edges });
  src.control({ push: 0, rotate: 0, fluoro: true, contrastPuff: false });
  for (let i = 0; i < 9000 && !arrived; i++) src.tick();
  return src.stop();
}

const numbersIn = (s: string) => s.match(/\d+(\.\d+)?/g) ?? [];

const rows: string[] = [];

for (const [id, target, typeIII] of [['fixture-y', 'left_branch', false], ['type-iii', 'rcca', true]] as const) {
  const on = !typeIII || HAS_TYPE_III;
  describe.skipIf(!on)(`demo path on ${id} → ${target}`, async () => {
    const c = on ? await bundled(id) : (null as unknown as LoadedCase);
    const optimized = on ? optimizeCase(buildGraph(c), { caseId: c.id, targetId: target }) : null;
    const f = optimized as Frontier;

    it('Plan: a frontier, with enough routes (and the 120° right-femoral flag on type-iii)', () => {
      expect(optimized!.kind).toBe('frontier');
      expect(f.routes.length).toBeGreaterThanOrEqual(typeIII ? 3 : 1);
      if (typeIII) {
        const femR = f.candidates.find((r) => r.entryId === 'fem_r')!;
        expect(femR.cost.sharpestTurnDeg).toBeGreaterThan(117); // David's generator test: 117–123°
        expect(femR.cost.sharpestTurnDeg).toBeLessThan(123);
        expect(femR.violations.some((v) => v.kind === 'turn_too_sharp')).toBe(true);
      }
    });

    it('Compare: moving the weights changes the ranking', () => {
      const ranges = measureRanges(f.candidates);
      const a = rankRoutes(f.routes, ranges, SAFETY).order.map((r) => r.routeId);
      const b = rankRoutes(f.routes, ranges, SHORT).order.map((r) => r.routeId);
      expect(a).toHaveLength(f.routes.length);
      // fixture-y's two frontier routes share one path, so no weight separates them
      if (typeIII) expect(a).not.toEqual(b);
    });

    // Every case, type-iii included, must drive cleanly (type-iii since the D6-min drivability retune); never loosen the check
    it('Drive → Results: the best route is driven cleanly and scored', async () => {
      const t0 = performance.now();
      const log = await drive(c, f, SAFETY);
      const kinds = log.events.map((e) => e.kind);
      expect(kinds).toContain('target_reached');
      expect(kinds).not.toContain('wrong_branch');
      expect(kinds).not.toContain('prolapse');
      const r = scoreCase({ log, optimized: f, weights: SAFETY, case: c });
      expect(r.reachedTarget).toBe(true);
      expect(r.stars).toBeGreaterThanOrEqual(1);
      expect(r.feedback.length).toBeGreaterThan(0);
      for (const line of r.feedback) {
        const allowed = new Set(Object.values(line.values).flatMap((v) => (typeof v === 'number' ? [String(v)] : numbersIn(v))));
        for (const n of numbersIn(line.text)) expect(allowed, line.text).toContain(n);
      }
      expect(JSON.stringify(scoreCase({ log, optimized: f, weights: SAFETY, case: c }))).toBe(JSON.stringify(r));
      rows.push(`| ${id} → ${target} | ${log.samples.length} | ${fmt(performance.now() - t0, 1)} |`);
    });

    it('Progression: open mode unlocks the demo case; ladder mode starts at the lowest tier (tier 0 when it has a case)', async () => {
      const index = JSON.parse(readFileSync(join(CASES, 'index.json'), 'utf8')) as { cases: { id: string }[] };
      const all = await Promise.all(index.cases.map((x) => (x.id === c.id ? c : bundled(x.id))));
      if (!all.some((x) => x.id === c.id)) all.push(c);
      expect(isUnlocked(c.id, all, [], 'open')).toBe(true);
      const rank = (x: LoadedCase) => ladderTier(x) ?? 99;
      const lowest = [...all].sort((x, y) => rank(x) - rank(y) || (x.id < y.id ? -1 : 1))[0]!;
      expect(nextCase(all, [], 'ladder')).toBe(lowest.id);
    });
  });
}

describe('demo path timing', () => {
  it('writes the summary when asked', () => {
    if (!shouldWriteMetrics()) return;
    writeMetrics('demo-path-timing.md', [
      '# Demo path — engine timing (Drive → Results)',
      '',
      `Written by \`UPDATE_METRICS=1 pnpm exec vitest run client/src/score/demo-path.test.ts\`. ${machineLine()} One run: a RailWireSource autoDrive of the best frontier route at the safety weights, ticked by hand at 30 Hz, then scoreCase twice. No assertion beyond the existing budgets.`,
      '',
      '| Case → target | Samples | Drive + score, ms |',
      '| --- | --- | --- |',
      ...rows,
    ]);
  });
});
