/**
 * The non-dominant hand's pinch-grab turns the view: a held pinch (thumb tip to index tip) grabs, moving the pinch
 * pans, twisting it rolls, opening it lets go. The dominant hand's pinch is unchanged (a select while pointing).
 */
import { describe, expect, it } from 'vitest';
import { RELEASE_GRACE_MS } from './constants';
import { createGestureMachine } from './machine';
import { FRAME_MS, frame, point, syntheticHand } from './synthetic-hand.testutil';
import type { GestureOutput, HandObservation } from './types';

const PINCHED = 0.1;
const grabHand = (x: number, rollDeg = 0, pinch = PINCHED): HandObservation => syntheticHand({ handedness: 'Left', thumb: { pinch }, pos: { x, y: 0.5 }, rollDeg });

function run(hands: (i: number) => HandObservation[], n: number, start = 0): GestureOutput[] {
  const m = createGestureMachine({ dominant: 'Right', mirrored: false });
  const outs: GestureOutput[] = [];
  for (let i = 0; i < n; i++) outs.push(m.step(frame((start + i) * FRAME_MS, ...hands(i))));
  return outs;
}

describe('pinch-grab on the non-dominant hand', () => {
  it('a held pinch engages the pan pose after the debounce, and moving the pinch pans', () => {
    const outs = run((i) => [grabHand(0.4 + (i > 15 ? (i - 15) * 0.01 : 0))], 40);
    expect(outs[2]!.hands.Left.status).toBe('none'); // still debouncing
    expect(outs[20]!.hands.Left.status).toBe('pan');
    const moved = outs.slice(25).map((o) => o.pan?.dx ?? 0);
    expect(Math.max(...moved)).toBeGreaterThan(0); // the pinch moved right: the view pans right
    expect(outs.every((o) => !o.select)).toBe(true); // the grab never selects
  });

  it('twisting the pinching hand rolls, in the direction of the twist; a still hand does not', () => {
    const still = run(() => [grabHand(0.4)], 40);
    expect(still.slice(20).every((o) => (o.pan?.roll ?? 0) === 0)).toBe(true);
    const twisting = run((i) => [grabHand(0.4, i > 15 ? (i - 15) * 2 : 0)], 45);
    const roll = twisting.slice(20).reduce((s, o) => s + (o.pan?.roll ?? 0), 0);
    expect(roll).toBeGreaterThan(0); // clockwise hand twist, clockwise roll
    const back = run((i) => [grabHand(0.4, i > 15 ? -(i - 15) * 2 : 0)], 45);
    expect(back.slice(20).reduce((s, o) => s + (o.pan?.roll ?? 0), 0)).toBeLessThan(0);
  });

  it('opening the pinch lets go after the grace period', () => {
    const open = Math.ceil(RELEASE_GRACE_MS / FRAME_MS) + 3;
    const outs = run((i) => [grabHand(0.4, 0, i < 25 ? PINCHED : 0.6)], 25 + open);
    expect(outs[24]!.hands.Left.status).toBe('pan');
    expect(outs.at(-1)!.hands.Left.status).not.toBe('pan');
    expect(outs.at(-1)!.pan).toBeNull();
  });

  it('the dominant hand\'s pinch is still a select while pointing, never a grab', () => {
    const m = createGestureMachine({ dominant: 'Right', mirrored: false });
    let selects = 0;
    let grabbed = false;
    for (let i = 0; i < 40; i++) {
      const o = m.step(frame(i * FRAME_MS, point({ handedness: 'Right' }, i > 20 ? PINCHED : 0.5))); // open, then pinch
      if (o.select) selects++;
      if (o.hands.Right.status === 'pan') grabbed = true;
    }
    expect(selects).toBe(1);
    expect(grabbed).toBe(false);
  });

  it('both hands at once: the dominant hand drives while the other hand\'s pinch turns the view', () => {
    const gun = (): HandObservation => syntheticHand({ handedness: 'Right', flex: { index: 0, middle: 0, ring: 1, pinky: 1 }, thumb: 'out', pos: { x: 0.7, y: 0.5 } });
    const outs = run((i) => [gun(), grabHand(0.3 + (i > 15 ? (i - 15) * 0.01 : 0))], 40);
    const last = outs.at(-1)!;
    expect(last.hands.Right.status).toBe('gun');
    expect(last.control).not.toBeNull();
    expect(last.hands.Left.status).toBe('pan');
    expect(last.pan).not.toBeNull();
  });
});
