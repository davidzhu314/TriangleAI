import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CostVector, Frontier, FrontierRoute } from '../contracts';
import { loadFixtureY } from './fixture-y.testutil';
import { buildGraph } from './graph';
import { gridCase, loadSynthetic, randomCase, rng } from './graphs.testutil';
import { optimizeCase } from './optimizer';
import { createRanker, measureRanges, normalisedCost, normaliseWeights, rankRoutes } from './rank';

const FRAME_MS = 1000 / 60;
const diamond = loadSynthetic('diamond');
const f = optimizeCase(buildGraph(diamond), { caseId: diamond.id, targetId: 'top' }) as Frontier;

describe('weighted ranking (spec §4.8)', () => {
  const rank = createRanker(f);

  it('puts B first on length and A first on width or risk distance', () => {
    expect(rank({ lengthM: 1 }).order[0]!.routeId).toContain('e0,e3,e4');
    expect(rank({ narrowestRadiusM: 1 }).order[0]!.routeId).toBe('in|soft_angled|e0,e1,e2');
    expect(rank({ proximityPenalty: 1 }).order[0]!.routeId).toBe('in|soft_angled|e0,e1,e2');
  });

  it('normalises each measure 0..1 across feasible candidates, best = 0, higher-is-better flipped', () => {
    const ranges = measureRanges(f.candidates);
    const feasible = f.candidates.filter((r) => r.feasible);
    expect(ranges.lengthM!.min).toBeCloseTo(Math.min(...feasible.map((r) => r.cost.lengthM)), 12);
    const a = f.routes.find((r) => r.edges.join(',') === 'e0,e1,e2')!;
    expect(normalisedCost(a.cost, 'narrowestRadiusM', ranges)).toBe(0); // widest: best
    expect(normalisedCost(a.cost, 'lengthM', ranges)).toBe(1); // longest feasible: worst
    expect(normalisedCost(a.cost, 'heavyCrossings', ranges)).toBe(0); // no spread
  });

  it('S = Σ w ĉ, so weights change the order, never the membership', () => {
    const r1 = rank({ lengthM: 0.5, narrowestRadiusM: 0.5 });
    expect(r1.order.map((x) => x.routeId).sort()).toEqual(f.routes.map((x) => x.id).sort());
    const a = r1.order.find((x) => x.routeId.endsWith('e0,e1,e2'))!;
    expect(a.s).toBeCloseTo(0.5 * 1 + 0.5 * 0, 12);
  });

  it('normalises weights, accepts all-zero, rejects negative', () => {
    expect(normaliseWeights({ lengthM: 2, estFluoroS: 2 })).toEqual({ lengthM: 0.5, estFluoroS: 0.5 });
    expect(rank({}).order.map((x) => x.s)).toEqual(f.routes.map(() => 0));
    expect(() => rank({ lengthM: -1 })).toThrow(RangeError);
    expect(() => rank({ lengthM: Number.NaN })).toThrow(RangeError);
  });

  it('breaks ties by route id, deterministically', () => {
    const order = rank({ lengthM: 1 }).order;
    const tied = order.filter((x) => x.s === order[0]!.s).map((x) => x.routeId);
    expect(tied).toEqual([...tied].sort());
  });
});

/** A synthetic frontier of n routes with random costs, for the re-rank budget. */
function bigFrontier(n: number): Frontier {
  const r = rng(99);
  const routes: FrontierRoute[] = Array.from({ length: n }, (_, i) => {
    const cost: CostVector = {
      lengthM: 0.1 + r() * 0.5,
      sharpestTurnDeg: r() * 120,
      totalTurningDeg: r() * 400,
      narrowestRadiusM: 0.001 + r() * 0.01,
      heavyCrossings: 0,
      proximityPenalty: r() * 2,
      estFluoroS: 10 + r() * 60,
    };
    return {
      id: `r${i}`,
      entryId: 'in',
      targetId: 't',
      presetId: 'standard_j',
      edges: [],
      nodes: [],
      feasible: true,
      cost,
      violations: [],
      crossings: [],
      sharpestTurnEdge: null,
      labels: [],
    };
  });
  return { kind: 'frontier', caseId: 'x', targetId: 't', minHeavyCrossings: 0, routes, candidates: routes, recordedRunsUsed: false };
}

function time(fn: () => void, runs: number) {
  for (let i = 0; i < 10; i++) fn();
  const t: number[] = [];
  for (let i = 0; i < runs; i++) {
    const a = performance.now();
    fn();
    t.push(performance.now() - a);
  }
  t.sort((x, y) => x - y);
  return { medianMs: t[Math.floor(runs / 2)]!, p95Ms: t[Math.floor(runs * 0.95)]!, maxMs: t[runs - 1]! };
}

describe('timing', () => {
  const rows: string[] = [];
  const fmt = (x: number) => x.toFixed(3);

  it('re-ranks in under 16 ms when a slider moves (1000-route frontier)', () => {
    const big = bigFrontier(1000);
    const rank = createRanker(big);
    const r = rng(5);
    const t = time(() => rank({ lengthM: r(), sharpestTurnDeg: r(), estFluoroS: r(), narrowestRadiusM: r(), proximityPenalty: r() }), 200);
    rows.push(`| Re-rank, 1000-route frontier, 5 weights | ${fmt(t.medianMs)} | ${fmt(t.p95Ms)} | ${fmt(t.maxMs)} |`);
    expect(t.p95Ms).toBeLessThan(16);
    // and the diamond's real frontier
    const small = createRanker(f);
    const ts = time(() => small({ lengthM: r(), narrowestRadiusM: r() }), 200);
    rows.push(`| Re-rank, diamond frontier (3 routes) | ${fmt(ts.medianMs)} | ${fmt(ts.p95Ms)} | ${fmt(ts.maxMs)} |`);
    expect(ts.p95Ms).toBeLessThan(FRAME_MS);
  });

  it('optimizes typical cases well under the §4.5 50 ms (cold, graph prebuilt)', () => {
    const subjects: [string, ReturnType<typeof loadFixtureY>, string][] = [
      ['fixture-y → left', loadFixtureY(), 'left_branch'],
      ['diamond (4 paths × 3 presets)', diamond, 'top'],
      ['random graph, seed 11', randomCase(11), 't0'],
      ['grid 7 × 7 (84 edges, Yen k = 10)', gridCase(7, 7), 't0'],
    ];
    for (const [label, c, target] of subjects) {
      const g = buildGraph(c);
      const t = time(() => optimizeCase(g, { caseId: c.id, targetId: target }), 20);
      rows.push(`| Optimize, ${label} | ${fmt(t.medianMs)} | ${fmt(t.p95Ms)} | ${fmt(t.maxMs)} |`);
      // §4.5 describes typical cases ("finish in under 50 ms"), so the median is checked; a single
      // scheduler stall under a parallel test run can push p95 of 20 cold runs past it
      expect(t.medianMs).toBeLessThan(label.startsWith('grid') ? 500 : 50);
    }
  });

  it('writes the metrics summary when asked', () => {
    if (process.env['UPDATE_METRICS'] !== '1') return;
    const lines = [
      '# V3 — optimizer and re-rank timing',
      '',
      'Written by `UPDATE_METRICS=1 pnpm exec vitest run client/src/optimize/rank.test.ts`. The same test asserts re-rank p95 < 16 ms and typical optimize median < 50 ms (spec §4.5, §4.9) on every CI run.',
      '',
      `Machine: ${process.platform} ${process.arch}, Node ${process.version}. Main thread, after a warm-up. Optimize is a cold call each time (fresh enumerator; graph prebuilt), so it includes path enumeration and every route's measures.`,
      '',
      '| What | Median ms | p95 ms | Max ms |',
      '| --- | --- | --- | --- |',
      ...rows,
      '',
    ];
    writeFileSync(join(import.meta.dirname, '../../../metrics/vaibhav/v3-optimizer-timing.md'), lines.join('\n'));
  });
});

describe('rankRoutes on candidates', () => {
  it('ranks any route set against shared ranges (the Plan score uses this for regret in V5)', () => {
    const ranges = measureRanges(f.candidates);
    const all = rankRoutes(f.candidates.filter((r) => r.feasible), ranges, { lengthM: 1 });
    expect(all.order.at(-1)!.s).toBeCloseTo(1, 12);
    expect(all.order[0]!.s).toBe(0);
  });
});
