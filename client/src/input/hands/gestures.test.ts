/**
 * Hand gestures, on synthetic hands (no camera). Grouped by what a player does:
 * 1. Making a pose: what counts as a gun or a point, and the near-misses that don't.
 * 2. Holding it in the real world: wherever the hand points, while twisting, with tracking noise.
 * 3. Push, pull and twist: the curl and twist zones.
 * 4. Letting go: grace for a wobble, instant release for a lost hand or a dropped thumb.
 * 5. Point and pinch, mirroring, and which hand drives.
 */

import { describe, expect, it } from 'vitest';
import { DEBOUNCE_MS, GUN, NEUTRAL_CAPTURE_MS, PINCH_ENTER, PINCH_EXIT, PULL_ABOVE, PULL_FULL_AT, PUSH_BELOW, PUSH_FULL_AT, RELEASE_GRACE_MS, TWIST_DEAD_DEG, TWIST_FULL_DEG } from './constants';
import { createGestureMachine } from './machine';
import { curlOf, flexion, gunChecks, isGun, isPoint, pinchRatio, pointChecks, pushFromCurl, rotateFromTwist, toUserView, type PoseCheck } from './pose';
import { FRAME_MS, frame, gun, point, syntheticHand, type HandSpec } from './synthetic-hand.testutil';
import { mergeControl } from './to-control';
import type { GestureConfig, GestureOutput, HandObservation } from './types';

const CFG: GestureConfig = { dominant: 'Right', mirrored: false };
const failing = (checks: PoseCheck[]) => checks.filter((c) => !c.ok).map((c) => c.name);

/** Feed `hand(i)` for `n` frames at 30 Hz from t0; returns the outputs. */
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

describe('1. making a pose', () => {
  it('flexion reads how curled a finger is (0 straight … 1 fully curled)', () => {
    for (const f of [0, 0.25, 0.5, 0.75, 1]) expect(flexion(syntheticHand({ flex: { ring: f } }).world, 'ring')).toBeCloseTo(f, 1);
  });

  it('a gun is ring and pinky folded, thumb up, index and middle together, however curled the barrel is', () => {
    for (const barrel of [0, 0.4, 0.9]) expect(failing(gunChecks(gun(barrel).world)), `barrel curl ${barrel}`).toEqual([]);
  });

  it.each([
    ['ring finger open', syntheticHand({ flex: { ring: 0, pinky: 1 }, thumb: 'out' }), ['ring curl']],
    ['thumb folded down', gun(0.2, 0, { thumb: 'folded' }), ['thumb up']],
    ['index and middle spread apart', gun(0.2, 0, { spreadDeg: 45 }), ['barrel gap']],
    ['open palm', syntheticHand({ thumb: 'out' }), ['ring curl', 'pinky curl']],
  ] as const)('not a gun: %s', (_, hand, why) => {
    expect(failing(gunChecks(hand.world))).toEqual(why);
  });

  it('a point is the index out with the other three folded; the thumb is free so it can pinch', () => {
    expect(isPoint(point().world)).toBe(true);
    expect(isPoint(point({}, 0.1).world), 'pinching').toBe(true);
    expect(failing(pointChecks(syntheticHand({}).world)), 'open palm').toEqual(['middle curl', 'ring curl', 'pinky curl']);
    expect(isPoint(gun(0).world), 'a gun with a straight barrel').toBe(false);
  });

  it('a hand between the two levels does not start a gun, but keeps one going', () => {
    const marginal = syntheticHand({ flex: { index: 0.4, middle: 0.4, ring: 0.42, pinky: 0.42 }, thumb: 'out' });
    expect(isGun(marginal.world, 'enter')).toBe(false);
    expect(isGun(marginal.world, 'stay')).toBe(true);
    expect(run(createGestureMachine(CFG), 20, () => marginal).at(-1)!.status).toBe('none');
    const { m, t } = engagedGun();
    expect(run(m, 20, () => marginal, t).every((o) => o.status === 'gun')).toBe(true);
  });
});

describe('2. holding the gun in the real world', () => {
  const AIMS: [string, HandSpec][] = [
    ['at the camera', {}],
    ['45° to the right', { yawDeg: 45 }],
    ['45° to the left', { yawDeg: -45 }],
    ['30° up', { pitchDeg: 30 }],
    ['30° down', { pitchDeg: -30 }],
    ['up and to the right', { yawDeg: 35, pitchDeg: 20 }],
  ];

  it.each(AIMS)('is recognised pointing %s', (_, aim) => {
    expect(failing(gunChecks(gun(0.42, 0, aim).world))).toEqual([]);
  });

  it('stays engaged while sweeping the aim from left to right and back', () => {
    const { m, t } = engagedGun();
    const sweep = run(m, 90, (i) => gun(0.42, 0, { yawDeg: 45 * Math.sin((i / 90) * 2 * Math.PI), pitchDeg: 20 * Math.cos((i / 45) * Math.PI) }), t);
    expect(sweep.every((o) => o.status === 'gun' && o.control)).toBe(true);
  });

  it('stays engaged through ±60° of twist with noisy tracking, where the strict level alone would flicker', () => {
    const { m, t } = engagedGun();
    const noisy = (i: number) => gun(0.42, 60 * Math.sin((i / 60) * 2 * Math.PI), { noise: { xyMm: 4, zMm: 12, seed: i + 1 } });
    const strictMisses = Array.from({ length: 90 }, (_, i) => isGun(noisy(i).world, 'enter')).filter((ok) => !ok).length;
    expect(strictMisses).toBeGreaterThan(0); // the noise is real enough to break the ENTER checks
    const outs = run(m, 90, noisy, t);
    expect(outs.every((o) => o.status === 'gun' && o.control)).toBe(true);
    expect(Math.max(...outs.map((o) => o.control!.rotate))).toBeGreaterThan(0.5);
    expect(Math.min(...outs.map((o) => o.control!.rotate))).toBeLessThan(-0.5);
  });
});

describe('3. push, pull and twist', () => {
  it.each([
    [0.1, 1, 'straight'],
    [PUSH_FULL_AT, 1, 'relaxed straight fingers: full push'],
    [(PUSH_FULL_AT + PUSH_BELOW) / 2, 0.5, 'halfway into the push zone'],
    [PUSH_BELOW, 0, 'edge of the hold zone'],
    [0.45, 0, 'half-curled: hold'],
    [PULL_ABOVE, 0, 'edge of the pull zone'],
    [(PULL_ABOVE + PULL_FULL_AT) / 2, -0.5, 'halfway into the pull zone'],
    [PULL_FULL_AT, -1, 'fully curled: full pull'],
    [1, -1, 'past full pull'],
  ])('curl %f → push %f (%s)', (curl, push) => {
    expect(pushFromCurl(curl)).toBeCloseTo(push, 12);
  });

  it('the curl the gesture uses is the mean of index and middle flexion', () => {
    expect(curlOf(gun(0.42).world)).toBeCloseTo(0.42, 1);
  });

  it.each([
    [0, 0, 'no twist'],
    [TWIST_DEAD_DEG, 0, 'inside the dead zone'],
    [(TWIST_DEAD_DEG + TWIST_FULL_DEG) / 2, 0.5, 'half rate'],
    [TWIST_FULL_DEG, 1, 'full rate'],
    [-90, -1, 'past full, counter-clockwise'],
  ])('twist %f° → rotate %f (%s)', (deg, rotate) => {
    expect(rotateFromTwist(deg)).toBeCloseTo(rotate, 12);
  });

  it('relaxed straight fingers give full push once engaged; rotate is 0 while the neutral is captured', () => {
    const outs = run(createGestureMachine(CFG), 30, () => gun(0.2));
    const engaged = outs.filter((o) => o.control);
    expect(engaged.at(-1)!.control!.push).toBe(1);
    expect(engaged.every((o) => o.control!.rotate === 0)).toBe(true);
  });

  it('twist: clockwise (as the player sees it) is positive, it saturates, and re-engaging takes a fresh neutral', () => {
    const { m, t } = engagedGun();
    const cw = run(m, 30, () => gun(0.42, 30), t).at(-1)!;
    expect(cw.debug.twistDeg).toBeCloseTo(30, 0);
    expect(cw.control!.rotate).toBeCloseTo((30 - TWIST_DEAD_DEG) / (TWIST_FULL_DEG - TWIST_DEAD_DEG), 1);
    expect(run(m, 30, () => gun(0.42, -80), t + 30 * FRAME_MS).at(-1)!.control!.rotate).toBe(-1);
    const t2 = t + 60 * FRAME_MS;
    expect(run(m, 1, () => null, t2)[0]!.control).toBeNull();
    const back = run(m, 30, () => gun(0.42, 40), t2 + FRAME_MS).at(-1)!; // comes back already twisted: that is the new neutral
    expect(back.status).toBe('gun');
    expect(back.control!.rotate).toBe(0);
  });
});

describe('4. letting go', () => {
  it('the gun engages only after being held for the debounce time', () => {
    const outs = run(createGestureMachine(CFG), 8, () => gun());
    const first = outs.findIndex((o) => o.status === 'gun');
    expect(first * FRAME_MS).toBeGreaterThanOrEqual(DEBOUNCE_MS);
    expect((first - 1) * FRAME_MS).toBeLessThan(DEBOUNCE_MS);
    expect(outs.slice(0, first).every((o) => o.control === null)).toBe(true);
  });

  it('a short wobble (ring finger opening for under the grace time) keeps the gun; a longer one releases it', () => {
    const open = syntheticHand({ flex: { index: 0.42, middle: 0.42, ring: 0, pinky: 1 }, thumb: 'out' });
    const brief = Math.floor(RELEASE_GRACE_MS / FRAME_MS) - 1;
    const a = engagedGun();
    expect(run(a.m, brief, () => open, a.t).every((o) => o.status === 'gun')).toBe(true);
    expect(run(a.m, 5, () => gun(), a.t + brief * FRAME_MS).every((o) => o.status === 'gun')).toBe(true);
    const b = engagedGun();
    expect(run(b.m, brief + 4, () => open, b.t).at(-1)!).toMatchObject({ status: 'none', control: null });
  });

  it('a lost hand, a low tracking score or a dropped thumb release control on that same frame', () => {
    const a = engagedGun();
    expect(run(a.m, 1, () => null, a.t)[0]).toMatchObject({ status: 'lost', control: null });
    const b = engagedGun();
    expect(run(b.m, 1, () => gun(0.1, 0, { score: 0.4 }), b.t)[0]!.control).toBeNull();
    const c = engagedGun();
    expect(run(c.m, 1, () => gun(0.1, 0, { thumb: 'folded' }), c.t)[0]!.control).toBeNull();
    expect(GUN.stay.thumbUpMin).toBeGreaterThan(0);
  });
});

describe('5. point and pinch, mirroring, and which hand drives', () => {
  it('pinch: one select per pinch (with hysteresis), and the pointer freezes at its pre-pinch position', () => {
    const m = createGestureMachine(CFG);
    let t = 0;
    const at = (x: number, pinch?: number) => point({ pos: { x, y: 0.6 } }, pinch);
    let last!: GestureOutput;
    for (let i = 0; i < 20; i++, t += FRAME_MS) last = m.step(frame(t, at(0.4)));
    expect(last.status).toBe('point');
    const before = last.pointer!;
    const pinchSeq = [0.5, PINCH_EXIT - 0.02, PINCH_ENTER - 0.02, 0.1, PINCH_ENTER + 0.05, 0.1, PINCH_EXIT + 0.05, 0.5];
    const drift = [0.4, 0.4, 0.43, 0.46, 0.49, 0.52, 0.55, 0.55];
    const p = pinchSeq.map((r, i) => {
      const o = m.step(frame(t, at(drift[i]!, r)));
      t += FRAME_MS;
      return o;
    });
    expect(p.filter((o) => o.select)).toHaveLength(1);
    expect(p[2]!.select).toBe(true);
    for (const o of p.slice(2, 6)) expect(o.pointer!.x).toBeCloseTo(before.x, 2);
    expect(p.at(-1)!.pointer!.x).toBeGreaterThan(before.x + 0.05);
  });

  it('pinch ratio is the thumb-to-index distance over palm size', () => {
    expect(pinchRatio(point({}, 0.1).world)).toBeCloseTo(0.1, 6);
  });

  it('mirroring flips x but keeps MediaPipe’s real-hand label; swapHandedness swaps it', () => {
    const user = gun(0.2, 20);
    const cam = gun(0.2, 20, { cameraFrame: true });
    expect(cam.handedness).toBe('Right');
    const back = toUserView(cam, { mirrored: true });
    expect(back.handedness).toBe('Right');
    expect(toUserView(cam, { mirrored: true, swapHandedness: true }).handedness).toBe('Left');
    back.world.forEach((q, i) => expect(q.x).toBeCloseTo(user.world[i]!.x, 12));
    back.image.forEach((q, i) => expect(q.x).toBeCloseTo(user.image[i]!.x, 12));
  });

  it('the pointer is in the player’s view when frames come from the camera un-mirrored', () => {
    const a = run(createGestureMachine(CFG), 12, () => point({ pos: { x: 0.3, y: 0.5 } })).at(-1)!;
    const b = run(createGestureMachine({ dominant: 'Right', mirrored: true }), 12, () => point({ pos: { x: 0.3, y: 0.5 }, cameraFrame: true })).at(-1)!;
    expect(b.status).toBe('point');
    expect(b.pointer!.x).toBeCloseTo(a.pointer!.x, 9);
  });

  it('only the dominant hand drives; a left-dominant player uses the left hand', () => {
    expect(run(createGestureMachine(CFG), 12, () => gun(0, 0, { handedness: 'Left' })).at(-1)!.status).toBe('none');
    expect(run(createGestureMachine({ dominant: 'Left', mirrored: false }), 12, () => gun(0, 0, { handedness: 'Left' })).at(-1)!.status).toBe('gun');
  });

  it('is deterministic: the same frames give the same outputs', () => {
    const script = (i: number) => (i < 20 ? gun(0.1 + i * 0.03, i * 2, { noise: { xyMm: 1, zMm: 3, seed: i } }) : i < 30 ? null : point({ pos: { x: 0.3 + i * 0.005, y: 0.5 } }, i > 40 ? 0.1 : 0.5));
    expect(JSON.stringify(run(createGestureMachine(CFG), 50, script))).toBe(JSON.stringify(run(createGestureMachine(CFG), 50, script)));
  });
});

describe('mergeControl (gesture → the wire)', () => {
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
