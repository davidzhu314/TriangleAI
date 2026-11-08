import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ControlInput, Frontier, LoadedCase, WireEvent, WirePresetId, WireSource, WireState } from '../contracts';
import { loadFixtureY } from '../optimize/fixture-y.testutil';
import { buildGraph } from '../optimize/graph';
import { loadSynthetic } from '../optimize/graphs.testutil';
import { optimizeCase } from '../optimize/optimizer';
import {
  BACK_OUT_THRESHOLD_M,
} from '../contracts';
import {
  chooseBranch,
  createRailModel,
  FORCE_N_PER_MPS,
  FORCE_SPIKE_THRESHOLD_N,
  initialRailState,
  railBody,
  railEdge,
  railTip,
  RAIL_SPEED_MPS,
  step,
  type RailModel,
  type RailState,
} from './rail';
import { bestRoll, railAutopilot } from './rail-autopilot';
import { RailWireSource, RAIL_DT_S, replayRail } from './rail-source';

const SYNTH = join(import.meta.dirname, '../../../tests/fixtures/synthetic');
const SYNTHETIC = readdirSync(SYNTH).filter((d) => existsSync(join(SYNTH, d, 'expected.json'))).sort();
const IN = (push: number, rotate = 0, extra: Partial<ControlInput> = {}): ControlInput => ({ push, rotate, fluoro: false, contrastPuff: false, ...extra });

interface Run {
  state: RailState;
  events: WireEvent[];
  ticks: number;
}

function run(model: RailModel, control: (st: RailState, tick: number) => ControlInput | null, maxTicks = 3000, from?: RailState): Run {
  let state = from ?? initialRailState(model);
  const events: WireEvent[] = [];
  let ticks = 0;
  for (; ticks < maxTicks; ticks++) {
    const input = control(state, ticks);
    if (!input) break;
    const r = step(model, state, input, RAIL_DT_S);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events, ticks };
}

const kinds = (ev: WireEvent[]) => ev.map((e) => e.kind);

describe('acceptance: rail reaches every target on every template case along the frontier routes', () => {
  const cases: [string, LoadedCase][] = [['fixture-y', loadFixtureY()], ...SYNTHETIC.map((n) => [n, loadSynthetic(n)] as [string, LoadedCase])];
  let driven = 0;
  for (const [name, c] of cases) {
    const g = buildGraph(c);
    for (const t of c.targets) {
      const res = optimizeCase(g, { caseId: c.id, targetId: t.id });
      if (res.kind !== 'frontier') continue; // no safe route: nothing to drive (see the optimizer tests)
      for (const route of (res as Frontier).routes) {
        it(`${name}: ${route.id} → ${t.id}`, () => {
          const model = createRailModel(c, route.entryId, t.id, route.presetId, route.edges);
          const r = run(model, (st) => (st.atTarget ? null : railAutopilot(model, st, RAIL_DT_S)));
          expect(r.state.atTarget).toBe(true);
          expect(r.state.walked.map((w) => w.edge)).toEqual(route.edges);
          // on plan the whole way: no wrong branch, no prolapse, one arrival (a force spike at a
          // sharp corner is allowed: it's feedback for the drive score, not a failure)
          expect(kinds(r.events).filter((k) => k !== 'force_spike')).toEqual(['target_reached']);
          // the tip ends on the target node
          const node = c.nodes.find((n) => n.id === c.targets.find((x) => x.id === t.id)!.node)!;
          const tip = railTip(model, r.state);
          expect(Math.hypot(tip[0] - node.pos[0], tip[1] - node.pos[1], tip[2] - node.pos[2])).toBeLessThan(1e-6);
          driven++;
        });
      }
    }
  }
  it('drove a meaningful set of frontier routes', () => {
    // fixture-y 2, straight 3, arc90 3, helix 3, bend 3, y-branch 2, junction 2, diamond 3
    expect(driven).toBe(21);
  });
});

describe('branch entry (spec §5.3)', () => {
  const y = loadFixtureY();

  it('enters the child the tip points at, within 25°', () => {
    const m = createRailModel(y, 'fem_r', 'left_branch', 'standard_j', ['e_aorta', 'e_left']);
    const at = { ...initialRailState(m) };
    const t = [0, 1, 0];
    const left = y.edges.find((e) => e.id === 'e_left')!;
    const d = left.points[5]!.map((v, i) => v - left.points[0]![i]!);
    const phi = bestRoll(t, d.map((v) => v / Math.hypot(...d)));
    expect(chooseBranch(m, at.walked, phi)).toMatchObject({ edge: 'e_left', how: 'pointed' });
    expect(chooseBranch(m, at.walked, phi)!.turnDeg).toBeCloseTo(45, 1);
  });

  it('otherwise takes the straightest way and records wrong_branch against the plan', () => {
    // stiff straight has no tip angle: the 45° left branch is never within 25°, so it continues
    // into the straighter 30° right branch (fixture-y read as an intermediate case: the spec's 25°)
    const m = createRailModel({ ...y, difficulty: 'intermediate' }, 'fem_r', 'left_branch', 'stiff_straight', ['e_aorta', 'e_left']);
    expect(m.branchEntryDeg).toBe(25);
    expect(chooseBranch(m, initialRailState(m).walked, 0)).toMatchObject({ edge: 'e_right', how: 'continued' });
    // fixture-y is a beginner case: 35°, so the 30° right branch is now pointed into, and the left still isn't
    const easy = createRailModel(y, 'fem_r', 'left_branch', 'stiff_straight', ['e_aorta', 'e_left']);
    expect(easy.branchEntryDeg).toBe(35);
    expect(chooseBranch(easy, initialRailState(easy).walked, 0)).toMatchObject({ edge: 'e_right', how: 'pointed' });
    const r = run(m, (st, k) => (k < 30 * 7 ? IN(1) : null));
    const wrong = r.events.find((e) => e.kind === 'wrong_branch');
    expect(wrong).toMatchObject({ kind: 'wrong_branch', edge: 'e_right', expectedEdge: 'e_left' });
    expect(railEdge(m, r.state)).toBe('e_right');
  });

  it('backs out of a branch when pulled back past the branch point', () => {
    const m = createRailModel(y, 'fem_r', 'left_branch', 'stiff_straight', ['e_aorta', 'e_left']);
    const fwd = run(m, (_, k) => (k < 30 * 6 ? IN(1) : null));
    expect(fwd.state.walked).toHaveLength(2);
    const back = run(m, (_, k) => (k < 30 * 2 ? IN(-1) : null), 3000, fwd.state);
    expect(back.state.walked.map((w) => w.edge)).toEqual(['e_aorta']);
  });
});

describe('scripted prolapse and the wall rule', () => {
  it('prolapses when pushed into a turn sharper than the preset allows, and holds until pulled back', () => {
    // diamond, standard J (max 80°) along A: the 90° corner at nA
    const c = loadSynthetic('diamond');
    const m = createRailModel(c, 'in', 'top', 'standard_j', ['e0', 'e1', 'e2']);
    const r = run(m, (st) => (st.prolapsed ? null : railAutopilot(m, st, RAIL_DT_S)));
    const p = r.events.filter((e) => e.kind === 'prolapse');
    expect(p).toEqual([{ t: expect.any(Number), kind: 'prolapse', edge: 'e1' }]);
    expect(r.state.s).toBeCloseTo(0.08, 6); // held at nA, 40 + 40 mm
    const held = run(m, (_, k) => (k < 30 ? IN(1) : null), 3000, r.state);
    expect(held.state.s).toBe(r.state.s);
    expect(kinds(held.events)).not.toContain('prolapse'); // one event per episode
    const back = run(m, (_, k) => (k < 3 ? IN(-1) : null), 3000, held.state);
    expect(back.state.prolapsed).toBe(false);
  });

  it('prolapses after pushing against a wall (a dead end) for more than 1 s, with a force spike', () => {
    const y = loadFixtureY();
    const m = createRailModel(y, 'fem_r', 'left_branch', 'stiff_straight', ['e_aorta', 'e_left']);
    // drive into the right branch (wrong way) and on to its dead end
    const r = run(m, (st, k) => (k < 30 * 12 ? IN(1) : null));
    const ev = r.events;
    const wall = ev.find((e) => e.kind === 'prolapse')!;
    const end = r.state.s;
    expect(end).toBeCloseTo(0.16, 4); // 100 + 60 mm: the end of e_right
    const arrive = (0.16 / RAIL_SPEED_MPS);
    expect(wall.t).toBeGreaterThan(arrive + 1);
    expect(wall.t).toBeLessThan(arrive + 1 + 3 * RAIL_DT_S);
    const spike = ev.find((e) => e.kind === 'force_spike');
    expect(spike).toMatchObject({ kind: 'force_spike', thresholdN: FORCE_SPIKE_THRESHOLD_N });
    expect(r.state.forceN).toBeCloseTo(FORCE_N_PER_MPS * RAIL_SPEED_MPS, 12);
  });
});

describe('force proxy and back_out', () => {
  const c = loadSynthetic('straight');
  const m = createRailModel(c, 'in', 'out', 'standard_j', ['e0']);

  it('is zero on a straight vessel and when not pushing', () => {
    const r = run(m, (_, k) => (k < 60 ? IN(1) : null));
    expect(r.state.forceN).toBe(0);
    expect(kinds(r.events)).toEqual([]);
  });

  it('grows with push rate past 30° (junction fixture, soft angled into the 45° side branch)', () => {
    const j = loadSynthetic('junction');
    const mj = createRailModel(j, 'in', 'side', 'soft_angled', ['e0', 'e2']);
    let peakFull = 0;
    run(mj, (st) => {
      peakFull = Math.max(peakFull, st.forceN);
      return st.atTarget ? null : railAutopilot(mj, st, RAIL_DT_S);
    });
    // the windowed turn peaks at the 45° takeoff, so F stays under K × v × (45 − 30) / 60
    expect(peakFull).toBeGreaterThan(0);
    expect(peakFull).toBeLessThanOrEqual((FORCE_N_PER_MPS * RAIL_SPEED_MPS * 15) / 60 + 1e-12);
    let peakHalf = 0;
    run(mj, (st) => {
      peakHalf = Math.max(peakHalf, st.forceN);
      if (st.atTarget) return null;
      const a = railAutopilot(mj, st, RAIL_DT_S);
      return { ...a, push: a.push / 2 };
    });
    // half the push rate, about half the force (samples land at different points along the turn)
    expect(peakHalf).toBeGreaterThan(peakFull * 0.3);
    expect(peakHalf).toBeLessThan(peakFull * 0.7);
  });

  it('records one back_out per retreat of more than 20 mm', () => {
    const go = (push: number, n: number) => (from: RailState) => run(m, (_, k) => (k < n ? IN(push) : null), 3000, from);
    let st = go(1, 150)(initialRailState(m)).state; // 100 mm
    let r = go(-1, 60)(st); // back 40 mm: one
    expect(r.events.filter((e) => e.kind === 'back_out')).toHaveLength(1);
    const ev = r.events.find((e) => e.kind === 'back_out')!;
    if (ev.kind === 'back_out') expect(ev.fromS - ev.toS).toBeGreaterThan(BACK_OUT_THRESHOLD_M);
    st = go(1, 15)(r.state).state; // forward 10 mm re-arms
    r = go(-1, 45)(st); // back 30 mm from the new peak: one more
    expect(r.events.filter((e) => e.kind === 'back_out')).toHaveLength(1);
  });
});

describe('step is pure and deterministic', () => {
  const c = loadSynthetic('diamond');
  const m = createRailModel(c, 'in', 'top', 'soft_angled', ['e0', 'e1', 'e2']);

  it('does not mutate its input state', () => {
    const s0 = initialRailState(m);
    const frozen = JSON.stringify(s0);
    Object.freeze(s0.walked);
    Object.freeze(s0);
    step(m, s0, IN(1, 0.5, { contrastPuff: true, fluoro: true }), RAIL_DT_S);
    expect(JSON.stringify(s0)).toBe(frozen);
  });

  it('gives identical results from a fresh model (the cache never changes a result)', () => {
    const drive = (mm: RailModel) => run(mm, (st, k) => (st.atTarget || k > 600 ? null : railAutopilot(mm, st, RAIL_DT_S)));
    const a = drive(m);
    const b = drive(createRailModel(c, 'in', 'top', 'soft_angled', ['e0', 'e1', 'e2']));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('turns roll with rotate and keeps time as accumulated dt', () => {
    const r = run(m, (_, k) => (k < 30 ? IN(0, 1) : null));
    expect(r.state.rollRad).toBeCloseTo(Math.PI, 9);
    expect(r.state.t).toBeCloseTo(1, 12);
  });
});

describe('wire body', () => {
  const c = loadSynthetic('arc90');
  const m = createRailModel(c, 'in', 'out', 'soft_angled', ['e0']);
  const st = run(m, (_, k) => (k < 30 ? IN(1) : null)).state; // 20 mm in

  it('runs from the entry to the tip with one point per 2 mm', () => {
    const body = railBody(m, st);
    expect(body).toHaveLength(Math.ceil(st.s / 0.002) + 1);
    expect(body.at(-1)).toEqual(railTip(m, st));
    const entry = c.nodes.find((n) => n.id === 'n0')!.pos;
    expect(Math.hypot(body[0]![0] - entry[0], body[0]![1] - entry[1], body[0]![2] - entry[2])).toBeLessThan(1e-9);
  });

  it('wiggles off the centerline by at most the sinusoid amplitude', () => {
    const body = railBody(m, st);
    const pts = c.edges[0]!.points;
    for (const p of body) {
      // distance to the nearest centerline point (1 mm apart on a 20 mm-radius arc)
      const d = Math.min(...pts.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])));
      expect(d).toBeLessThan(0.0003 + 0.0006);
    }
  });
});

describe('RailWireSource', () => {
  const y = loadFixtureY();
  const req = (presetId: WirePresetId) => ({ case: y, entryId: 'fem_r', targetId: 'left_branch', presetId, path: ['e_aorta', 'e_left'] });

  it('implements WireSource in rail mode and never falls back', async () => {
    const src: WireSource = new RailWireSource({ clock: 'manual', autoDrive: true });
    expect(src.mode).toBe('rail');
    const fb = vi.fn();
    src.onFallback(fb);
    await src.start(req('soft_angled'));
    for (let i = 0; i < 400; i++) (src as RailWireSource).tick();
    const log = await src.stop();
    expect(fb).not.toHaveBeenCalled();
    expect(log.events.map((e) => e.kind)).toEqual(['target_reached']);
    expect(log.mode).toBe('rail');
  });

  it('writes 30 Hz samples in simulation time, with fluoro and contrast from the controls', async () => {
    const src = new RailWireSource({ clock: 'manual' });
    const states: WireState[] = [];
    src.onState((s) => states.push(s));
    await src.start(req('soft_angled'));
    src.control(IN(1, 0, { fluoro: true, contrastPuff: true }));
    src.tick();
    src.control(IN(1, 0, { fluoro: true }));
    for (let i = 0; i < 29; i++) src.tick();
    src.control(IN(1));
    src.tick();
    const log = await src.stop();
    log.samples.forEach((s, i) => expect(s.t).toBeCloseTo(i / 30, 12));
    expect(log.samples.filter((s) => s.fluoro)).toHaveLength(30);
    expect(log.events.filter((e) => e.kind === 'contrast_puff')).toHaveLength(1);
    expect(states.at(-1)!.wire.at(-1)).toEqual(states.at(-1)!.tip);
  });

  it('matches the pure replay of the same inputs', async () => {
    const inputs = Array.from({ length: 200 }, (_, k) => IN(k < 150 ? 1 : -0.5, k % 40 < 10 ? 0.3 : 0, { fluoro: k % 50 < 20 }));
    const src = new RailWireSource({ clock: 'manual' });
    await src.start(req('standard_j'));
    for (const i of inputs) {
      src.control(i);
      src.tick();
    }
    expect(await src.stop()).toEqual(replayRail(req('standard_j'), inputs));
  });

  it('ticks itself at 30 Hz on the interval clock', async () => {
    vi.useFakeTimers();
    try {
      const src = new RailWireSource({ autoDrive: true });
      await src.start(req('soft_angled'));
      vi.advanceTimersByTime(1000);
      const log = await src.stop();
      expect(log.samples.length).toBeGreaterThanOrEqual(30);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects an unknown entry or a plan that does not start at the entry', async () => {
    const src = new RailWireSource({ clock: 'manual' });
    await expect(src.start({ ...req('soft_angled'), entryId: 'nope' })).rejects.toThrow(/unknown entry/);
    await expect(src.start({ ...req('soft_angled'), path: ['e_left'] })).rejects.toThrow(/does not start at the entry/);
  });
});
