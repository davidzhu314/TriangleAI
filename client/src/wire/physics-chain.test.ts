/**
 * The chain simulation's key behaviours, on bundled cases loaded through the real loader. These are the behaviours
 * the Drive redesign depends on; tuning for drivability on arch cases is not covered here (see the handoff).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCase } from '../case';
import type { LoadedCase, Vec3, WireEvent } from '../contracts';
import { defaultWeights, optimize } from '../optimize';
import { driveAssist } from '../score';
import { driveCheckLine } from '../score/live';
import { CONTACT_MIN_N, createChainModel, initialChainState, stepChain, tipPose, type ChainControl, type ChainModel, type ChainState } from './physics-chain';
import { EXPOSURE_UNITS_PER_FRAME, heldImageAge, heldIsStale, initialImaging, stepImaging, type DeviceSnapshot, type ImagingInput, type ImagingState } from './physics-chain-imaging';
import { autopilot } from './physics-chain-autopilot';
import { ChainWireSource } from './physics-chain-source';

const DT = 1 / 30;
const cases = new Map<string, LoadedCase>();

async function load(id: string): Promise<LoadedCase> {
  const dir = join(process.cwd(), 'client', 'public', 'cases', id);
  const files = Object.fromEntries(['case.json', 'centerlines.json', 'vessels.glb'].map((n) => [n, new Uint8Array(readFileSync(join(dir, n)))]));
  const r = await loadCase({ kind: 'files', origin: 'bundled', files });
  if (!r.ok) throw new Error(`${id} did not load`);
  return r.case;
}

beforeAll(async () => {
  for (const id of ['fixture-y', 'low-tort']) cases.set(id, await load(id));
});

async function model(id: string, target: string): Promise<ChainModel> {
  const c = cases.get(id)!;
  const f = await optimize({ caseId: c.id, targetId: target }, c);
  if (f.kind !== 'frontier') throw new Error('no frontier');
  const r = f.routes[0]!;
  return createChainModel(c, r.entryId, target, r.presetId, r.edges);
}

function run(m: ChainModel, s: ChainState, control: ChainControl, steps: number, events: WireEvent[] = []): ChainState {
  for (let i = 0; i < steps; i++) {
    const out = stepChain(m, s, control, DT);
    events.push(...out.events);
    s = out.state;
  }
  return s;
}

/** Turn the hub to `theta`, then hold still for a second so the tip settles. */
function rollTo(m: ChainModel, s: ChainState, theta: number): ChainState {
  while (s.roll.wire.base < theta - 1e-9) s = stepChain(m, s, { push: 0, rotate: Math.min(1, (theta - s.roll.wire.base) / (Math.PI * DT)), device: 'wire' }, DT).state;
  return run(m, s, { push: 0, rotate: 0, device: 'wire' }, 30);
}

const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('chain simulation: device', () => {
  it('stays inside the lumen with every link one spacing long (the growing tip link within half a spacing) while it is pushed', async () => {
    const m = await model('low-tort', 'rcca');
    let s = initialChainState(m);
    let worst = 0;
    for (let i = 0; i < 300; i++) {
      s = stepChain(m, s, { push: 1, rotate: 0, device: 'wire' }, DT).state;
      for (const x of s.nodes.slice(2)) worst = Math.max(worst, m.lumen.query(x).slack);
    }
    expect(worst, 'furthest outside the wall, m').toBeLessThan(0.001);
    const h = m.params.spacingM;
    for (let k = 0; k + 2 < s.nodes.length; k++) expect(dist(s.nodes[k]!, s.nodes[k + 1]!)).toBeCloseTo(h, 9);
    const tipLink = dist(s.nodes.at(-2)!, s.nodes.at(-1)!);
    expect(tipLink).toBeGreaterThanOrEqual(h * 0.5 - 1e-9);
    expect(tipLink).toBeLessThanOrEqual(h * 1.5 + 1e-9);
    expect(s.s, 'the tip has moved along the plan').toBeGreaterThan(0.05);
  });

  it('is deterministic: the same inputs give the same chain, bit for bit', async () => {
    const m = await model('fixture-y', 'left_branch');
    const go = () => run(m, initialChainState(m), { push: 1, rotate: 0.5, device: 'wire' }, 90);
    expect(JSON.stringify(go())).toBe(JSON.stringify(go()));
  });

  it('lags at the tip: rotating the hub stores twist, and more length and contact store more', async () => {
    const m = await model('low-tort', 'rcca');
    const twistAfterTurn = (s: ChainState): number => {
      const after = run(m, s, { push: 0, rotate: 1, device: 'wire' }, 10);
      const pose = tipPose(m, after);
      expect(pose.tipRoll, 'the tip trails the hub').toBeLessThan(pose.hubRoll);
      return pose.hubRoll - pose.tipRoll;
    };
    const shallow = twistAfterTurn(initialChainState(m));
    const deep = twistAfterTurn(run(m, initialChainState(m), { push: 1, rotate: 0, device: 'wire' }, 240));
    expect(deep).toBeGreaterThan(shallow);
  });

  it('enters a branch by where its shaped tip points: different rolls take different branches', async () => {
    const m = await model('fixture-y', 'left_branch');
    // Pull the angled catheter back first, so only the wire's own shape aims it (the catheter's angle would aim it too).
    const bare = run(m, initialChainState(m), { push: -1, rotate: 0, device: 'catheter' }, 45);
    expect(bare.inserted.catheter).toBe(0);
    const taken = new Set<string>();
    for (let k = 0; k < 8; k++) {
      let s = rollTo(m, bare, (k * Math.PI) / 4);
      for (let i = 0; i < 300; i++) {
        s = stepChain(m, s, { push: 1, rotate: 0, device: 'wire' }, DT).state;
        const q = m.lumen.query(s.nodes.at(-1)!);
        if (q.seg.edge !== 'e_aorta' && m.lumen.edgeArc(q) > 0.015 && q.slack < -0.0005) {
          taken.add(q.seg.edge);
          break;
        }
      }
    }
    expect([...taken].sort()).toEqual(['e_left', 'e_right']);
  });

  it('loads the wall when the turned tip is pushed into it, far more than turning a free tip does', async () => {
    const m = await model('low-tort', 'rcca');
    const there = run(m, initialChainState(m), { push: 1, rotate: 0, device: 'wire' }, 30 * 15); // in the aorta
    const peakOf = (s: ChainState, control: ChainControl, steps: number): number => {
      let peak = 0;
      for (let i = 0; i < steps; i++) {
        const out = stepChain(m, s, control, DT);
        s = out.state;
        peak = Math.max(peak, out.peakLoadN);
      }
      return peak;
    };
    const spinning = peakOf(there, { push: 0, rotate: 1, device: 'wire' }, 90);
    let pushedIn = 0;
    for (let k = 0; k < 8; k++) {
      const th = (k * Math.PI) / 4;
      const aimed = run(m, { ...there, roll: { ...there.roll, wire: { base: th, tip: th } } }, { push: 0, rotate: 0, device: 'wire' }, 20);
      pushedIn = Math.max(pushedIn, peakOf(aimed, { push: 1, rotate: 0, device: 'wire' }, 60));
    }
    expect(spinning, 'a free tip turning in the lumen presses on nothing much').toBeLessThan(0.2);
    expect(pushedIn, 'pushed with its shape turned into the wall').toBeGreaterThan(Math.max(0.35, 2.5 * spinning));
  });

  it('loads the wall when pushed against resistance, and the educational risk index rises with it', async () => {
    const m = await model('fixture-y', 'left_branch');
    let s = initialChainState(m);
    let peak = 0;
    let risk = 0;
    for (let i = 0; i < 30 * 14; i++) {
      const out = stepChain(m, s, { push: 1, rotate: 0, device: 'wire' }, DT);
      s = out.state;
      peak = Math.max(peak, out.peakLoadN);
      risk = out.riskIndex;
    }
    expect(peak).toBeGreaterThan(CONTACT_MIN_N);
    expect(risk).toBeGreaterThan(0);
    expect(risk).toBeLessThanOrEqual(100);
  });

  it('moves only the active device: feeding the catheter leaves the wire where it is', async () => {
    const m = await model('low-tort', 'rcca');
    const s0 = initialChainState(m);
    const s1 = run(m, s0, { push: 1, rotate: 0, device: 'catheter' }, 30);
    expect(s1.inserted.wire).toBe(s0.inserted.wire);
    expect(s1.inserted.catheter).toBeGreaterThan(s0.inserted.catheter);
  });
});

describe('chain simulation: imaging', () => {
  const device = (tipX: number, wire = 0.1): DeviceSnapshot => ({ points: { wire: [[0, 0, 0], [tipX, 0, 0]], catheter: [[0, 0, 0]] }, tip: [tipX, 0, 0], inserted: { wire, catheter: 0.02 } });
  const off: ImagingInput = { fluoro: false, pulse: 'continuous', inject: false, storeRoadmap: false };
  function hold(state: ImagingState, input: Partial<ImagingInput>, seconds: number, dev = device(0)): ImagingState {
    let s = state;
    for (let i = 0; i < Math.round(seconds * 30); i++) s = stepImaging(s, { ...off, ...input }, dev, s.t + DT, DT).state;
    return s;
  }

  it('captures frames only while fluoro is held, at the selected pulse rate, and counts the cost', () => {
    const cont = hold(initialImaging(), { fluoro: true, pulse: 'continuous' }, 1);
    expect(cont.totals.frames).toBe(30);
    expect(cont.totals.fluoroS).toBeCloseTo(1, 9);
    expect(cont.totals.activations).toBe(1);
    expect(cont.totals.exposureUnits).toBe(30 * EXPOSURE_UNITS_PER_FRAME);
    const pulsed = hold(initialImaging(), { fluoro: true, pulse: 'p7_5' }, 1);
    expect(pulsed.totals.frames).toBe(8);
    expect(hold(initialImaging(), {}, 2).totals.frames).toBe(0);
  });

  it('freezes the last image at release with its capture time, and calls it stale once the device moves', () => {
    let s = hold(initialImaging(), { fluoro: true }, 0.5, device(0.01));
    s = stepImaging(s, off, device(0.01), s.t + DT, DT).state; // release
    const held = structuredClone(s.holdImage);
    expect(held).not.toBeNull();
    expect(s.live).toBeNull();
    expect(heldIsStale(s, device(0.01))).toBe(false);
    s = hold(s, {}, 2, device(0.05)); // the device moves with fluoro off
    expect(s.holdImage, 'the held image never updates').toEqual(held);
    expect(heldImageAge(s)).toBeCloseTo(2 + DT, 6);
    expect(heldIsStale(s, device(0.05))).toBe(true);
  });

  it('keeps contrast separate, and stores a roadmap only from a contrast frame; the roadmap never refreshes', () => {
    let s = hold(initialImaging(), { fluoro: true }, 0.3);
    const refused = stepImaging(s, { ...off, fluoro: true, storeRoadmap: true }, device(0), s.t + DT, DT);
    expect(refused.notice).toBe('roadmap_needs_contrast_frame');
    s = stepImaging(refused.state, { ...off, fluoro: true, inject: true }, device(0), refused.state.t + DT, DT).state;
    expect(s.totals.contrastInjections).toBe(1);
    s = hold(s, { fluoro: true }, 0.2);
    expect(s.live?.contrast).toBe(true);
    const stored = stepImaging(s, { ...off, fluoro: true, storeRoadmap: true }, device(0), s.t + DT, DT);
    expect(stored.notice).toBeNull();
    const at = stored.state.roadmap!.t;
    const later = hold(stored.state, { fluoro: true }, 3);
    expect(later.roadmap!.t).toBe(at);
    expect(later.live?.contrast, 'the opacification has washed out').toBe(false);
  });
});

describe('chain simulation: ChainWireSource', () => {
  it('writes a v2 event log at 30 Hz and reports imaging and the tip pose beside it', async () => {
    const c = cases.get('fixture-y')!;
    const src = new ChainWireSource({ clock: 'manual' });
    await src.start({ case: c, entryId: 'fem_r', targetId: 'left_branch', presetId: 'soft_angled', path: ['e_aorta', 'e_left'] });
    src.control({ push: 1, rotate: 0, fluoro: true, contrastPuff: true });
    for (let i = 0; i < 30; i++) src.tick();
    const view = src.chain()!;
    expect(view.imaging.totals.frames).toBe(30);
    expect(view.tip.tangent.length).toBe(3);
    const log = await src.stop();
    expect(log.samples).toHaveLength(31);
    expect(log.samples.at(-1)!.fluoro).toBe(true);
    expect(log.events.filter((e) => e.kind === 'contrast_puff')).toHaveLength(1);
  });

  it('gives the drive so far mid-drive, as the rail wire does, so Cathy can answer on Drive in Physics mode', async () => {
    const c = cases.get('fixture-y')!;
    const src = new ChainWireSource({ clock: 'manual' });
    expect(src.logSoFar(), 'null before start').toBeNull();
    const path = ['e_aorta', 'e_left'];
    await src.start({ case: c, entryId: 'fem_r', targetId: 'left_branch', presetId: 'soft_angled', path });
    src.control({ push: 1, rotate: 0, fluoro: false, contrastPuff: false });
    for (let i = 0; i < 60; i++) src.tick();
    const soFar = src.logSoFar()!;
    expect(soFar.mode).toBe('chain');
    expect(soFar.samples.length).toBeGreaterThan(50);
    soFar.samples.length = 0; // a copy: changing it leaves the drive alone
    src.tick();
    expect(src.logSoFar()!.samples.length, 'the drive goes on').toBeGreaterThan(60);
    const optimized = await optimize({ caseId: c.id, targetId: 'left_branch' }, c);
    const input = { log: src.logSoFar()!, optimized, weights: defaultWeights(optimized.kind === 'frontier' ? optimized.candidates : []), case: c };
    expect(driveAssist(input).lines.length, 'how am I doing / best next artery').toBeGreaterThan(0);
    expect(driveCheckLine(input, null).text, 'am I on the right path').toBeTruthy();
    await src.stop();
    expect(src.logSoFar(), 'null after stop').toBeNull();
  });

  it('speaks contracts v3: chain mode, device selection in ControlInput, the v3 state, sample fields and review events', async () => {
    const c = cases.get('fixture-y')!;
    const src = new ChainWireSource({ clock: 'manual' });
    expect(src.mode).toBe('chain');
    await src.start({ case: c, entryId: 'fem_r', targetId: 'left_branch', presetId: 'soft_angled', path: ['e_aorta', 'e_left'] });
    let last: import('../contracts').WireState | null = null;
    src.onState((s) => (last = s));
    src.control({ push: 1, rotate: 0, fluoro: true, contrastPuff: false, device: 'catheter', pulse: 'p15' });
    for (let i = 0; i < 30; i++) src.tick();
    src.control({ push: 0, rotate: 0, fluoro: false, contrastPuff: false });
    src.tick();
    const st = last! as import('../contracts').WireState;
    expect(st.mode).toBe('chain');
    expect(st.devices!.active).toBe('catheter');
    expect(st.devices!.insertedM.catheter).toBeGreaterThan(0.02);
    expect(st.tipPose!.leading, 'the catheter was pushed past the wire, so it leads').toBe('catheter');
    expect(st.imaging!.totals.frames).toBe(15);
    expect(st.imaging!.holdImageT).not.toBeNull();
    expect(st.riskIndex).toBeGreaterThanOrEqual(0);
    const log = await src.stop();
    expect(log.mode).toBe('chain');
    expect(log.samples.at(-2)!.device).toBe('catheter');
    expect(log.samples.at(-2)!.tangent).toHaveLength(3);
    expect(log.review!.filter((e) => e.kind === 'imaging_interval')).toEqual([expect.objectContaining({ pulse: 'p15', frames: 15 })]);
  });
});

describe('chain simulation: drivability', () => {
  // A scripted driver (physics-chain-autopilot.ts) with the player's controls only (push, pull, roll the wire) must reach
  // the target on every frontier route of the arch cases it can drive. Type III from the femoral or the left radial
  // needs the angled catheter to select the vessel, which the driver does not use yet (see the handoff).
  const drivable: [string, string, (r: { entryId: string }) => boolean][] = [
    ['low-tort', 'rcca', () => true],
    ['low-tort', 'lcca', () => true],
    ['type-iii', 'rcca', (r) => r.entryId === 'rad_r'],
  ];
  for (const [id, target, keep] of drivable) {
    it(`reaches ${target} on ${id} on every ${id === 'low-tort' ? '' : 'right radial '}frontier route`, async () => {
      if (!cases.has(id)) cases.set(id, await load(id));
      const c = cases.get(id)!;
      const f = await optimize({ caseId: c.id, targetId: target }, c);
      if (f.kind !== 'frontier') throw new Error('no frontier');
      const routes = f.routes.filter(keep);
      expect(routes.length).toBeGreaterThan(0);
      for (const r of routes) {
        const m = createChainModel(c, r.entryId, target, r.presetId, r.edges);
        const out = autopilot(m, initialChainState(m), 120);
        expect(out.reached, `${r.entryId} ${r.presetId}`).toBe(true);
        expect(out.steps.at(-1)!.riskIndex).toBeLessThan(100);
      }
    }, 60_000);
  }

  it('keeps a plain push gentle: the risk index stays low along a straight vessel', async () => {
    const m = await model('low-tort', 'rcca');
    let risk = 0;
    let s = initialChainState(m);
    for (let i = 0; i < 30 * 8; i++) {
      const out = stepChain(m, s, { push: 1, rotate: 0, device: 'wire' }, DT);
      s = out.state;
      risk = out.riskIndex;
    }
    expect(s.s, 'progress keeps up with the feed').toBeGreaterThan(s.inserted.wire - 0.02);
    expect(risk).toBeLessThan(20);
  });
});
