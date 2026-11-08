/**
 * Hand twist as a turn ANGLE (David's request): with createHubFollow, a held twist turns the wire's hub to
 * a matching angle and stops, instead of spinning it at a rate. Simulated hub: it rolls at π rad/s at full
 * rotate, like the wire's hub.
 */
import { describe, expect, it } from 'vitest';
import { DEBOUNCE_MS, NEUTRAL_CAPTURE_MS } from './constants';
import { createGestureMachine } from './machine';
import { FRAME_MS, frame, gun } from './synthetic-hand.testutil';
import { createHubFollow, HUB_FOLLOW_DEAD_RAD, mergeControl } from './to-control';
import type { GestureConfig } from './types';

const CFG: GestureConfig = { dominant: 'Right', mirrored: false };
const RATE = Math.PI; // rad/s at full rotate
const DT = FRAME_MS / 1000;
const SETTLE = Math.ceil((DEBOUNCE_MS + NEUTRAL_CAPTURE_MS) / FRAME_MS) + 4;
const kb = { push: 0, rotate: 0, fluoro: false, contrastPuff: false };

/** Drive the hub for n frames with the hand at `rollDeg(i)`; returns the hub angle each frame and the last rotate. */
function drive(n: number, rollDeg: (i: number) => number, hub0 = 1.0) {
  const m = createGestureMachine(CFG);
  const follow = createHubFollow();
  let hub = hub0;
  const hubs: number[] = [];
  let last: number | null = null;
  for (let i = 0; i < n; i++) {
    const g = m.step(frame(i * FRAME_MS, gun(0.42, rollDeg(i))));
    last = follow.rotate(g, hub);
    const control = mergeControl(g, kb, last);
    hub += control.rotate * RATE * DT;
    hubs.push(hub);
  }
  return { hubs, last, hub };
}

describe('hand twist as a turn angle (createHubFollow)', () => {
  it('a held 60° twist turns the hub about 60° and stops: no spinning', () => {
    const { hub, last, hubs } = drive(SETTLE + 120, (i) => (i < SETTLE ? 0 : 60));
    expect(hub - 1.0).toBeCloseTo((60 * Math.PI) / 180, 1); // within ~3°, the twist filter's settle and the dead zone
    expect(Math.abs(last!)).toBeLessThanOrEqual(1);
    expect(last).toBe(0); // arrived: no more rotate
    const lastSecond = hubs.slice(-30);
    expect(Math.max(...lastSecond) - Math.min(...lastSecond)).toBeLessThan(HUB_FOLLOW_DEAD_RAD); // still
  });

  it('twisting back returns the hub; the rate mapping would have kept spinning instead', () => {
    const { hub } = drive(SETTLE + 200, (i) => (i < SETTLE ? 0 : i < SETTLE + 100 ? 60 : 0));
    expect(hub).toBeCloseTo(1.0, 1);
    // the old rate mapping, for contrast: a held 60° twist is full rotate, every frame
    const m = createGestureMachine(CFG);
    let g = m.step(frame(0, gun(0.42, 0)));
    for (let i = 1; i < SETTLE + 60; i++) g = m.step(frame(i * FRAME_MS, gun(0.42, i < SETTLE ? 0 : 60)));
    expect(g.control!.rotate).toBe(1);
  });

  it('stands aside without a hub roll (rail mode) or a hand in the gun, and re-zeroes on a new engagement', () => {
    const m = createGestureMachine(CFG);
    const follow = createHubFollow();
    let g = m.step(frame(0, gun(0.42, 0)));
    expect(follow.rotate(g, null)).toBeNull(); // rail: no hub roll
    for (let i = 1; i < SETTLE; i++) g = m.step(frame(i * FRAME_MS, gun(0.42, 0)));
    expect(follow.rotate(g, 2.0)).toBe(0); // engaged now: the hub's angle is the zero
    g = m.step(frame(SETTLE * FRAME_MS)); // the hand leaves
    expect(follow.rotate(g, 2.5)).toBeNull();
    for (let i = SETTLE + 1; i < 2 * SETTLE + 2; i++) g = m.step(frame(i * FRAME_MS, gun(0.42, 0)));
    expect(follow.rotate(g, 2.5)).toBe(0); // re-engaged: zero at the new hub angle, no jump back to 2.0
  });

  it('a keyboard rotate still wins over the hand', () => {
    const m = createGestureMachine(CFG);
    let g = m.step(frame(0, gun(0.42, 0)));
    for (let i = 1; i < SETTLE + 30; i++) g = m.step(frame(i * FRAME_MS, gun(0.42, i < SETTLE ? 0 : 60)));
    expect(mergeControl(g, { ...kb, rotate: -1 }, 0.8).rotate).toBe(-1);
  });
});
