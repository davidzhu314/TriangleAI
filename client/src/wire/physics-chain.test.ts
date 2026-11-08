/**
 * The chain simulation's key behaviours, on bundled cases loaded through the real loader. These are the behaviours
 * the Drive redesign depends on; tuning for drivability on arch cases is not covered here (see the handoff).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCase } from '../case';
import type { LoadedCase, Vec3, WireEvent } from '../contracts';
import { optimize } from '../optimize';
import { CONTACT_MIN_N, createChainModel, initialChainState, stepChain, tipPose, type ChainControl, type ChainModel, type ChainState } from './physics-chain';
import { EXPOSURE_UNITS_PER_FRAME, heldImageAge, heldIsStale, initialImaging, stepImaging, type DeviceSnapshot, type ImagingInput, type ImagingState } from './physics-chain-imaging';
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
  it('stays inside the lumen with every link exactly one spacing long while it is pushed', async () => {
    const m = await model('low-tort', 'rcca');
    let s = initialChainState(m);
    let worst = 0;
    for (let i = 0; i < 300; i++) {
      s = stepChain(m, s, { push: 1, rotate: 0, device: 'wire' }, DT).state;
      for (const x of s.nodes.slice(2)) worst = Math.max(worst, m.lumen.query(x).slack);
    }
    expect(worst, 'furthest outside the wall, m').toBeLessThan(0.001);
    for (let k = 1; k + 1 < s.nodes.length; k++) expect(dist(s.nodes[k]!, s.nodes[k + 1]!)).toBeCloseTo(m.params.spacingM, 9);
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
    const taken = new Set<string>();
    for (let k = 0; k < 8; k++) {
      let s = rollTo(m, initialChainState(m), (k * Math.PI) / 4);
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
