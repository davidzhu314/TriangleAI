/**
 * V2: the graph and measureRoute, on the full path the app uses (case files → LoadedCase in metres
 * Y-up → graph → measures). It checks:
 * - closed-form answers on the synthetic fixtures (the truth), within 0.1 mm and 0.5°;
 * - the NumPy reference on the synthetic fixtures and fixture-y, within 0.1 mm and 0.5° (spec §4.9).
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CaseJson, CenterlinesJson, LoadedCase } from '../contracts';
import { loadFixtureY } from './fixture-y.testutil';
import { buildGraph } from './graph';
import { measureRoute, orientRoute, RouteError } from './measure-route';
import { FLUORO_S_PER_CM, FLUORO_S_PER_TURN } from './constants';
import { buildTestLoadedCase } from './case-builder.testutil';

const REPO = join(import.meta.dirname, '../../..');
const SYNTH = join(REPO, 'tests/fixtures/synthetic');
const MM = 0.1;
const DEG = 0.5;
/** 0.1 mm of clearance moves the proximity penalty by 0.01. */
const PENALTY = MM / 10;

interface ExpectedEdge {
  L_mm: number;
  theta_max_deg: number;
  theta_sum_deg: number;
  r_min_mm: number;
  proximity_clearance_mm: number | null;
  overlapping_zones: string[];
}
interface RouteNumbers {
  edges: string[];
  reversed: boolean[];
  L_mm: number;
  theta_max_deg: number;
  theta_sum_deg: number;
  r_min_mm: number;
  heavy_crossings: number;
  proximity_penalty: number;
}
interface NumpyFile {
  [name: string]: { edges: Record<string, ExpectedEdge>; routes: Record<string, RouteNumbers> };
}

const readJson = <T>(...p: string[]): T => JSON.parse(readFileSync(join(...p), 'utf8')) as T;
const NUMPY_SYNTH = readJson<NumpyFile>(REPO, 'tests/crosscheck/numpy-synthetic.json');
const NUMPY_CASES = readJson<NumpyFile>(REPO, 'tests/crosscheck/numpy-cases.json');

const FIXTURES = readdirSync(SYNTH)
  .filter((d) => existsSync(join(SYNTH, d, 'expected.json')))
  .sort();

function synthCase(name: string): LoadedCase {
  return buildTestLoadedCase(
    readJson<CaseJson>(SYNTH, name, 'case.json'),
    readJson<CenterlinesJson>(SYNTH, name, 'centerlines.json'),
  );
}

function expectEdge(got: ReturnType<typeof buildGraph>['edges'] extends ReadonlyMap<string, infer E> ? E : never, want: ExpectedEdge) {
  const m = got.measures;
  expect(Math.abs(m.lengthM * 1000 - want.L_mm)).toBeLessThanOrEqual(MM);
  expect(Math.abs(m.thetaMaxDeg - want.theta_max_deg)).toBeLessThanOrEqual(DEG);
  expect(Math.abs(m.thetaSumDeg - want.theta_sum_deg)).toBeLessThanOrEqual(DEG);
  expect(Math.abs(m.rMinM * 1000 - want.r_min_mm)).toBeLessThanOrEqual(MM);
  if (want.proximity_clearance_mm === null) expect(m.minProximityClearanceM).toBeNull();
  else expect(Math.abs(m.minProximityClearanceM! * 1000 - want.proximity_clearance_mm)).toBeLessThanOrEqual(MM);
  expect(m.zonesOnEdge).toEqual(want.overlapping_zones);
}

function expectRoute(c: LoadedCase, r: RouteNumbers) {
  const g = buildGraph(c);
  const got = measureRoute(g, r.edges);
  expect(orientRoute(g, r.edges).reversed).toEqual(r.reversed);
  expect(Math.abs(got.cost.lengthM * 1000 - r.L_mm)).toBeLessThanOrEqual(MM);
  expect(Math.abs(got.cost.sharpestTurnDeg - r.theta_max_deg)).toBeLessThanOrEqual(DEG);
  expect(Math.abs(got.cost.totalTurningDeg - r.theta_sum_deg)).toBeLessThanOrEqual(DEG);
  expect(Math.abs(got.cost.narrowestRadiusM * 1000 - r.r_min_mm)).toBeLessThanOrEqual(MM);
  expect(got.cost.heavyCrossings).toBe(r.heavy_crossings);
  expect(Math.abs(got.cost.proximityPenalty - r.proximity_penalty)).toBeLessThanOrEqual(PENALTY);
  expect(got.cost.simPeakForceN).toBeUndefined();
  expect(got.cost.simSuccessRate).toBeUndefined();
}

describe('closed form, through LoadedCase → graph → measureRoute', () => {
  for (const name of FIXTURES) {
    const exp = readJson<{ edges: Record<string, ExpectedEdge>; routes?: (RouteNumbers & { id: string })[] }>(SYNTH, name, 'expected.json');
    const c = synthCase(name);
    const g = buildGraph(c);
    for (const [eid, want] of Object.entries(exp.edges)) {
      it(`${name}:${eid} edge measures`, () => expectEdge(g.edges.get(eid)!, want));
    }
    for (const r of exp.routes ?? []) {
      it(`${name}:${r.id} route`, () => expectRoute(c, r));
    }
  }
});

describe('NumPy cross-check (spec §4.9: 0.1 mm, 0.5°)', () => {
  const cases: [string, NumpyFile[string], () => LoadedCase][] = [
    ...FIXTURES.map((n) => [n, NUMPY_SYNTH[n]!, () => synthCase(n)] as [string, NumpyFile[string], () => LoadedCase]),
    ['fixture-y', NUMPY_CASES['fixture-y']!, loadFixtureY],
  ];
  for (const [name, np, load] of cases) {
    const c = load();
    const g = buildGraph(c);
    for (const [eid, want] of Object.entries(np.edges)) {
      it(`${name}:${eid} edge`, () => expectEdge(g.edges.get(eid)!, want));
    }
    for (const [rid, r] of Object.entries(np.routes)) {
      it(`${name}:${rid} route`, () => expectRoute(c, r));
    }
  }

  it('includes fixture-y and the junction fixture', () => {
    expect(Object.keys(NUMPY_CASES['fixture-y']!.routes).sort()).toEqual(['to-left', 'to-right', 'trunk']);
    expect(Object.keys(NUMPY_SYNTH['junction']!.routes)).toContain('parent-to-retro');
  });
});

describe('measureRoute details', () => {
  const y = loadFixtureY();
  const g = buildGraph(y);

  it('reports the plaque crossing on the right branch, not as a violation', () => {
    const m = measureRoute(g, ['e_aorta', 'e_right']);
    expect(m.crossings).toEqual([{ zone: 'plaque_r', tier: 'heavy', edge: 'e_right' }]);
    expect(m.cost.heavyCrossings).toBe(1);
    expect(m.violations).toEqual([]);
  });

  it('turns a forbidden zone into a violation', () => {
    const forbidden: LoadedCase = { ...y, riskZones: y.riskZones.map((z) => ({ ...z, tier: 'forbidden' as const })) };
    const m = measureRoute(buildGraph(forbidden), ['e_aorta', 'e_right']);
    expect(m.violations).toEqual([{ kind: 'forbidden_zone', edge: 'e_right', zone: 'plaque_r' }]);
    expect(m.cost.heavyCrossings).toBe(0);
  });

  it('puts the takeoff in the edge being entered', () => {
    expect(measureRoute(g, ['e_aorta', 'e_left']).sharpestTurnEdge).toBe('e_left');
    expect(measureRoute(g, ['e_aorta']).sharpestTurnEdge).toBeNull();
    const j = buildGraph(synthCase('junction'));
    expect(measureRoute(j, ['e0', 'e1']).sharpestTurnEdge).toBe('e1');
  });

  it('estimates fluoro from length and turning with the illustrative coefficients', () => {
    const m = measureRoute(g, ['e_aorta', 'e_left']);
    expect(m.cost.estFluoroS).toBeCloseTo(m.cost.lengthM * 100 * FLUORO_S_PER_CM + (m.cost.totalTurningDeg / 90) * FLUORO_S_PER_TURN, 9);
  });

  it('measures partial routes: one edge, grown edge by edge', () => {
    const one = measureRoute(g, ['e_aorta']);
    const two = measureRoute(g, ['e_aorta', 'e_left']);
    expect(one.cost.lengthM).toBeCloseTo(0.1, 6);
    expect(two.cost.lengthM).toBeGreaterThan(one.cost.lengthM);
    expect(two.cost.narrowestRadiusM).toBeLessThan(one.cost.narrowestRadiusM);
  });

  it('orients a one-edge route away from the entry and honours startNode', () => {
    expect(orientRoute(g, ['e_aorta']).nodes).toEqual(['n_entry', 'n_split']);
    expect(orientRoute(g, ['e_left']).nodes).toEqual(['n_split', 'n_left']);
    expect(orientRoute(g, ['e_left'], { startNode: 'n_left' }).nodes).toEqual(['n_left', 'n_split']);
    expect(orientRoute(g, ['e_left', 'e_right']).nodes).toEqual(['n_left', 'n_split', 'n_right']);
  });

  it('rejects empty, unknown and broken chains', () => {
    expect(() => measureRoute(g, [])).toThrow(RouteError);
    expect(() => measureRoute(g, ['nope'])).toThrow(/unknown edge/);
    expect(() => measureRoute(g, ['e_aorta', 'e_left'], { startNode: 'n_left' })).toThrow(/does not continue/);
  });
});
