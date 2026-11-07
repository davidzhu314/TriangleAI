import { describe, expect, it } from 'vitest';
import { DEBOUNCE_MS, NEUTRAL_CAPTURE_MS, PINCH_ENTER, PINCH_EXIT, PULL_ABOVE, PUSH_BELOW, TWIST_DEAD_DEG, TWIST_FULL_DEG } from './constants';
import { createGestureMachine } from './machine';
import { curlOf, flexion, isGun, isPoint, pinchRatio, pushFromCurl, rotateFromTwist, toUserView } from './pose';
import { FRAME_MS, frame, gun, point, syntheticHand } from './synthetic-hand.testutil';
import { mergeControl } from './to-control';
import type { GestureConfig, GestureOutput, HandObservation } from './types';

const CFG: GestureConfig = { dominant: 'Right', mirrored: false };

/** Feed `hand(i)` for `n` frames from t0; returns the outputs. */
function run(m: ReturnType<typeof createGestureMachine>, n: number, hand: (i: number) => HandObservation | null, t0 = 0): GestureOutput[] {
  return Array.from({ length: n }, (_, i) => {
    const h = hand(i);
    return m.step(frame(t0 + i * FRAME_MS, ...(h ? [h] : [])));
  });
}

/** A machine engaged in the gun pose, past debounce and neutral capture; returns it and the next t. */
function engagedGun(cfg = CFG) {
  const m = createGestureMachine(cfg);
  const frames = Math.ceil((DEBOUNCE_MS + NEUTRAL_CAPTURE_MS) / FRAME_MS) + 2;
  run(m, frames, () => gun(0.42, 0, cfg.mirrored ? { cameraFrame: true } : {}));
  return { m, t: frames * FRAME_MS };
}

describe('poses', () => {
  it('flexion reads the builder’s curl', () => {
    for (const f of [0, 0.25, 0.5, 0.75, 1]) expect(flexion(syntheticHand({ flex: { ring: f } }).world, 'ring')).toBeCloseTo(f, 1);
  });

  it('recognises the gun pose whatever the index/middle curl, and rejects near-misses', () => {
    for (const curl of [0, 0.4, 0.9]) expect(isGun(gun(curl).world), `curl ${curl}`).toBe(true);
    expect(isGun(syntheticHand({ flex: { index: 0, middle: 0, ring: 0, pinky: 1 }, thumb: 'out' }).world), 'three fingers up').toBe(false);
    expect(isGun(gun(0.2, 0, { thumb: 'folded' }).world), 'thumb folded').toBe(false);
    expect(isGun(gun(0.2, 0, { spreadDeg: 30 }).world), 'index and middle apart').toBe(false);
    expect(isGun(syntheticHand({ thumb: 'out' }).world), 'open palm').toBe(false);
  });

  it('recognises pointing, and an open palm or a gun is not a point', () => {
    expect(isPoint(point().world)).toBe(true);
    expect(isPoint(point({}, 0.1).world), 'pinching still points').toBe(true);
    expect(isPoint(syntheticHand({}).world), 'open palm').toBe(false);
    expect(isPoint(gun(0).world), 'gun with straight fingers').toBe(false);
  });

  it('curl zones: push below 0.30, hold to 0.55, pull above', () => {
    expect(pushFromCurl(0)).toBe(1);
    expect(pushFromCurl(PUSH_BELOW / 2)).toBeCloseTo(0.5, 12);
    expect(pushFromCurl(PUSH_BELOW)).toBe(0);
    expect(pushFromCurl(0.42)).toBe(0);
    expect(pushFromCurl(PULL_ABOVE)).toBe(0);
    expect(pushFromCurl(PULL_ABOVE + (1 - PULL_ABOVE) / 2)).toBeCloseTo(-0.5, 12);
    expect(pushFromCurl(1)).toBe(-1);
    expect(curlOf(gun(0.42).world)).toBeCloseTo(0.42, 1);
  });

  it('twist: dead zone, linear rate, saturation', () => {
    expect(rotateFromTwist(TWIST_DEAD_DEG)).toBe(0);
    expect(rotateFromTwist(-TWIST_DEAD_DEG + 0.1)).toBe(0);
    expect(rotateFromTwist((TWIST_DEAD_DEG + TWIST_FULL_DEG) / 2)).toBeCloseTo(0.5, 12);
    expect(rotateFromTwist(TWIST_FULL_DEG)).toBe(1);
    expect(rotateFromTwist(-90)).toBe(-1);
  });

  it('pinch ratio follows the thumb', () => {
    expect(pinchRatio(point({}, 0.1).world)).toBeCloseTo(0.1, 6);
  });

  it('mirroring flips x and handedness, in one place', () => {
    const user = gun(0.2, 20);
    const cam = gun(0.2, 20, { cameraFrame: true });
    expect(cam.handedness).toBe('Left');
    const back = toUserView(cam, { mirrored: true });
    expect(back.handedness).toBe('Right');
    back.world.forEach((p, i) => expect(p.x).toBeCloseTo(user.world[i]!.x, 12));
    back.image.forEach((p, i) => expect(p.x).toBeCloseTo(user.image[i]!.x, 12));
  });
});

describe('gesture machine', () => {
  it('debounce: the gun engages only after 150 ms held', () => {
    const m = createGestureMachine(CFG);
    const outs = run(m, 8, () => gun());
    const first = outs.findIndex((o) => o.status === 'gun');
    expect(first * FRAME_MS).toBeGreaterThanOrEqual(DEBOUNCE_MS);
    expect((first - 1) * FRAME_MS).toBeLessThan(DEBOUNCE_MS);
    expect(outs.slice(0, first).every((o) => o.control === null)).toBe(true);
  });

  it('push from curl once engaged; rotate stays 0 during neutral capture', () => {
    const m = createGestureMachine(CFG);
    const outs = run(m, 30, () => gun(0));
    const engaged = outs.filter((o) => o.control);
    expect(engaged.at(-1)!.control!.push).toBeGreaterThan(0.9); // a straight finger reads ~0.02 flexion (palm axis vs finger)
    expect(engaged.every((o) => o.control!.rotate === 0)).toBe(true);
  });

  it('twist: sign (clockwise is positive), saturation, and a fresh neutral after re-engaging', () => {
    const { m, t } = engagedGun();
    const cw = run(m, 30, () => gun(0.42, 30), t).at(-1)!;
    expect(cw.control!.rotate).toBeCloseTo((30 - TWIST_DEAD_DEG) / (TWIST_FULL_DEG - TWIST_DEAD_DEG), 1);
    expect(cw.debug.twistDeg).toBeCloseTo(30, 0);
    const ccw = run(m, 30, () => gun(0.42, -80), t + 30 * FRAME_MS).at(-1)!;
    expect(ccw.control!.rotate).toBe(-1);
    // lose the hand, come back already twisted 40°: that becomes the new neutral
    const t2 = t + 60 * FRAME_MS;
    expect(run(m, 1, () => null, t2)[0]!.control).toBeNull();
    const back = run(m, 30, () => gun(0.42, 40), t2 + FRAME_MS).at(-1)!;
    expect(back.status).toBe('gun');
    expect(back.control!.rotate).toBe(0);
  });

  it('safety: lost tracking, a low score or a dropped thumb give control null on that same frame', () => {
    const { m, t } = engagedGun();
    expect(run(m, 1, () => gun(0.1), t)[0]!.control).not.toBeNull();
    const lost = run(m, 1, () => null, t + FRAME_MS)[0]!;
    expect(lost).toMatchObject({ status: 'lost', control: null });
    const e2 = engagedGun();
    expect(run(e2.m, 1, () => gun(0.1, 0, { score: 0.4 }), e2.t)[0]!.control).toBeNull();
    const e3 = engagedGun();
    expect(run(e3.m, 1, () => gun(0.1, 0, { thumb: 'folded' }), e3.t)[0]!.control).toBeNull();
  });

  it('pinch: hysteresis, select fires exactly once, pointer frozen at its pre-pinch position', () => {
    const m = createGestureMachine(CFG);
    // point, moving right; then pinch while still moving (the drag pinching causes)
    const outs: GestureOutput[] = [];
    let t = 0;
    const at = (x: number, pinch?: number) => point({ pos: { x, y: 0.6 } }, pinch);
    for (let i = 0; i < 20; i++, t += FRAME_MS) outs.push(m.step(frame(t, at(0.4))));
    expect(outs.at(-1)!.status).toBe('point');
    const before = outs.at(-1)!.pointer!;
    const pinchSeq = [0.5, PINCH_EXIT - 0.02, PINCH_ENTER - 0.02, 0.1, PINCH_ENTER + 0.05, 0.1, PINCH_EXIT + 0.05, 0.5];
    const drift = [0.4, 0.4, 0.43, 0.46, 0.49, 0.52, 0.55, 0.55];
    const p = pinchSeq.map((r, i) => {
      const o = m.step(frame(t, at(drift[i]!, r)));
      t += FRAME_MS;
      return o;
    });
    expect(p.filter((o) => o.select)).toHaveLength(1);
    expect(p[2]!.select).toBe(true); // entered below PINCH_ENTER
    // inside the hysteresis band it stays pinched (no second select), and the pointer stays frozen
    for (const o of p.slice(2, 6)) {
      expect(o.pointer!.x).toBeCloseTo(before.x, 2);
    }
    expect(p.at(-1)!.pointer!.x).toBeGreaterThan(before.x + 0.05); // released: follows again
  });

  it('point pointer is in the user’s view when frames are mirrored', () => {
    const user = createGestureMachine(CFG);
    const cam = createGestureMachine({ dominant: 'Right', mirrored: true });
    const a = run(user, 12, () => point({ pos: { x: 0.3, y: 0.5 } })).at(-1)!;
    const b = run(cam, 12, () => point({ pos: { x: 0.3, y: 0.5 }, cameraFrame: true })).at(-1)!;
    expect(b.status).toBe('point');
    expect(b.pointer!.x).toBeCloseTo(a.pointer!.x, 9);
  });

  it('the other hand does not drive; a left-dominant config uses the left hand', () => {
    const m = createGestureMachine(CFG);
    expect(run(m, 12, () => gun(0, 0, { handedness: 'Left' })).at(-1)!.status).toBe('none');
    const left = createGestureMachine({ dominant: 'Left', mirrored: false });
    expect(run(left, 12, () => gun(0, 0, { handedness: 'Left' })).at(-1)!.status).toBe('gun');
  });

  it('is deterministic: the same frames give the same outputs', () => {
    const script = (i: number) => (i < 20 ? gun(0.1 + i * 0.03, i * 2) : i < 30 ? null : point({ pos: { x: 0.3 + i * 0.005, y: 0.5 } }, i > 40 ? 0.1 : 0.5));
    const a = run(createGestureMachine(CFG), 50, script);
    const b = run(createGestureMachine(CFG), 50, script);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('mergeControl', () => {
  const kb = { push: 0, rotate: 0, fluoro: true, contrastPuff: false };
  const g = (control: GestureOutput['control']): GestureOutput => ({ status: control ? 'gun' : 'none', control, pointer: null, select: false, debug: {} });

  it('uses the gesture on idle keyboard axes; the keyboard wins on any axis it moves', () => {
    expect(mergeControl(g({ push: 0.5, rotate: -0.3 }), kb)).toEqual({ push: 0.5, rotate: -0.3, fluoro: true, contrastPuff: false });
    expect(mergeControl(g({ push: 0.5, rotate: -0.3 }), { ...kb, rotate: 1 })).toEqual({ push: 0.5, rotate: 1, fluoro: true, contrastPuff: false });
  });

  it('passes the keyboard through when the gesture is not engaged; fluoro and contrast are always the keyboard’s', () => {
    expect(mergeControl(g(null), { ...kb, push: -1, contrastPuff: true })).toEqual({ ...kb, push: -1, contrastPuff: true });
  });
});
