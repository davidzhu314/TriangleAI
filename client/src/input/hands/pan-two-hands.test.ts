/**
 * The pan ("trackpad") gesture, and both hands at once. Synthetic hands (./synthetic-hand.testutil);
 * the pan limits are untuned on a real hand yet (DECISIONS.md, "Pan gesture").
 */
import { describe, expect, it } from 'vitest';
import { DEBOUNCE_MS, PAN_DEADZONE, PAN_GAIN } from './constants';
import { createGestureMachine } from './machine';
import { isGun, isPan, isPoint, panChecks } from './pose';
import { FRAME_MS, frame, gun, point, syntheticHand, type HandSpec } from './synthetic-hand.testutil';
import type { GestureConfig, GestureOutput, HandObservation } from './types';

const CFG: GestureConfig = { dominant: 'Right', mirrored: false };
const pan = (extra: HandSpec = {}): HandObservation => syntheticHand({ flex: { index: 0, middle: 0, ring: 0, pinky: 1 }, thumb: 'folded', ...extra });
const ENGAGE = Math.ceil(DEBOUNCE_MS / FRAME_MS) + 2;

function run(n: number, hands: (i: number) => HandObservation[], m = createGestureMachine(CFG)): GestureOutput[] {
  return Array.from({ length: n }, (_, i) => m.step(frame(i * FRAME_MS, ...hands(i))));
}

describe('pan pose', () => {
  it('three fingers out and the pinky folded is a pan, and only a pan', () => {
    const w = pan().world;
    expect(panChecks(w).filter((c) => !c.ok)).toEqual([]);
    expect(isPan(w)).toBe(true);
    expect(isGun(w)).toBe(false);
    expect(isPoint(w)).toBe(false);
  });

  it('is not a pan with the ring folded (the gun), the middle folded (the point) or the whole hand open', () => {
    expect(isPan(gun().world)).toBe(false);
    expect(isPan(point().world)).toBe(false);
    expect(isPan(syntheticHand({ flex: { index: 0, middle: 0, ring: 0, pinky: 0 }, thumb: 'out' }).world)).toBe(false);
  });
});

describe('pan gesture', () => {
  it('engages after the debounce, starts at 0, 0, then follows the hand like a trackpad', () => {
    const step = 0.01; // screen widths per frame
    const out = run(ENGAGE + 30, (i) => [pan({ pos: { x: 0.3 + (i > ENGAGE ? (i - ENGAGE) * step : 0), y: 0.5 } })]);
    const firstPan = out.findIndex((o) => o.status === 'pan');
    expect(firstPan).toBeGreaterThan(0);
    expect(out[firstPan]!.pan).toEqual({ dx: 0, dy: 0 });
    const late = out.at(-1)!.pan!;
    expect(late.dx).toBeGreaterThan(0); // hand moves right → view moves right
    expect(late.dx).toBeCloseTo(step * PAN_GAIN, 2); // once the smoothing settles
    expect(Math.abs(late.dy)).toBeLessThanOrEqual(PAN_DEADZONE);
    for (const o of out) {
      expect(o.control).toBeNull();
      expect(o.pointer).toBeNull();
      expect(o.select).toBe(false);
    }
  });

  it('a still hand pans nothing (dead zone), and pan is null when not panning', () => {
    const out = run(ENGAGE + 20, () => [pan({ pos: { x: 0.5, y: 0.5 }, noise: { xyMm: 0.3, zMm: 1, seed: 3 } })]);
    const settled = out.slice(-10);
    for (const o of settled) expect(o.pan).toEqual({ dx: 0, dy: 0 });
    expect(run(ENGAGE + 5, () => [gun()]).at(-1)!.pan).toBeNull();
  });

  it('losing the hand drops the pan at once', () => {
    const out = run(ENGAGE + 6, (i) => (i < ENGAGE + 3 ? [pan()] : []));
    expect(out[ENGAGE + 2]!.status).toBe('pan');
    expect(out[ENGAGE + 3]!.pan).toBeNull();
    expect(out[ENGAGE + 3]!.status).toBe('lost');
  });
});

describe('both hands at once', () => {
  it('one hand drives while the other pans', () => {
    const out = run(ENGAGE + 20, (i) => [gun(0.1, 0, { handedness: 'Right' }), pan({ handedness: 'Left', pos: { x: 0.6, y: 0.4 + i * 0.01 } })]);
    const o = out.at(-1)!;
    expect(o.hands.Right.status).toBe('gun');
    expect(o.hands.Left.status).toBe('pan');
    expect(o.control).not.toBeNull();
    expect(o.control!.push).toBeGreaterThan(0);
    expect(o.pan!.dy).toBeGreaterThan(0);
    expect(o.status).toBe('gun'); // the dominant hand leads the status
  });

  it('one hand points while the other drives; the pointer and select come from the pointing hand', () => {
    const out = run(ENGAGE + 20, (i) => [gun(0.1, 0, { handedness: 'Left' }), point({ handedness: 'Right', pos: { x: 0.5, y: 0.5 } }, i === ENGAGE + 10 ? 0.1 : 0.5)]);
    expect(out.at(-1)!.control).not.toBeNull();
    expect(out.at(-1)!.pointer).not.toBeNull();
    expect(out.filter((o) => o.select)).toHaveLength(1);
  });

  it('two panning hands pan by their mean', () => {
    const out = run(ENGAGE + 30, (i) => [pan({ handedness: 'Right', pos: { x: 0.3 + i * 0.01, y: 0.5 } }), pan({ handedness: 'Left', pos: { x: 0.6, y: 0.5 } })]);
    const o = out.at(-1)!;
    expect(o.pan!.dx).toBeCloseTo((o.hands.Right.pan!.dx + o.hands.Left.pan!.dx) / 2, 9);
    expect(o.pan!.dx).toBeGreaterThan(0);
  });

  it('losing one hand releases only that hand', () => {
    const out = run(ENGAGE + 10, (i) => (i < ENGAGE + 5 ? [gun(0.1, 0, { handedness: 'Right' }), pan({ handedness: 'Left' })] : [pan({ handedness: 'Left' })]));
    const o = out.at(-1)!;
    expect(o.hands.Right.status).toBe('lost');
    expect(o.control).toBeNull(); // the driving hand is gone: no control on that frame
    expect(o.hands.Left.status).toBe('pan');
    expect(o.status).toBe('pan');
  });

  it('is deterministic with two hands', () => {
    const script = (i: number) => [gun(0.1 + i * 0.01, i, { handedness: 'Right', noise: { xyMm: 1, zMm: 3, seed: i } }), pan({ handedness: 'Left', pos: { x: 0.5, y: 0.5 + i * 0.005 } })];
    expect(JSON.stringify(run(40, script))).toBe(JSON.stringify(run(40, script)));
  });
});
