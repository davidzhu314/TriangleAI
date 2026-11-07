import { describe, expect, it } from 'vitest';
import type { CostVector, Frontier, LoadedCase, NoSafeRoute, Route } from '../contracts';
import { loadFixtureY } from './fixture-y.testutil';
import { dominates, frontierLabels, paretoFrontier } from './frontier';
import { buildGraph } from './graph';
import { gridCase, loadSynthetic, randomCase, rng } from './graphs.testutil';
import { createMeasureWorker, type MeasurePort } from './measure-client';
import { createMeasureHandler, type MeasureResponse } from './measure-protocol';
import { isSafe, LARGE_GRAPH_EDGES, optimizeCase, RouteEnumerator } from './optimizer';
import { DFS_PATH_CAP, simplePaths, yenKShortest } from './paths';
import { PRESET_IDS, WIRE_PRESETS } from './presets';

const opt = (c: LoadedCase, targetId: string, extra: Partial<Parameters<typeof optimizeCase>[1]> = {}) =>
  optimizeCase(buildGraph(c), { caseId: c.id, targetId, ...extra });

describe('wire presets (spec §4.3)', () => {
  it('are the three spec presets, labelled illustrative', () => {
    expect(WIRE_PRESETS.map((p) => [p.id, p.tipAngleDeg, p.stiffness])).toEqual([
      ['soft_angled', 45, 'low'],
      ['standard_j', 60, 'medium'],
      ['stiff_straight', 0, 'high'],
    ]);
    for (const p of WIRE_PRESETS) {
      expect(p.illustrative).toBe(true);
      expect(p.diameterM).toBeCloseTo(0.000889, 9);
      expect(p.minVesselDiameterM).toBeCloseTo(p.diameterM + 0.001, 12);
    }
    const max = WIRE_PRESETS.map((p) => p.maxTurnDeg);
    expect(max).toEqual([...max].sort((a, b) => b - a)); // softer tips enter sharper turns
  });
});

describe('diamond: closed-form frontier', () => {
  // From the fixture's closed forms (tests/fixtures/synthetic/diamond) and the preset limits:
  //   A-wide: turns 45 then 90, r 5      → soft (110) ok; J (80) and stiff (40) too sharp
  //   B-narrow: turns 38 then 76, r 1.2  → soft and J ok; stiff too sharp (76 > 40)
  //   C-pinhole: r 0.8 (1.6 < 1.889 mm)  → too narrow for every preset
  //   D-bypass: crosses forbidden_d      → never routed
  // B is shorter, gentler and needs less fluoro than A; A is wider and clear of prox_b; so the
  // frontier is soft-A, soft-B and J-B. soft-B and J-B have identical costs.
  const c = loadSynthetic('diamond');
  const f = opt(c, 'top') as Frontier;
  const A = 'e0,e1,e2';
  const B = 'e0,e3,e4';
  const id = (p: string, e: string) => `in|${p}|${e}`;

  it('enumerates all four paths for every preset', () => {
    expect(f.kind).toBe('frontier');
    expect(f.candidates).toHaveLength(4 * 3);
    expect(new Set(f.candidates.map((r) => r.edges.join(',')))).toEqual(new Set([A, B, 'e0,e5', 'e6']));
  });

  it('returns exactly the closed-form frontier', () => {
    expect(f.routes.map((r) => r.id).sort()).toEqual([id('soft_angled', A), id('soft_angled', B), id('standard_j', B)].sort());
    expect(f.minHeavyCrossings).toBe(0);
    expect(f.recordedRunsUsed).toBe(false);
  });

  it('labels B shortest, gentlest and least radiation, A widest and farthest from risk', () => {
    const labels = Object.fromEntries(f.routes.map((r) => [r.id, [...r.labels].sort()]));
    expect(labels[id('soft_angled', A)]).toEqual(['farthest_from_risk', 'widest']);
    expect(labels[id('soft_angled', B)]).toEqual(['gentlest', 'least_radiation', 'shortest']);
    expect(labels[id('standard_j', B)]).toEqual(['gentlest', 'least_radiation', 'shortest']);
  });

  it('reports the violated constraints', () => {
    const v = (p: string, e: string) => f.candidates.find((r) => r.id === id(p, e))!.violations;
    for (const p of PRESET_IDS) {
      expect(v(p, 'e0,e5')).toEqual([{ kind: 'too_narrow', edge: 'e5', diameterM: 0.0016, requiredM: 0.000889 + 0.001 }]);
      expect(v(p, 'e6')).toEqual([{ kind: 'forbidden_zone', edge: 'e6', zone: 'forbidden_d' }]);
    }
    const j = v('standard_j', A);
    expect(j.map((x) => [x.kind, 'edge' in x ? x.edge : ''])).toEqual([['turn_too_sharp', 'e2']]);
    expect(v('stiff_straight', A).map((x) => ('edge' in x ? x.edge : ''))).toEqual(['e1', 'e2']);
    expect(v('stiff_straight', B).map((x) => ('edge' in x ? x.edge : ''))).toEqual(['e4']);
    const turn = j[0]!;
    if (turn.kind === 'turn_too_sharp') {
      expect(turn.turnDeg).toBeCloseTo(90, 1);
      expect(turn.maxTurnDeg).toBe(80);
    }
  });
});

describe('fixture-y', () => {
  const c = loadFixtureY();

  it('left: soft and J are on the frontier, stiff fails the 45° takeoff, and no labels apply', () => {
    const f = opt(c, 'left_branch') as Frontier;
    expect(f.routes.map((r) => r.presetId)).toEqual(['soft_angled', 'standard_j']);
    expect(f.routes.every((r) => r.labels.length === 0)).toBe(true); // identical costs: no label says anything
    const stiff = f.candidates.find((r) => r.presetId === 'stiff_straight')!;
    expect(stiff.feasible).toBe(false);
    expect(stiff.violations.map((x) => x.kind)).toEqual(['turn_too_sharp']);
  });

  it('right: no safe route, blocked by the plaque, and no change helps', () => {
    const n = opt(c, 'right_branch') as NoSafeRoute;
    expect(n.kind).toBe('no_safe_route');
    expect(n.crossings).toEqual([{ zone: 'plaque_r', tier: 'heavy', edge: 'e_right' }]);
    expect(n.suggestion).toBeNull();
  });

  it('suggests another preset when the requested one cannot make the turn', () => {
    const n = opt(c, 'left_branch', { presetIds: ['stiff_straight'] }) as NoSafeRoute;
    expect(n.kind).toBe('no_safe_route');
    expect(n.reasons.map((x) => x.kind)).toEqual(['turn_too_sharp']);
    expect(n.suggestion).toEqual({ change: 'preset', presetId: 'soft_angled' });
  });
});

describe('no safe route: entry and entry + preset suggestions', () => {
  // diamond with a heavy zone on the trunk (so nothing from "in" is safe), plus entries at nA
  // (straight down e2, fine even for stiff) or n1 (every way on needs a turn > 40°)
  const base = loadSynthetic('diamond');
  const withEntry = (node: string, id: string): LoadedCase => ({
    ...base,
    entries: [...base.entries, { id, name: id, node }],
    riskZones: [...base.riskZones, { id: 'heavy_trunk', kind: 'plaque', tier: 'heavy', edge: 'e0', fromM: 0.01, toM: 0.02 }],
  });

  it('suggests another entry', () => {
    const n = opt(withEntry('nA', 'side'), 'top', { entryIds: ['in'], presetIds: ['stiff_straight'] }) as NoSafeRoute;
    expect(n.kind).toBe('no_safe_route');
    // with the stiff wire nothing from "in" is even feasible, so the reasons are constraints
    expect(new Set(n.reasons.map((x) => x.kind))).toEqual(new Set(['turn_too_sharp', 'too_narrow', 'forbidden_zone']));
    expect(n.suggestion).toEqual({ change: 'entry', entryId: 'side' });
  });

  it('reports heavy crossings that block otherwise feasible routes', () => {
    const n = opt(withEntry('nA', 'side'), 'top', { entryIds: ['in'], presetIds: ['soft_angled'] }) as NoSafeRoute;
    expect(n.kind).toBe('no_safe_route');
    expect(n.crossings).toEqual([{ zone: 'heavy_trunk', tier: 'heavy', edge: 'e0' }]);
    expect(n.suggestion).toEqual({ change: 'entry', entryId: 'side' });
  });

  it('suggests another entry and preset', () => {
    const n = opt(withEntry('n1', 'mid'), 'top', { entryIds: ['in'], presetIds: ['stiff_straight'] }) as NoSafeRoute;
    expect(n.suggestion).toEqual({ change: 'entry_and_preset', entryId: 'mid', presetId: 'soft_angled' });
  });
});

/** Every property the frontier and the constraints must hold for one optimize result. */
function checkInvariants(c: LoadedCase, targetId: string) {
  const g = buildGraph(c);
  const res = optimizeCase(g, { caseId: c.id, targetId });
  const en = new RouteEnumerator(g);
  const all: Route[] = [];
  for (const e of g.entries.keys()) for (const p of PRESET_IDS) all.push(...en.routes(e, targetId, p));
  const forbiddenEdges = new Set(
    c.riskZones.filter((z) => z.tier === 'forbidden' && g.edges.get(z.edge)!.measures.zonesOnEdge.includes(z.id)).map((z) => z.edge),
  );

  for (const r of all) {
    // a forbidden zone is never routed through
    if (r.edges.some((e) => forbiddenEdges.has(e))) expect(r.feasible).toBe(false);
    expect(r.feasible).toBe(r.violations.length === 0);
    expect(new Set(r.nodes).size).toBe(r.nodes.length); // simple
    expect(r.nodes[0]).toBe(g.entries.get(r.entryId));
    expect(r.nodes.at(-1)).toBe(g.targets.get(targetId));
    expect(r.id).toBe(`${r.entryId}|${r.presetId}|${r.edges.join(',')}`);
  }
  for (const e of g.entries.keys())
    for (const p of PRESET_IDS) expect(all.filter((r) => r.entryId === e && r.presetId === p).length).toBeLessThanOrEqual(DFS_PATH_CAP);

  const safe = all.filter(isSafe);
  if (res.kind === 'no_safe_route') {
    expect(safe).toEqual([]);
    return { frontier: 0 };
  }
  for (const r of res.routes) {
    expect(isSafe(r)).toBe(true);
    expect(r.edges.some((e) => forbiddenEdges.has(e))).toBe(false);
    // no dominated route on the frontier
    for (const o of safe) expect(dominates(o.cost, r.cost)).toBe(false);
  }
  // and nothing non-dominated is missing
  const ids = new Set(res.routes.map((r) => r.id));
  for (const o of safe) if (!ids.has(o.id)) expect(safe.some((x) => dominates(x.cost, o.cost))).toBe(true);
  return { frontier: res.routes.length };
}

describe('property: random multi-path graphs', () => {
  it('frontiers are non-dominated and complete, constraints hold, forbidden zones never routed', () => {
    let frontiers = 0;
    let safeRoutes = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const c = randomCase(seed);
      for (const t of c.targets) {
        const { frontier } = checkInvariants(c, t.id);
        if (frontier > 0) frontiers++;
        safeRoutes += frontier;
      }
    }
    // the generator really exercises frontiers, not only "no safe route"
    expect(frontiers).toBeGreaterThan(20);
    expect(safeRoutes).toBeGreaterThan(frontiers);
  });

  it('is deterministic', () => {
    for (const seed of [3, 17, 42]) {
      const c = randomCase(seed);
      expect(opt(c, 't0')).toEqual(opt(c, 't0'));
    }
  });
});

describe('property: frontier over random cost vectors (spec §4.9)', () => {
  it('never keeps a dominated vector and never drops a non-dominated one', () => {
    const r = rng(7);
    for (let trial = 0; trial < 40; trial++) {
      const items = Array.from({ length: 60 }, (_, i) => {
        // coarse values so ties are common
        const q = () => Math.round(r() * 6);
        const cost: CostVector = {
          lengthM: q(),
          sharpestTurnDeg: q(),
          totalTurningDeg: q(),
          narrowestRadiusM: q(),
          heavyCrossings: 0,
          proximityPenalty: q(),
          estFluoroS: q(),
        };
        return { i, cost };
      });
      const front = paretoFrontier(items);
      const inFront = new Set(front.map((x) => x.i));
      for (const a of front) for (const b of items) expect(dominates(b.cost, a.cost)).toBe(false);
      for (const b of items) if (!inFront.has(b.i)) expect(items.some((a) => dominates(a.cost, b.cost))).toBe(true);
    }
  });

  it('labels only measures that differ', () => {
    const base = opt(loadSynthetic('diamond'), 'top') as Frontier;
    const same = [base.routes[1]!, base.routes[2]!].filter((r) => r.edges.join(',') === 'e0,e3,e4');
    expect(frontierLabels(same).every((l) => l.length === 0)).toBe(true);
  });
});

describe("Yen's k-shortest and large graphs", () => {
  it('matches exhaustive enumeration on a small grid', () => {
    const c = gridCase(3, 4);
    const g = buildGraph(c);
    const from = 'g0_0';
    const to = 'g2_3';
    const len = (edges: string[]) => edges.reduce((a, e) => a + g.edges.get(e)!.measures.lengthM, 0);
    const all = simplePaths(g, from, to, 100_000).map((p) => len(p.edges)).sort((a, b) => a - b);
    const yen = yenKShortest(g, from, to, 10);
    expect(yen).toHaveLength(10);
    yen.forEach((p, i) => {
      expect(new Set(p.nodes).size).toBe(p.nodes.length);
      expect(len(p.edges)).toBeCloseTo(all[i]!, 12);
    });
  });

  it('switches to Yen on graphs with more than LARGE_GRAPH_EDGES edges', () => {
    const c = gridCase(7, 7);
    const g = buildGraph(c);
    expect(g.edges.size).toBeGreaterThan(LARGE_GRAPH_EDGES);
    expect(new RouteEnumerator(g).large).toBe(true);
    const f = opt(c, 't0') as Frontier;
    for (const p of PRESET_IDS) expect(f.candidates.filter((r) => r.presetId === p).length).toBeLessThanOrEqual(10);
    expect(f.kind).toBe('frontier');
    expect(checkInvariants(c, 't0').frontier).toBeGreaterThan(0);
  });
});

describe('optimize through the Worker client', () => {
  it('returns what optimizeCase returns', async () => {
    const handle = createMeasureHandler();
    const port: MeasurePort = {
      onmessage: null,
      postMessage(m) {
        const msg = structuredClone(m);
        queueMicrotask(() => port.onmessage?.({ data: structuredClone(handle(msg)) } as MessageEvent<MeasureResponse>));
      },
      terminate() {},
    };
    const w = createMeasureWorker(() => port);
    const c = loadSynthetic('diamond');
    await w.load(c);
    expect(await w.optimize({ caseId: c.id, targetId: 'top' })).toEqual(opt(c, 'top'));
    await expect(w.optimize({ caseId: c.id, targetId: 'nope' })).rejects.toThrow(/unknown target/);
  });
});
