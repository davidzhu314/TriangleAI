/**
 * V3 review items (PR #11):
 * - turn attribution when two junctions are less than 5 mm apart (nearest junction wins);
 * - unsafe routes (a violation or a heavy crossing) still get a full cost vector;
 * - with no recorded runs, the arch rule and the two simulated measures are absent, not zero.
 */

import { describe, expect, it } from 'vitest';
import type { CostVector, Frontier, LoadedCase, LoadedEdge, Route, Vec3 } from '../contracts';
import { loadFixtureY } from './fixture-y.testutil';
import { buildGraph } from './graph';
import { loadSynthetic, randomCase } from './graphs.testutil';
import { attributeSample, measureRoute, measureRouteDetailed } from './measure-route';
import { isSafe, optimizeCase, RouteEnumerator } from './optimizer';
import { PRESET_IDS } from './presets';

describe('turn attribution: two junctions less than 5 mm apart', () => {
  it('gives each sample to the nearest junction within w, ties to the first entered', () => {
    const J = [10, 13];
    const w = 5;
    expect(attributeSample(3, J, w)).toBe(0); // no junction within w: on the first edge
    expect(attributeSample(6, J, w)).toBe(1); // 4 from J1, 7 from J2
    expect(attributeSample(10, J, w)).toBe(1);
    expect(attributeSample(11, J, w)).toBe(1); // 1 from J1, 2 from J2
    expect(attributeSample(11.5, J, w)).toBe(1); // tie: first entered
    expect(attributeSample(12, J, w)).toBe(2); // 2 from J1, 1 from J2
    expect(attributeSample(16, J, w)).toBe(2);
    expect(attributeSample(19, J, w)).toBe(2); // no junction within w: on the last edge
  });

  /**
   * A jog: 50 mm up +Y, a 3 mm edge along +X, then 50 mm up +Y. The window at either corner sees
   * one straight 5 mm leg and the chord (3 along X, 2 along Y), so the peak there is atan(3/2) =
   * 56.31° (closed form). Under the old "count every junction within w ahead" rule, the turn into
   * the 3 mm edge was charged to the edge after it, and the 3 mm edge was skipped.
   */
  function jog(): LoadedCase {
    const seg = (id: string, from: string, to: string, a: Vec3, b: Vec3): LoadedEdge => {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const n = Math.round(L * 1000);
      const points = Array.from({ length: n + 1 }, (_, k) => [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n, 0] as Vec3);
      return { id, from, to, vessel: 'v', points, radiiM: points.map(() => 0.004), lengthM: L };
    };
    const p0: Vec3 = [0, 0, 0];
    const p1: Vec3 = [0, 0.05, 0];
    const p2: Vec3 = [0.003, 0.05, 0];
    const p3: Vec3 = [0.003, 0.1, 0];
    return {
      id: 'jog',
      title: 'jog',
      origin: 'bundled',
      source: { kind: 'parametric', license: 'test' },
      physics: { available: false },
      planningOnly: true,
      vessels: [{ id: 'v', name: 'v', kind: 'artery' }],
      entries: [{ id: 'in', name: 'in', node: 'n0' }],
      targets: [{ id: 'out', name: 'out', node: 'n3', reachable: true }],
      riskZones: [],
      nodes: [p0, p1, p2, p3].map((p, i) => ({ id: `n${i}`, pos: p, kind: 'branch' as const })),
      edges: [seg('e0', 'n0', 'n1', p0, p1), seg('e1', 'n1', 'n2', p1, p2), seg('e2', 'n2', 'n3', p2, p3)],
      mesh: { glb: new ArrayBuffer(0), toWorld: [], triangles: 0 },
      validation: [],
    };
  }

  it('keeps the turn into a 3 mm edge on that edge', () => {
    const g = buildGraph(jog());
    const d = measureRouteDetailed(g, ['e0', 'e1', 'e2']);
    const peak = (Math.atan(3 / 2) * 180) / Math.PI;
    expect(d.edgeMaxTurnDeg[0]).toBeLessThan(peak - 10); // the parent's own windows are gentler
    expect(d.edgeMaxTurnDeg[1]).toBeCloseTo(peak, 1);
    expect(d.edgeMaxTurnDeg[2]).toBeCloseTo(peak, 1);
    // both corners peak at the same closed-form value, so either may hold the sharpest window,
    // but never the parent edge
    expect(['e1', 'e2']).toContain(d.measures.sharpestTurnEdge);
  });

  it('flags both corners against their own edges for a 40° preset', () => {
    const c = jog();
    const stiff = new RouteEnumerator(buildGraph(c)).routes('in', 'out', 'stiff_straight')[0]!;
    expect(stiff.violations.map((v) => (v.kind === 'turn_too_sharp' ? v.edge : v.kind))).toEqual(['e1', 'e2']);
    const soft = new RouteEnumerator(buildGraph(c)).routes('in', 'out', 'soft_angled')[0]!;
    expect(soft.feasible).toBe(true);
  });
});

const REQUIRED: (keyof CostVector)[] = [
  'lengthM',
  'sharpestTurnDeg',
  'totalTurningDeg',
  'narrowestRadiusM',
  'heavyCrossings',
  'proximityPenalty',
  'estFluoroS',
];

function expectFullCost(cost: CostVector) {
  for (const k of REQUIRED) {
    expect(typeof cost[k], k).toBe('number');
    expect(Number.isFinite(cost[k]), k).toBe(true);
  }
}

describe('unsafe routes keep a full cost vector', () => {
  // diamond with a heavy zone on B's first leg: B is feasible for soft and J but unsafe
  const base = loadSynthetic('diamond');
  const c: LoadedCase = {
    ...base,
    riskZones: [...base.riskZones, { id: 'heavy_b', kind: 'plaque', tier: 'heavy', edge: 'e3', fromM: 0.002, toM: 0.008 }],
  };
  const g = buildGraph(c);
  const f = optimizeCase(g, { caseId: c.id, targetId: 'top' }) as Frontier;

  it('lists infeasible and heavy-crossing routes in candidates, with every measure', () => {
    expect(f.kind).toBe('frontier');
    const unsafe = f.candidates.filter((r) => !isSafe(r));
    expect(unsafe.some((r) => !r.feasible)).toBe(true);
    expect(unsafe.some((r) => r.feasible && r.cost.heavyCrossings > 0)).toBe(true);
    for (const r of f.candidates) expectFullCost(r.cost);
  });

  it('keeps them off the frontier', () => {
    const ids = new Set(f.routes.map((r) => r.id));
    for (const r of f.candidates) if (!isSafe(r)) expect(ids.has(r.id)).toBe(false);
    expect(f.routes.map((r) => r.id)).toEqual(['in|soft_angled|e0,e1,e2']);
  });

  it('gives a candidate the same cost as measureRoute on the player-built route', () => {
    for (const r of f.candidates) {
      expect(measureRoute(g, r.edges, { startNode: r.nodes[0]! }).cost).toEqual(r.cost);
    }
  });

  it('measures a route the player builds into a blocked target, where NoSafeRoute lists no candidates', () => {
    const y = loadFixtureY();
    const res = optimizeCase(buildGraph(y), { caseId: y.id, targetId: 'right_branch' });
    expect(res.kind).toBe('no_safe_route');
    const m = measureRoute(buildGraph(y), ['e_aorta', 'e_right']);
    expectFullCost(m.cost);
    expect(m.cost.heavyCrossings).toBe(1);
  });
});

describe('no recorded runs: arch rule and simulated measures are absent, not zero', () => {
  const all: Route[] = [];
  const frontiers: Frontier[] = [];
  for (const c of [loadSynthetic('diamond'), loadFixtureY(), ...[1, 2, 3, 4, 5].map(randomCase)]) {
    const g = buildGraph(c);
    const en = new RouteEnumerator(g);
    for (const t of c.targets) {
      for (const e of g.entries.keys()) for (const p of PRESET_IDS) all.push(...en.routes(e, t.id, p));
      const res = optimizeCase(g, { caseId: c.id, targetId: t.id }, en);
      if (res.kind === 'frontier') frontiers.push(res);
    }
  }

  it('leaves the simulated keys out of every cost vector', () => {
    expect(all.length).toBeGreaterThan(50);
    for (const r of all) {
      expect('simPeakForceN' in r.cost).toBe(false);
      expect('simSuccessRate' in r.cost).toBe(false);
      expect(Object.keys(r.cost).sort()).toEqual([...REQUIRED].sort());
    }
  });

  it('never applies the arch rule or the simulated labels', () => {
    for (const r of all) expect(r.violations.some((v) => v.kind === 'arch_never_reached')).toBe(false);
    for (const f of frontiers) {
      expect(f.recordedRunsUsed).toBe(false);
      for (const r of f.routes) expect(r.labels.filter((l) => l === 'lowest_force' || l === 'most_reliable')).toEqual([]);
    }
  });
});
