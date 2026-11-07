/**
 * TypeScript measures vs closed form on the synthetic fixtures (the truth; tolerances from
 * spec §4.9: 0.1 mm, 0.5°), and vs NumPy's own outputs to 1e-6, which shows the port follows the
 * same algorithm (tests/crosscheck/numpy-synthetic.json, written by dump_numpy.py).
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  angleBetween,
  joinRoute,
  lengthMm,
  polylineDistance,
  proximityClearanceMm,
  rMinMm,
  routeLengthMm,
  routeTurningMeasures,
  sub,
  subPolyline,
  turningMeasures,
  WINDOW_MM,
  zoneOverlapsEdge,
  type Point3,
} from './index';

const REPO = join(import.meta.dirname, '../../../..');
const SYNTH = join(REPO, 'tests/fixtures/synthetic');
const NUMPY = JSON.parse(readFileSync(join(REPO, 'tests/crosscheck/numpy-synthetic.json'), 'utf8')) as Record<
  string,
  { edges: Record<string, Measured>; routes: Record<string, RouteMeasured> }
>;

const MM = 0.1;
const DEG = 0.5;
const AGREE = 1e-6;

interface Edge {
  id: string;
  points: Point3[];
  radii_mm: number[];
}
interface Zone {
  id: string;
  tier: string;
  edge: string;
  from_mm: number;
  to_mm: number;
}
interface Measured {
  L_mm: number;
  theta_max_deg: number;
  theta_sum_deg: number;
  r_min_mm: number;
  proximity_clearance_mm: number | null;
  overlapping_zones: string[];
}
interface RouteExpected {
  id: string;
  edges: string[];
  reversed: boolean[];
  L_mm: number;
  theta_max_deg: number;
  theta_sum_deg: number;
  junction_deg: number[];
}
type RouteMeasured = Pick<Measured, 'L_mm' | 'theta_max_deg' | 'theta_sum_deg'>;
interface Expected {
  window_mm: number;
  tolerance: { mm: number; deg: number };
  edges: Record<string, Measured>;
  routes?: RouteExpected[];
}

const read = <T>(dir: string, f: string): T => JSON.parse(readFileSync(join(SYNTH, dir, f), 'utf8')) as T;

const FIXTURES = readdirSync(SYNTH)
  .filter((d) => existsSync(join(SYNTH, d, 'expected.json')))
  .sort();

function load(name: string) {
  const caseJson = read<{ riskZones: Zone[] }>(name, 'case.json');
  const cl = read<{ edges: Edge[] }>(name, 'centerlines.json');
  const exp = read<Expected>(name, 'expected.json');
  const byId = new Map(cl.edges.map((e) => [e.id, e]));
  return { zones: caseJson.riskZones, edges: cl.edges, byId, exp };
}

/** Compose the plain-array functions into the same per-edge record NumPy produces. */
function measureEdge(edge: Edge, zones: Zone[], byId: Map<string, Edge>): Measured {
  const L = lengthMm(edge.points);
  const { thetaMaxDeg, thetaSumDeg } = turningMeasures(edge.points);
  const zoneLines = zones
    .filter((z) => z.tier === 'proximity')
    .map((z) => subPolyline(byId.get(z.edge)!.points, z.from_mm, z.to_mm));
  return {
    L_mm: L,
    theta_max_deg: thetaMaxDeg,
    theta_sum_deg: thetaSumDeg,
    r_min_mm: rMinMm(edge.radii_mm),
    proximity_clearance_mm: proximityClearanceMm(edge.points, zoneLines),
    overlapping_zones: zones
      .filter((z) => z.edge === edge.id && zoneOverlapsEdge(L, z.from_mm, z.to_mm))
      .map((z) => z.id)
      .sort(),
  };
}

function measureRoute(name: string, r: RouteExpected): RouteMeasured {
  const { byId } = load(name);
  const polys = r.edges.map((id) => byId.get(id)!.points);
  const t = routeTurningMeasures(polys, r.reversed);
  return { L_mm: routeLengthMm(polys, r.reversed), theta_max_deg: t.thetaMaxDeg, theta_sum_deg: t.thetaSumDeg };
}

describe('synthetic fixtures', () => {
  it('include the required shapes and the junction', () => {
    for (const f of ['straight', 'arc90', 'helix', 'y-branch', 'junction']) expect(FIXTURES).toContain(f);
  });

  it('use the spec tolerances and window', () => {
    for (const f of FIXTURES) {
      const { exp } = load(f);
      expect(exp.tolerance).toEqual({ mm: MM, deg: DEG });
      expect(exp.window_mm).toBe(WINDOW_MM);
    }
  });
});

for (const name of FIXTURES) {
  const { zones, edges, byId, exp } = load(name);
  describe(`${name} edges`, () => {
    for (const edge of edges) {
      const want = exp.edges[edge.id]!;
      const got = measureEdge(edge, zones, byId);
      const np = NUMPY[name]!.edges[edge.id]!;

      it(`${edge.id} matches the closed form`, () => {
        expect(Math.abs(got.L_mm - want.L_mm)).toBeLessThanOrEqual(MM);
        expect(Math.abs(got.theta_max_deg - want.theta_max_deg)).toBeLessThanOrEqual(DEG);
        expect(Math.abs(got.theta_sum_deg - want.theta_sum_deg)).toBeLessThanOrEqual(DEG);
        expect(Math.abs(got.r_min_mm - want.r_min_mm)).toBeLessThanOrEqual(MM);
        if (want.proximity_clearance_mm === null) expect(got.proximity_clearance_mm).toBeNull();
        else expect(Math.abs(got.proximity_clearance_mm! - want.proximity_clearance_mm)).toBeLessThanOrEqual(MM);
        expect(got.overlapping_zones).toEqual(want.overlapping_zones);
      });

      it(`${edge.id} agrees with NumPy to 1e-6`, () => {
        expect(Math.abs(got.L_mm - np.L_mm)).toBeLessThan(AGREE);
        expect(Math.abs(got.theta_max_deg - np.theta_max_deg)).toBeLessThan(AGREE);
        expect(Math.abs(got.theta_sum_deg - np.theta_sum_deg)).toBeLessThan(AGREE);
        expect(Math.abs(got.r_min_mm - np.r_min_mm)).toBeLessThan(AGREE);
        if (np.proximity_clearance_mm === null) expect(got.proximity_clearance_mm).toBeNull();
        else expect(Math.abs(got.proximity_clearance_mm! - np.proximity_clearance_mm)).toBeLessThan(AGREE);
        expect(got.overlapping_zones).toEqual(np.overlapping_zones);
      });

      it(`${edge.id} is unchanged when walked backwards`, () => {
        const rev = [...edge.points].reverse();
        const f = turningMeasures(edge.points);
        const b = turningMeasures(rev);
        expect(Math.abs(lengthMm(rev) - lengthMm(edge.points))).toBeLessThan(1e-9);
        expect(Math.abs(b.thetaMaxDeg - f.thetaMaxDeg)).toBeLessThan(1e-6);
        expect(Math.abs(b.thetaSumDeg - f.thetaSumDeg)).toBeLessThan(1e-6);
      });
    }
  });

  if (exp.routes?.length) {
    describe(`${name} routes`, () => {
      for (const r of exp.routes!) {
        const got = measureRoute(name, r);
        const np = NUMPY[name]!.routes[r.id]!;
        it(`${r.id} matches the closed form`, () => {
          expect(Math.abs(got.L_mm - r.L_mm)).toBeLessThanOrEqual(MM);
          expect(Math.abs(got.theta_max_deg - r.theta_max_deg)).toBeLessThanOrEqual(DEG);
          expect(Math.abs(got.theta_sum_deg - r.theta_sum_deg)).toBeLessThanOrEqual(DEG);
        });
        it(`${r.id} agrees with NumPy to 1e-6`, () => {
          expect(Math.abs(got.L_mm - np.L_mm)).toBeLessThan(AGREE);
          expect(Math.abs(got.theta_max_deg - np.theta_max_deg)).toBeLessThan(AGREE);
          expect(Math.abs(got.theta_sum_deg - np.theta_sum_deg)).toBeLessThan(AGREE);
        });
      }
    });
  }
}

describe('route-level turning', () => {
  const { byId } = load('junction');
  const parentToRetro = [byId.get('e0')!.points, byId.get('e1')!.points];

  it.each([0.25, 0.3, 0.37, 0.5])('reads the 120° corner exactly at grid step %s', (step) => {
    const t = routeTurningMeasures(parentToRetro, [false, false], WINDOW_MM, step);
    expect(Math.abs(t.thetaMaxDeg - 120)).toBeLessThan(1e-6);
    expect(Math.abs(t.thetaSumDeg - 120)).toBeLessThanOrEqual(DEG);
  });

  it('equals the per-edge measures for a one-edge route', () => {
    for (const name of FIXTURES) {
      for (const e of load(name).edges) {
        expect(routeTurningMeasures([e.points], [false])).toEqual(turningMeasures(e.points));
      }
    }
  });

  it('keeps a gap between edges as a connecting segment', () => {
    const j = joinRoute(
      [
        [
          [0, 0, 0],
          [0, 0, 10],
        ],
        [
          [0, 1, 10],
          [0, 1, 20],
        ],
      ],
      [false, false],
    );
    expect(j.points).toHaveLength(4);
    expect(j.junctionS[0]).toBeCloseTo(11, 12);
    expect(lengthMm(j.points)).toBeCloseTo(21, 12);
  });
});

describe('edge cases', () => {
  it('suppresses a single-sample kink', () => {
    const P: Point3[] = Array.from({ length: 101 }, (_, z) => [0, 0, z] as Point3);
    P[50] = [0.3, 0, 50];
    const raw = (angleBetween(sub(P[50]!, P[49]!), sub(P[51]!, P[50]!)) * 180) / Math.PI;
    expect(raw).toBeGreaterThan(30);
    expect(turningMeasures(P).thetaMaxDeg).toBeLessThan(7);
  });

  it('shrinks the window on an edge shorter than 2w', () => {
    const R = 20;
    const phi = 6 / R;
    const P: Point3[] = Array.from({ length: 7 }, (_, k) => {
      const t = (phi * k) / 6;
      return [R * (1 - Math.cos(t)), 0, R * Math.sin(t)] as Point3;
    });
    const t = turningMeasures(P);
    expect(Math.abs(t.thetaSumDeg - (phi * 180) / Math.PI)).toBeLessThanOrEqual(DEG);
    expect(Math.abs(t.thetaMaxDeg - (3 / R) * (180 / Math.PI))).toBeLessThanOrEqual(DEG);
  });

  it('returns zero turning for degenerate edges', () => {
    expect(
      turningMeasures([
        [0, 0, 0],
        [0, 0, 1],
      ]),
    ).toEqual({ thetaMaxDeg: 0, thetaSumDeg: 0 });
    expect(
      turningMeasures([
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ]),
    ).toEqual({ thetaMaxDeg: 0, thetaSumDeg: 0 });
  });

  it('measures point and parallel segment distances exactly', () => {
    expect(polylineDistance([[0, 0, 0]], [[3, 4, 0]])).toBeCloseTo(5, 12);
    expect(
      polylineDistance(
        [
          [0, 0, 0],
          [10, 0, 0],
        ],
        [[5, 2, 0]],
      ),
    ).toBeCloseTo(2, 12);
    expect(
      polylineDistance(
        [[5, 2, 0]],
        [
          [0, 0, 0],
          [10, 0, 0],
        ],
      ),
    ).toBeCloseTo(2, 12);
    expect(
      polylineDistance(
        [
          [0, 0, 0],
          [10, 0, 0],
        ],
        [
          [2, 7, 0],
          [8, 7, 0],
        ],
      ),
    ).toBeCloseTo(7, 12);
  });

  it('never beats dense sampling on random polylines', () => {
    let seed = 20261107;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32 - 0.5) * 20;
    const line = (n: number): Point3[] => Array.from({ length: n }, () => [rnd(), rnd(), rnd()] as Point3);
    const dense = (p: Point3[]): Point3[] => {
      const out: Point3[] = [];
      for (let i = 1; i < p.length; i++) {
        for (let k = 0; k <= 50; k++) {
          const t = k / 50;
          const a = p[i - 1]!;
          const b = p[i]!;
          out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
        }
      }
      return out;
    };
    for (let k = 0; k < 100; k++) {
      const P = line(2 + (k % 4));
      const Q = line(2 + ((k >> 2) % 4));
      const exact = polylineDistance(P, Q);
      let brute = Infinity;
      for (const a of dense(P)) for (const b of dense(Q)) brute = Math.min(brute, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
      expect(exact).toBeLessThanOrEqual(brute + 1e-9);
      expect(brute - exact).toBeLessThan(0.5);
    }
  });
});
