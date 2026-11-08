/**
 * G1: TypeScript measures against the NumPy reference on the generated cases (spec §4.9).
 *
 * tests/crosscheck/numpy-cases.json holds NumPy's per-edge measures and every entry → target route
 * for type-iii and low-tort (`python tests/crosscheck/dump_numpy.py`; a pytest fails if it's stale).
 * Here the app's path (loadCase → buildGraph → measureRoute) must match it within 0.1 mm and 0.5°,
 * and every frontier route the optimizer offers must be one of the routes NumPy measured.
 */

import { describe, expect, it } from 'vitest';
import { buildGraph, measureRoute, optimizeCase, orientRoute } from '../../client/src/optimize';
import { DEG, G1_CASES, loadBundled, MM, readJson, REPO } from './engine.testutil';

interface NumpyEdge {
  L_mm: number;
  theta_max_deg: number;
  theta_sum_deg: number;
  r_min_mm: number;
  proximity_clearance_mm: number | null;
  overlapping_zones: string[];
}
interface NumpyRoute {
  edges: string[];
  reversed: boolean[];
  L_mm: number;
  theta_max_deg: number;
  theta_sum_deg: number;
  r_min_mm: number;
  heavy_crossings: number;
  proximity_penalty: number;
}
type NumpyCases = Record<string, { edges: Record<string, NumpyEdge>; routes: Record<string, NumpyRoute> }>;

const NUMPY = readJson<NumpyCases>(REPO, 'tests/crosscheck/numpy-cases.json');
/** 0.1 mm of clearance moves the proximity penalty by 0.01 (clearance / 10 mm). */
const PENALTY = MM / 10;

for (const id of G1_CASES) {
  describe(`NumPy cross-check on ${id}`, async () => {
    const np = NUMPY[id];
    const c = await loadBundled(id);
    const g = buildGraph(c);

    it('NumPy has every edge and one route per entry × target', () => {
      expect(np, `${id} missing from numpy-cases.json; run dump_numpy.py`).toBeDefined();
      expect(Object.keys(np!.edges).sort()).toEqual([...g.edges.keys()].sort());
      const pairs = c.entries.flatMap((e) => c.targets.map((t) => `${e.id}-to-${t.id}`)).sort();
      expect(Object.keys(np!.routes).sort()).toEqual(pairs);
    });

    for (const [eid, want] of Object.entries(np?.edges ?? {})) {
      it(`edge ${eid}`, () => {
        const m = g.edges.get(eid)!.measures;
        expect(Math.abs(m.lengthM * 1000 - want.L_mm)).toBeLessThanOrEqual(MM);
        expect(Math.abs(m.thetaMaxDeg - want.theta_max_deg)).toBeLessThanOrEqual(DEG);
        expect(Math.abs(m.thetaSumDeg - want.theta_sum_deg)).toBeLessThanOrEqual(DEG);
        expect(Math.abs(m.rMinM * 1000 - want.r_min_mm)).toBeLessThanOrEqual(MM);
        if (want.proximity_clearance_mm === null) expect(m.minProximityClearanceM).toBeNull();
        else expect(Math.abs(m.minProximityClearanceM! * 1000 - want.proximity_clearance_mm)).toBeLessThanOrEqual(MM);
        expect(m.zonesOnEdge).toEqual(want.overlapping_zones);
      });
    }

    for (const [rid, want] of Object.entries(np?.routes ?? {})) {
      it(`route ${rid}`, () => {
        expect(orientRoute(g, want.edges).reversed).toEqual(want.reversed);
        const got = measureRoute(g, want.edges).cost;
        expect(Math.abs(got.lengthM * 1000 - want.L_mm)).toBeLessThanOrEqual(MM);
        expect(Math.abs(got.sharpestTurnDeg - want.theta_max_deg)).toBeLessThanOrEqual(DEG);
        expect(Math.abs(got.totalTurningDeg - want.theta_sum_deg)).toBeLessThanOrEqual(DEG);
        expect(Math.abs(got.narrowestRadiusM * 1000 - want.r_min_mm)).toBeLessThanOrEqual(MM);
        expect(got.heavyCrossings).toBe(want.heavy_crossings);
        expect(Math.abs(got.proximityPenalty - want.proximity_penalty)).toBeLessThanOrEqual(PENALTY);
      });
    }

    it('every frontier route, on every target, is a route NumPy measured', () => {
      const measured = new Set(Object.values(np?.routes ?? {}).map((r) => r.edges.join(',')));
      let n = 0;
      for (const t of c.targets) {
        const res = optimizeCase(g, { caseId: c.id, targetId: t.id });
        if (res.kind !== 'frontier') continue;
        for (const r of res.routes) {
          expect(measured, `${t.id}: ${r.id}`).toContain(r.edges.join(','));
          n++;
        }
      }
      expect(n).toBeGreaterThan(0);
    });
  });
}
