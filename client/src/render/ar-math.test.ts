import { describe, expect, it } from 'vitest';
import { AR_SCALES, FRAME_BUDGET_MS, FrameBudget, TARGET_FPS, twoHand, xrPad } from './ar-math';

describe('AR placement and frame budget (spec §7.2, A7)', () => {
  it('places at half scale, switchable to 1:1', () => {
    expect(AR_SCALES.half).toBe(0.5);
    expect(AR_SCALES.full).toBe(1);
  });

  it('asks for 72 fps, and its budget is 14 ms a frame', () => {
    expect(TARGET_FPS).toBe(72);
    expect(FRAME_BUDGET_MS).toBe(14);
  });

  it('trips once the rolling mean passes the budget, and stays tripped', () => {
    const b = new FrameBudget(14, 5);
    for (let i = 0; i < 10; i++) expect(b.record(1000 / 72)).toBe(false); // 13.9 ms: within budget
    expect(b.over).toBe(false);
    const trips = [16, 16, 16, 16, 16].map((t) => b.record(t));
    expect(trips.filter(Boolean)).toHaveLength(1);
    expect(b.over).toBe(true);
    expect(b.record(5)).toBe(false); // no flipping back
  });

  it('ignores frames with no time (the first frame of a session)', () => {
    const b = new FrameBudget(14, 2);
    expect(b.record(0)).toBe(false);
    expect(b.record(Number.NaN)).toBe(false);
    expect(b.over).toBe(false);
  });
});

describe('two-hand scale and turn', () => {
  it('scales by the ratio of the hands\' distance', () => {
    const g = twoHand([0, 1, 0], [0.2, 1, 0], [-0.1, 1, 0], [0.3, 1, 0]);
    expect(g.scale).toBeCloseTo(2, 9);
    expect(g.yaw).toBeCloseTo(0, 9);
  });

  it('turns by the change of the line between the hands around the vertical axis', () => {
    const g = twoHand([0, 1, 0], [1, 1, 0], [0, 1, 0], [0, 1, -1]);
    expect(g.scale).toBeCloseTo(1, 9);
    expect(g.yaw).toBeCloseTo(Math.PI / 2, 9);
  });

  it('clamps a glitchy frame, and holds when the hands start together', () => {
    expect(twoHand([0, 0, 0], [0.01, 0, 0], [0, 0, 0], [5, 0, 0]).scale).toBe(8);
    expect(twoHand([0, 0, 0], [1, 0, 0], [0, 0, 0], [0.001, 0, 0]).scale).toBe(0.125);
    expect(twoHand([0, 0, 0], [0, 0, 0], [0, 0, 0], [1, 0, 0]).scale).toBe(1);
  });
});

describe('XR controller as the Drive gamepad', () => {
  it('maps thumbstick, trigger and the A/X button to the standard layout Drive reads', () => {
    const p = xrPad([0, 0, 0.4, -0.8], [0.9, 0, 0, 0, 1]);
    expect(p.axes[1]).toBe(-0.8); // stick forward: push (Drive negates axis 1)
    expect(p.axes[2]).toBe(0.4); // stick sideways: rotate
    expect(p.buttons[7]).toBe(0.9); // trigger: fluoro
    expect(p.buttons[0]).toBe(1); // A/X: contrast puff
  });

  it('reads a controller with no thumbstick as still', () => {
    const p = xrPad([], []);
    expect(p.axes).toEqual([0, 0, 0, 0]);
    expect(p.buttons.every((b) => b === 0)).toBe(true);
  });
});
