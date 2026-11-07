import { describe, expect, it, vi } from 'vitest';
import { EVENT_SAMPLE_HZ, type ControlInput, type EventLog, type WireSource, type WireState } from '../contracts';
import { loadFixtureY } from '../optimize/fixture-y.testutil';
import { MockWireSource } from './mock-source';

const C = loadFixtureY();
const PATH = ['e_aorta', 'e_left'];
const REQ = { case: C, entryId: 'fem_r', targetId: 'left_branch', presetId: 'standard_j' as const, path: PATH };
const PUSH: ControlInput = { push: 1, rotate: 0, fluoro: false, contrastPuff: false };
const PATH_M = 0.15; // fixture-y: 100 mm trunk + 50 mm left branch

async function drive(script: (src: MockWireSource, tick: () => void) => void): Promise<{ log: EventLog; states: WireState[] }> {
  const src = new MockWireSource({ clock: 'manual' });
  const states: WireState[] = [];
  src.onState((s) => states.push(s));
  await src.start(REQ);
  script(src, () => src.tick());
  return { log: await src.stop(), states };
}

describe('MockWireSource', () => {
  it('implements WireSource and reports rail mode', () => {
    const src: WireSource = new MockWireSource({ clock: 'manual' });
    expect(src.mode).toBe('rail');
  });

  it('walks the planned path at constant speed and reaches the target', async () => {
    const { log, states } = await drive((src, tick) => {
      src.control(PUSH);
      for (let i = 0; i < 400; i++) tick();
    });
    const reached = log.events.filter((e) => e.kind === 'target_reached');
    expect(reached).toHaveLength(1);
    // 0.15 m at 0.02 m/s = 7.5 s, reached within one 1/30 s step
    expect(Math.abs(reached[0]!.t - PATH_M / 0.02)).toBeLessThanOrEqual(1 / EVENT_SAMPLE_HZ + 1e-9);
    const last = states[states.length - 1]!;
    expect(last.atTarget).toBe(true);
    expect(last.tip[0]).toBeCloseTo(C.nodes.find((n) => n.id === 'n_left')!.pos[0], 6);
    expect(last.tip[1]).toBeCloseTo(C.nodes.find((n) => n.id === 'n_left')!.pos[1], 6);
    // s steps by exactly speed × dt until the target
    const ds = log.samples[2]!.s - log.samples[1]!.s;
    expect(ds).toBeCloseTo(0.02 / EVENT_SAMPLE_HZ, 12);
  });

  it('writes 30 Hz samples in simulation time with the active edge', async () => {
    const { log } = await drive((src, tick) => {
      src.control(PUSH);
      for (let i = 0; i < 300; i++) tick();
    });
    expect(log.sampleHz).toBe(30);
    expect(log.samples[0]!.t).toBe(0);
    log.samples.forEach((s, i) => expect(s.t).toBeCloseTo(i / 30, 9));
    for (const s of log.samples) expect(s.edge).toBe(s.s <= 0.1 + 1e-9 ? 'e_aorta' : 'e_left');
    expect(log.samples.some((s) => s.edge === 'e_left')).toBe(true);
    expect(log.samples.every((s) => s.forceN === 0)).toBe(true);
  });

  it('keeps the tip on the centerline', async () => {
    const { states } = await drive((src, tick) => {
      src.control(PUSH);
      for (let i = 0; i < 300; i++) tick();
    });
    const pts = C.edges.filter((e) => PATH.includes(e.id)).flatMap((e) => e.points);
    for (const s of states.filter((_, i) => i % 15 === 0)) {
      const d = Math.min(...pts.map((p) => Math.hypot(p[0] - s.tip[0], p[1] - s.tip[1], p[2] - s.tip[2])));
      expect(d).toBeLessThan(0.0006); // points are 1 mm apart; the tip lies between two of them
      expect(s.wire[s.wire.length - 1]).toEqual(s.tip);
    }
  });

  it('records fluoro, contrast puffs and back-outs', async () => {
    const { log } = await drive((src, tick) => {
      src.control({ ...PUSH, fluoro: true });
      for (let i = 0; i < 90; i++) tick(); // 3 s forward: s = 0.06 m
      src.control({ push: 0, rotate: 0, fluoro: false, contrastPuff: true });
      src.control({ push: 0, rotate: 0, fluoro: false, contrastPuff: false });
      tick();
      src.control({ push: -1, rotate: 0, fluoro: false, contrastPuff: false });
      for (let i = 0; i < 60; i++) tick(); // 2 s back: 0.04 m, past the 0.02 m threshold
    });
    expect(log.samples.filter((s) => s.fluoro).length).toBe(90);
    expect(log.events.filter((e) => e.kind === 'contrast_puff')).toHaveLength(1);
    const back = log.events.filter((e) => e.kind === 'back_out');
    expect(back).toHaveLength(1); // one continuous 40 mm pull-back is one back-out
    if (back[0]!.kind === 'back_out') expect(back[0]!.fromS - back[0]!.toS).toBeGreaterThan(0.02);
    expect(log.events.map((e) => e.t)).toEqual([...log.events.map((e) => e.t)].sort((a, b) => a - b));
  });

  it('counts a second back-out only after the tip moves forward again', async () => {
    const { log } = await drive((src, tick) => {
      const go = (push: number, n: number) => {
        src.control({ push, rotate: 0, fluoro: false, contrastPuff: false });
        for (let i = 0; i < n; i++) tick();
      };
      go(1, 120); // to 0.08 m
      go(-1, 45); // back 0.03 m: one
      go(1, 15); // forward 0.01 m
      go(-1, 15); // back 0.01 m: under the threshold, none
      go(-1, 30); // keep going back, now 0.03 m from the new peak: two
    });
    expect(log.events.filter((e) => e.kind === 'back_out')).toHaveLength(2);
  });

  it('turns roll with rotate and clamps inputs', async () => {
    const { states } = await drive((src, tick) => {
      src.control({ push: 5, rotate: 3, fluoro: false, contrastPuff: false });
      for (let i = 0; i < 30; i++) tick();
    });
    const last = states[states.length - 1]!;
    expect(last.rollRad).toBeCloseTo(Math.PI, 9); // clamped to 1 → π rad/s for 1 s
    expect(last.s).toBeCloseTo(0.02, 12); // push clamped to 1 → full speed
  });

  it('scales speed by push, forward and back', async () => {
    const { log } = await drive((src, tick) => {
      src.control({ push: 0.5, rotate: 0, fluoro: false, contrastPuff: false });
      for (let i = 0; i < 60; i++) tick(); // 2 s at 0.01 m/s
      src.control({ push: -0.25, rotate: 0, fluoro: false, contrastPuff: false });
      for (let i = 0; i < 30; i++) tick(); // 1 s back at 0.005 m/s
      src.control({ push: 0, rotate: 0, fluoro: false, contrastPuff: false });
      for (let i = 0; i < 30; i++) tick(); // hold
    });
    expect(log.samples[60]!.s).toBeCloseTo(0.02, 12);
    expect(log.samples[90]!.s).toBeCloseTo(0.015, 12);
    expect(log.samples[120]!.s).toBeCloseTo(0.015, 12);
    expect(log.samples[61]!.s - log.samples[62]!.s).toBeCloseTo(0.005 / 30, 12);
  });

  it('never pulls back past the entry', async () => {
    const { log } = await drive((src, tick) => {
      src.control({ push: -1, rotate: 0, fluoro: false, contrastPuff: false });
      for (let i = 0; i < 30; i++) tick();
    });
    expect(log.samples.every((s) => s.s === 0)).toBe(true);
  });

  it('gives identical logs for identical inputs', async () => {
    const script = (src: MockWireSource, tick: () => void) => {
      src.control({ ...PUSH, fluoro: true });
      for (let i = 0; i < 100; i++) tick();
      src.control({ push: -1, rotate: 0.5, fluoro: false, contrastPuff: true });
      for (let i = 0; i < 50; i++) tick();
    };
    expect((await drive(script)).log).toEqual((await drive(script)).log);
  });

  it('auto-walks without input when asked', async () => {
    const src = new MockWireSource({ clock: 'manual', autoWalk: true });
    await src.start(REQ);
    for (let i = 0; i < 30; i++) src.tick();
    expect((await src.stop()).samples.at(-1)!.s).toBeCloseTo(0.02, 12);
  });

  it('ticks itself at 30 Hz on the interval clock', async () => {
    vi.useFakeTimers();
    try {
      const src = new MockWireSource({ autoWalk: true });
      await src.start(REQ);
      vi.advanceTimersByTime(1000);
      const log = await src.stop();
      expect(log.samples.length).toBeGreaterThanOrEqual(30);
      vi.advanceTimersByTime(1000);
      expect(log.samples.length).toBeLessThanOrEqual(32);
    } finally {
      vi.useRealTimers();
    }
  });

  it('unsubscribes, never falls back, and rejects a bad path', async () => {
    const src = new MockWireSource({ clock: 'manual' });
    const seen: number[] = [];
    const off = src.onState((s) => seen.push(s.t));
    const fallback = vi.fn();
    src.onFallback(fallback);
    await src.start(REQ);
    off();
    src.tick();
    expect(seen).toEqual([0]);
    await src.stop();
    expect(fallback).not.toHaveBeenCalled();
    await expect(src.start({ ...REQ, path: ['e_left'] })).rejects.toThrow(/does not continue/);
    await expect(src.start({ ...REQ, path: ['nope'] })).rejects.toThrow(/unknown edge/);
  });
});
