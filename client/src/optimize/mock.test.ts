import { describe, expect, it } from 'vitest';
import { MEASURE_LOWER_IS_BETTER, type CostVector, type Frontier, type MeasureKey, type NoSafeRoute } from '../contracts';
import { loadFixtureY, readFixtureY } from './fixture-y.testutil';
import { lengthMm, routeTurningMeasures, zoneOverlapsEdge } from './measures';
import { buildTestLoadedCase } from './case-builder.testutil';
import { mockOptimize, mockOptimizeSync, mockRouteId } from './mock';

describe('mock LoadedCase from fixture-y', () => {
  const c = loadFixtureY();

  it('converts RAS mm to Y-up metres once', () => {
    const split = c.nodes.find((n) => n.id === 'n_split')!;
    expect(split.pos[0]).toBeCloseTo(0, 12);
    expect(split.pos[1]).toBeCloseTo(0.1, 12); // RAS S = 100 mm → Y = 0.1 m
    expect(split.pos[2]).toBeCloseTo(0, 12);
    const aorta = c.edges.find((e) => e.id === 'e_aorta')!;
    expect(aorta.lengthM).toBeCloseTo(0.1, 9);
    expect(Math.min(...aorta.radiiM)).toBeCloseTo(0.012, 12);
    expect(aorta.points).toHaveLength(aorta.radiiM.length);
  });

  it('carries zones in metres, targets reachable, planning only, budget', () => {
    expect(c.riskZones).toEqual([{ id: 'plaque_r', kind: 'plaque', tier: 'heavy', edge: 'e_right', fromM: 0.01, toM: 0.035 }]);
    expect(c.targets.every((t) => t.reachable)).toBe(true);
    expect(c.planningOnly).toBe(true);
    expect(c.fluoroBudgetS).toBe(60);
    expect(c.mesh.glb.byteLength).toBeGreaterThan(0);
  });

  it('marks a target unreachable when its node is cut off', () => {
    const { caseJson, centerlines } = readFixtureY();
    const cut = { ...centerlines, edges: centerlines.edges.filter((e) => e.id !== 'e_right') };
    const t = buildTestLoadedCase(caseJson, cut).targets.find((x) => x.id === 'right_branch')!;
    expect(t.reachable).toBe(false);
  });
});

function dominates(a: CostVector, b: CostVector): boolean {
  let strictly = false;
  for (const k of Object.keys(MEASURE_LOWER_IS_BETTER) as MeasureKey[]) {
    const x = a[k];
    const y = b[k];
    if (x === undefined || y === undefined) continue;
    const better = MEASURE_LOWER_IS_BETTER[k] ? x < y : x > y;
    const worse = MEASURE_LOWER_IS_BETTER[k] ? x > y : x < y;
    if (worse) return false;
    if (better) strictly = true;
  }
  return strictly;
}

describe('mock optimizer', () => {
  const c = loadFixtureY();
  const f = mockOptimizeSync({ caseId: 'fixture-y', targetId: 'left_branch' }) as Frontier;

  it('returns a three-route frontier for the left branch', () => {
    expect(f.kind).toBe('frontier');
    expect(f.routes).toHaveLength(3);
    expect(new Set(f.routes.map((r) => r.presetId))).toEqual(new Set(['standard_j', 'soft_angled', 'stiff_straight']));
    expect(f.recordedRunsUsed).toBe(false);
    expect(f.minHeavyCrossings).toBe(0);
  });

  it('builds routes that are valid on fixture-y', () => {
    for (const r of f.routes) {
      expect(r.id).toBe(mockRouteId(r.presetId, r.edges, r.entryId));
      expect(r.nodes).toHaveLength(r.edges.length + 1);
      expect(c.entries.find((e) => e.id === r.entryId)!.node).toBe(r.nodes[0]);
      expect(c.targets.find((t) => t.id === r.targetId)!.node).toBe(r.nodes[r.nodes.length - 1]);
      r.edges.forEach((id, i) => {
        const e = c.edges.find((x) => x.id === id)!;
        expect([e.from, e.to].sort()).toEqual([r.nodes[i], r.nodes[i + 1]].sort());
      });
      expect(r.feasible).toBe(true);
      expect(r.violations).toEqual([]);
      expect(r.cost.simPeakForceN).toBeUndefined();
      expect(r.cost.simSuccessRate).toBeUndefined();
      expect(f.candidates.map((x) => x.id)).toContain(r.id);
    }
  });

  it('has no dominated route on the frontier', () => {
    for (const a of f.routes) for (const b of f.routes) if (a !== b) expect(dominates(a.cost, b.cost)).toBe(false);
  });

  it('labels each route with the measure it is best at', () => {
    const best = (k: MeasureKey) => f.routes.reduce((m, r) => ((r.cost[k] as number) < (m.cost[k] as number) ? r : m));
    expect(best('lengthM').labels).toContain('shortest');
    expect(best('sharpestTurnDeg').labels).toContain('gentlest');
    expect(best('estFluoroS').labels).toContain('least_radiation');
  });

  it('matches fixture-y on what geometry decides: zero crossings left, the plaque blocks the right', () => {
    // left: no zone on the path; the takeoff is 45° (real measures, mm)
    const mm = (id: string) => c.edges.find((e) => e.id === id)!.points.map((p) => p.map((v) => v * 1000) as [number, number, number]);
    const left = routeTurningMeasures([mm('e_aorta'), mm('e_left')], [false, false]);
    expect(left.thetaMaxDeg).toBeCloseTo(45, 3);
    expect(c.riskZones.filter((z) => f.routes[0]!.edges.includes(z.edge))).toEqual([]);

    const n = mockOptimizeSync({ caseId: 'fixture-y', targetId: 'right_branch' }) as NoSafeRoute;
    expect(n.kind).toBe('no_safe_route');
    expect(n.suggestion).toBeNull();
    const zone = c.riskZones.find((z) => z.id === n.crossings[0]!.zone)!;
    expect(zone.tier).toBe('heavy');
    expect(zone.edge).toBe('e_right');
    expect(zoneOverlapsEdge(lengthMm(mm('e_right')), zone.fromM * 1000, zone.toM * 1000)).toBe(true);
  });

  it('filters presets, returns fresh objects, and is async-compatible', async () => {
    const one = mockOptimizeSync({ caseId: 'fixture-y', targetId: 'left_branch', presetIds: ['soft_angled'] }) as Frontier;
    expect(one.routes.map((r) => r.presetId)).toEqual(['soft_angled']);
    f.routes[0]!.cost.lengthM = -1;
    expect(((await mockOptimize({ caseId: 'fixture-y', targetId: 'left_branch' })) as Frontier).routes[0]!.cost.lengthM).toBeGreaterThan(0);
  });

  it('refuses cases it does not know', () => {
    expect(() => mockOptimizeSync({ caseId: 'type-iii', targetId: 'x' })).toThrow(/only knows fixture-y/);
  });
});
