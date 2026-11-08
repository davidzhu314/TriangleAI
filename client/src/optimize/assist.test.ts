import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Frontier, LoadedCase, OptimizeResult, Route } from '../contracts';
import { planAssist, type PlanAssistInput } from './assist';
import { loadFixtureY } from './fixture-y.testutil';
import { buildGraph } from './graph';
import { gridCase, loadSynthetic, randomCase, rng } from './graphs.testutil';
import { isSafe, optimizeCase, RouteEnumerator } from './optimizer';
import { measureRanges, rankRoutes } from './rank';

const diamond = loadSynthetic('diamond');
const D = optimizeCase(buildGraph(diamond), { caseId: diamond.id, targetId: 'top' }) as Frontier;
const base = (over: Partial<PlanAssistInput> = {}): PlanAssistInput => ({ optimized: D, weights: { lengthM: 1 }, entryId: 'in', presetId: 'soft_angled', routeSoFar: [], ...over });

describe('planAssist', () => {
  it('empty prefix: the first edges of the frontier routes, ranked', () => {
    const a = planAssist(base());
    expect(a.reason).toBeUndefined();
    expect(a.options.map((o) => o.edge)).toEqual(['e0']);
    expect(a.best).toBe(a.options[0]);
    expect(a.best).toMatchObject({ source: 'frontier', bestRank: 0, node: D.routes.find((r) => r.presetId === 'soft_angled')!.nodes[1] });
    expect(a.best!.routeIds).toEqual(D.routes.filter((r) => r.presetId === 'soft_angled').map((r) => r.id).sort());
  });

  it('where two routes split, the weights decide the best branch', () => {
    const byLength = planAssist(base({ routeSoFar: ['e0'] }));
    expect(byLength.options.map((o) => o.edge).sort()).toEqual(['e1', 'e3']);
    expect(byLength.best!.edge).toBe('e3'); // B is shorter
    const byWidth = planAssist(base({ routeSoFar: ['e0'], weights: { narrowestRadiusM: 1 } }));
    expect(byWidth.best!.edge).toBe('e1'); // A is wider
    expect(byWidth.best!.labels.length).toBeGreaterThan(0);
  });

  it('a prefix on the best route continues it; the best matches rankRoutes', () => {
    const order = rankRoutes(D.routes.filter((r) => r.presetId === 'soft_angled'), measureRanges(D.candidates), { lengthM: 1 }).order;
    const best = D.routes.find((r) => r.id === order[0]!.routeId)!;
    for (let k = 0; k < best.edges.length; k++) expect(planAssist(base({ routeSoFar: best.edges.slice(0, k) })).best!.edge).toBe(best.edges[k]);
  });

  it('complete: the prefix is already a whole route, so there are no options', () => {
    expect(planAssist(base({ routeSoFar: ['e0', 'e3', 'e4'] }))).toEqual({ options: [], best: null, reason: 'complete' });
  });

  it('no safe route: no options', () => {
    const y = loadFixtureY();
    const res = optimizeCase(buildGraph(y), { caseId: y.id, targetId: 'right_branch' });
    expect(planAssist({ optimized: res, weights: {}, entryId: 'fem_r', presetId: 'soft_angled', routeSoFar: [] })).toEqual({ options: [], best: null, reason: 'no_safe_route' });
  });

  it('no continuation: a prefix no route starts with', () => {
    expect(planAssist(base({ routeSoFar: ['e4'] }))).toEqual({ options: [], best: null, reason: 'no_continuation' });
  });

  it('off the frontier: falls back to safe candidates continuing the prefix', () => {
    // find a safe candidate prefix that no frontier route of the same entry and preset shares
    const found = ([randomCase(11), gridCase(4, 4), diamond] as LoadedCase[]).flatMap((c) => {
      const g = buildGraph(c);
      return c.targets.flatMap((t) => {
        // synthetic graphs with branches no wire can steer: path search only, without the steering check
        const res = optimizeCase(g, { caseId: c.id, targetId: t.id }, new RouteEnumerator(g, { steering: false }));
        if (res.kind !== 'frontier') return [];
        return res.candidates.filter(isSafe).flatMap((r) =>
          r.edges.slice(1).map((_, k) => ({ res, r, prefix: r.edges.slice(0, k + 1) })).filter(({ prefix }) =>
            !res.routes.some((f) => f.entryId === r.entryId && f.presetId === r.presetId && prefix.every((e, i) => f.edges[i] === e)),
          ),
        );
      });
    })[0]!;
    expect(found).toBeDefined();
    const a = planAssist({ optimized: found.res, weights: { lengthM: 1 }, entryId: found.r.entryId, presetId: found.r.presetId, routeSoFar: found.prefix });
    expect(a.reason).toBe('off_frontier');
    expect(a.best!.source).toBe('candidates');
    expect(a.options.map((o) => o.edge)).toContain(found.r.edges[found.prefix.length]);
  });

  it('is deterministic: shuffled routes and candidates give the same answer', () => {
    const r = rng(3);
    const shuffle = <T>(xs: T[]) => xs.map((x) => [r(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);
    const shuffled: OptimizeResult = { ...D, routes: shuffle([...D.routes]), candidates: shuffle([...D.candidates] as Route[]) };
    for (const prefix of [[], ['e0']]) {
      expect(JSON.stringify(planAssist(base({ optimized: shuffled, routeSoFar: prefix })))).toBe(JSON.stringify(planAssist(base({ routeSoFar: prefix }))));
    }
  });

  const TYPE_III = join(import.meta.dirname, '../../public/cases/type-iii/case.json');
  it.skipIf(!existsSync(TYPE_III))('type-iii (when D6-min lands): the best first branch for rcca matches the top frontier route', async () => {
    const { readFileSync } = await import('node:fs');
    const { loadCase } = await import('../case');
    const dir = join(import.meta.dirname, '../../public/cases/type-iii');
    const b = (f: string) => new Uint8Array(readFileSync(join(dir, f)));
    const res = await loadCase({ kind: 'files', origin: 'bundled', files: { 'case.json': b('case.json'), 'centerlines.json': b('centerlines.json'), 'vessels.glb': b('vessels.glb') } });
    if (!res.ok) throw new Error('type-iii did not load');
    const f = optimizeCase(buildGraph(res.case), { caseId: res.case.id, targetId: 'rcca' }) as Frontier;
    const weights = { lengthM: 1 };
    const top = f.routes.find((r) => r.id === rankRoutes(f.routes, measureRanges(f.candidates), weights).order[0]!.routeId)!;
    const a = planAssist({ optimized: f, weights, entryId: top.entryId, presetId: top.presetId, routeSoFar: [] });
    expect(a.best!.edge).toBe(top.edges[0]);
  });
});
