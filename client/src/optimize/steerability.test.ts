import { describe, expect, it } from 'vitest';
import type { LoadedCase, LoadedEdge, Vec3, WireEvent } from '../contracts';
import { railAutopilot } from '../wire/rail-autopilot';
import { createRailModel, initialRailState, step } from '../wire/rail';
import { RAIL_DT_S } from '../wire/rail-source';
import { loadFixtureY } from './fixture-y.testutil';
import { buildGraph } from './graph';
import { loadSynthetic } from './graphs.testutil';
import { optimizeCase } from './optimizer';
import { PRESET_IDS } from './presets';
import { BRANCH_ENTRY_DEG, pickBranch, steerableAt } from './steerability';

const SYNTHETIC = ['straight', 'arc90', 'helix', 'bend', 'y-branch', 'junction', 'diamond'];

/** A trunk up +Y to a branch point, then a straight child and a side child at `sideDeg` in the Y–Z plane. Metres. */
function sideBranchCase(sideDeg: number): LoadedCase {
  const line = (a: Vec3, dir: Vec3, mm: number): Vec3[] =>
    Array.from({ length: mm + 1 }, (_, i) => [a[0] + (dir[0] * i) / 1000, a[1] + (dir[1] * i) / 1000, a[2] + (dir[2] * i) / 1000] as Vec3);
  const r = (sideDeg * Math.PI) / 180;
  const split: Vec3 = [0, 0.05, 0];
  const mk = (id: string, from: string, to: string, points: Vec3[]): LoadedEdge => ({ id, from, to, vessel: id, points, radiiM: points.map(() => 0.004), lengthM: (points.length - 1) / 1000 });
  return {
    id: `side-${sideDeg}`,
    title: 'side branch',
    origin: 'bundled',
    source: { kind: 'parametric', license: 'test' },
    physics: { available: false },
    planningOnly: true,
    vessels: ['trunk', 'straight', 'side'].map((id) => ({ id, name: id, kind: 'artery' as const })),
    entries: [{ id: 'in', name: 'in', node: 'n0' }],
    targets: [
      { id: 'up', name: 'up', node: 'n_up', reachable: true },
      { id: 'side', name: 'side', node: 'n_side', reachable: true },
    ],
    riskZones: [],
    nodes: [
      { id: 'n0', pos: [0, 0, 0], kind: 'entry' },
      { id: 'n1', pos: split, kind: 'branch' },
      { id: 'n_up', pos: [0, 0.1, 0], kind: 'target' },
      { id: 'n_side', pos: [0, 0.05 + 0.05 * Math.cos(r), 0.05 * Math.sin(r)], kind: 'target' },
    ],
    edges: [
      mk('trunk', 'n0', 'n1', line([0, 0, 0], [0, 1, 0], 50)),
      mk('straight', 'n1', 'n_up', line(split, [0, 1, 0], 50)),
      mk('side', 'n1', 'n_side', line(split, [0, Math.cos(r), Math.sin(r)], 50)),
    ],
    mesh: { glb: new ArrayBuffer(0), toWorld: [], triangles: 0 },
    validation: [],
  };
}

/** Drive a path with the autopilot until it arrives, enters a wrong branch or prolapses. */
function drive(c: LoadedCase, entryId: string, targetId: string, presetId: (typeof PRESET_IDS)[number], path: string[]): WireEvent[] {
  const model = createRailModel(c, entryId, targetId, presetId, path);
  let st = initialRailState(model);
  const events: WireEvent[] = [];
  for (let i = 0; i < 6000 && !st.atTarget; i++) {
    const r = step(model, st, railAutopilot(model, st, RAIL_DT_S), RAIL_DT_S);
    st = r.state;
    events.push(...r.events);
    if (r.events.some((e) => e.kind === 'wrong_branch' || e.kind === 'prolapse')) break;
  }
  return events;
}

describe('steerableAt', () => {
  it('diamond route B (38° takeoff) is steerable with soft angled and standard J', () => {
    const g = buildGraph(loadSynthetic('diamond'));
    for (const p of ['soft_angled', 'standard_j'] as const) expect(steerableAt(g, ['e0', 'e3', 'e4'], p)).toEqual({ ok: true, failures: [] });
  });

  it('a 30° side branch: soft angled (45°) can point into it, standard J (60°) cannot', () => {
    const g = buildGraph(sideBranchCase(30));
    expect(steerableAt(g, ['trunk', 'side'], 'soft_angled').ok).toBe(true);
    const j = steerableAt(g, ['trunk', 'side'], 'standard_j');
    expect(j.ok).toBe(false);
    expect(j.failures).toHaveLength(1);
    expect(j.failures[0]).toMatchObject({ node: 'n1', edge: 'side', tipDeg: 60, entered: 'straight' });
    expect(j.failures[0]!.takeoffDeg).toBeCloseTo(30, 6);
  });

  it('the boundary is |takeoff − tip angle| ≤ 25°', () => {
    for (const [deg, ok] of [
      [84, true], // 84 − 60 = 24
      [86, false], // 26
    ] as const) {
      expect(steerableAt(buildGraph(sideBranchCase(deg)), ['trunk', 'side'], 'standard_j').ok, `${deg}°`).toBe(ok);
    }
    expect(BRANCH_ENTRY_DEG).toBe(25);
  });

  it('the straightest way on is steerable by rolling the tip away from the side branch', () => {
    const g = buildGraph(sideBranchCase(30));
    for (const p of PRESET_IDS) expect(steerableAt(g, ['trunk', 'straight'], p).ok, p).toBe(true);
  });

  it('a route with no branch point is trivially steerable', () => {
    expect(steerableAt(buildGraph(loadSynthetic('straight')), ['e0'], 'stiff_straight')).toEqual({ ok: true, failures: [] });
  });

  it('pickBranch returns null with no candidates', () => {
    expect(pickBranch([0, 1, 0], 45, 0, [])).toBeNull();
  });
});

describe('property: steerableAt agrees with the rail autopilot', () => {
  const cases: [string, LoadedCase][] = [
    ['fixture-y', loadFixtureY()],
    ...SYNTHETIC.map((n) => [n, loadSynthetic(n)] as [string, LoadedCase]),
    ...[30, 60, 84, 86, 100].map((d) => [`side-${d}`, sideBranchCase(d)] as [string, LoadedCase]),
  ];
  for (const [name, c] of cases) {
    it(`${name}: every candidate route is steerable exactly when the autopilot enters no wrong branch`, () => {
      const g = buildGraph(c);
      let checked = 0;
      for (const t of c.targets) {
        const res = optimizeCase(g, { caseId: c.id, targetId: t.id });
        const routes = res.kind === 'frontier' ? res.candidates : [];
        for (const r of routes) {
          const s = steerableAt(g, r.edges, r.presetId, g.entries.get(r.entryId));
          const wrong = drive(c, r.entryId, t.id, r.presetId, r.edges).some((e) => e.kind === 'wrong_branch');
          expect(wrong, `${r.id}: steerable ${s.ok}`).toBe(!s.ok);
          checked++;
        }
      }
      if (!['straight', 'arc90', 'helix', 'bend'].includes(name)) expect(checked).toBeGreaterThan(0);
    });
  }
});
