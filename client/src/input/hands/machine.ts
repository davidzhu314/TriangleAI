/**
 * The gesture state machine: `createGestureMachine(config).step(frame) → GestureOutput`. Same frames
 * in, same outputs out: time comes only from `frame.tMs`.
 *
 * Both hands at once: each hand has its own machine (`createHandMachine`), so either hand can drive,
 * point or pan, and the two can do different things at the same time (one drives, the other pans).
 * `createGestureMachine` runs both and combines them (see GestureOutput).
 *
 * Per hand:
 * - Engaging a pose (gun, point or pan) needs it held at the strict ENTER level for DEBOUNCE_MS; so
 *   does switching to another one.
 * - Once engaged, the pose is kept at the looser STAY level, and a STAY failure must last
 *   RELEASE_GRACE_MS before the pose drops, so tracking noise and twisting don't release it.
 * - Safety: with that hand missing, a score below MIN_SCORE, or the thumb dropped out of the gun,
 *   `control` is null on that same frame, with no smoothing, debounce or grace. When the hand
 *   returns it re-engages and captures a fresh twist neutral.
 * - Gun: push from curl (One-Euro smoothed), rotate from twist about the neutral captured over the
 *   first NEUTRAL_CAPTURE_MS after engaging (rotate is 0 meanwhile).
 * - Point: the pointer is the index tip (smoothed, user's view). A pinch (with hysteresis) fires
 *   `select` once on entering it, and freezes the pointer where it was PINCH_FREEZE_BACK_MS before.
 * - Pan: index, middle and ring out, like three fingers on a trackpad. Each frame's movement of the
 *   knuckles (smoothed, user's view) × PAN_GAIN is `pan`, with a small dead zone against jitter.
 */

import { DEBOUNCE_MS, MIN_SCORE, NEUTRAL_CAPTURE_MS, ONE_EURO, PAN_DEADZONE, PAN_GAIN, PINCH_ENTER, PINCH_EXIT, PINCH_FREEZE_BACK_MS, RELEASE_GRACE_MS } from './constants';
import { OneEuro } from './filter';
import { curlOf, isGun, isPan, isPoint, knuckleLine, panAnchor, pinchRatio, pushFromCurl, rotateFromTwist, thumbStillUp, toUserView, twistDeg, type Vec } from './pose';
import { LM, type GestureConfig, type GestureOutput, type HandFrame, type HandObservation, type HandOutput, type HandStatus } from './types';

type Pose = 'gun' | 'point' | 'pan';
type Side = 'Left' | 'Right';

export interface GestureMachine {
  step(frame: HandFrame): GestureOutput;
}

export interface HandMachine {
  step(frame: HandFrame): HandOutput;
}

const unit = (a: Vec): Vec => {
  const n = Math.hypot(a[0], a[1], a[2]);
  return n > 1e-12 ? [a[0] / n, a[1] / n, a[2] / n] : [0, 0, 0];
};
const engaged = (s: HandStatus): boolean => s === 'gun' || s === 'point' || s === 'pan';
const dead = (d: number): number => (Math.abs(d) <= PAN_DEADZONE ? 0 : d);

/** One hand's machine: follows the best-scored hand MediaPipe labels `side` (after `toUserView`). */
export function createHandMachine(config: Omit<GestureConfig, 'dominant'>, side: Side): HandMachine {
  let status: HandStatus = 'none';
  let candidate: { pose: Pose; sinceMs: number } | null = null;
  /** When the engaged pose first failed its STAY checks (null while it holds). */
  let brokenSinceMs: number | null = null;
  // gun
  let engagedMs = 0;
  let neutralSum: Vec = [0, 0, 0];
  let neutral: Vec | null = null;
  let capturing = false;
  const curlF = new OneEuro(ONE_EURO.curl);
  const twistF = new OneEuro(ONE_EURO.twist);
  // point
  const pxF = new OneEuro(ONE_EURO.pointer);
  const pyF = new OneEuro(ONE_EURO.pointer);
  let history: { tMs: number; x: number; y: number }[] = [];
  let pinched = false;
  let frozen: { x: number; y: number } | null = null;
  // pan
  const axF = new OneEuro(ONE_EURO.pan);
  const ayF = new OneEuro(ONE_EURO.pan);
  let lastAnchor: { x: number; y: number } | null = null;

  const resetGun = () => {
    neutral = null;
    neutralSum = [0, 0, 0];
    capturing = false;
    curlF.reset();
    twistF.reset();
  };
  const resetPoint = () => {
    pxF.reset();
    pyF.reset();
    history = [];
    frozen = null;
  };
  const resetPan = () => {
    axF.reset();
    ayF.reset();
    lastAnchor = null;
  };
  const resetPose = (p: HandStatus) => {
    if (p === 'gun') resetGun();
    else if (p === 'point') resetPoint();
    else if (p === 'pan') resetPan();
  };

  const out = (
    control: HandOutput['control'],
    pointer: HandOutput['pointer'],
    select: boolean,
    pan: HandOutput['pan'],
    debug: HandOutput['debug'],
  ): HandOutput => ({ status, control, pointer, select, pan, debug });

  function handOf(frame: HandFrame): HandObservation | null {
    let best: HandObservation | null = null;
    for (const raw of frame.hands) {
      const h = toUserView(raw, config);
      if (h.handedness === side && (!best || h.score > best.score)) best = h;
    }
    return best;
  }

  function step(frame: HandFrame): HandOutput {
    const t = frame.tMs;
    const hand = handOf(frame);

    // safety: no hand, or a poor one: drop control on this frame
    if (!hand || hand.score < MIN_SCORE || hand.world.length < 21) {
      status = engaged(status) || status === 'lost' ? 'lost' : 'none';
      candidate = null;
      brokenSinceMs = null;
      pinched = false;
      resetGun();
      resetPoint();
      resetPan();
      return out(null, null, false, null, {});
    }

    const w = hand.world;
    const pinch = pinchRatio(hand.image);
    let enteredPinch = false;
    if (!pinched && pinch < PINCH_ENTER) {
      pinched = true;
      enteredPinch = true;
    } else if (pinched && pinch > PINCH_EXIT) {
      pinched = false;
      frozen = null;
    }

    // keep an engaged pose at the STAY level, with a grace period; a dropped thumb releases the gun at once
    if (engaged(status)) {
      const holds = status === 'gun' ? isGun(w, 'stay') : status === 'point' ? isPoint(w, 'stay', pinch) : isPan(w, 'stay');
      if (holds) brokenSinceMs = null;
      else brokenSinceMs ??= t;
      const thumbDropped = status === 'gun' && !thumbStillUp(w);
      if (thumbDropped || (brokenSinceMs !== null && t - brokenSinceMs >= RELEASE_GRACE_MS)) {
        resetPose(status);
        status = 'none';
        brokenSinceMs = null;
      }
    }
    if (!engaged(status)) {
      const pose: Pose | null = isGun(w, 'enter') ? 'gun' : isPoint(w, 'enter') ? 'point' : isPan(w, 'enter') ? 'pan' : null;
      status = 'none';
      if (!pose) candidate = null;
      else if (!candidate || candidate.pose !== pose) candidate = { pose, sinceMs: t };
      if (candidate && t - candidate.sinceMs >= DEBOUNCE_MS) {
        status = candidate.pose;
        candidate = null;
        resetPose(status);
        if (status === 'gun') {
          engagedMs = t;
          capturing = true;
        }
      }
    }

    if (status === 'gun') {
      const curl = curlF.filter(curlOf(w), t);
      const k = knuckleLine(w);
      let rotate = 0;
      let twist = 0;
      if (capturing) {
        neutralSum = [neutralSum[0] + k[0], neutralSum[1] + k[1], neutralSum[2] + k[2]];
        neutral = unit(neutralSum);
        if (t - engagedMs >= NEUTRAL_CAPTURE_MS) capturing = false;
      } else {
        twist = twistF.filter(twistDeg(w, neutral!), t);
        rotate = rotateFromTwist(twist);
      }
      return out({ push: pushFromCurl(curl), rotate }, null, false, null, { curl, twistDeg: twist, pinch });
    }

    if (status === 'point') {
      const tip = hand.image[LM.INDEX_TIP]!;
      const p = { x: pxF.filter(tip.x, t), y: pyF.filter(tip.y, t) };
      history.push({ tMs: t, ...p });
      while (history.length > 1 && history[0]!.tMs < t - 4 * PINCH_FREEZE_BACK_MS) history.shift();
      if (enteredPinch) {
        const back = [...history].reverse().find((h) => h.tMs <= t - PINCH_FREEZE_BACK_MS) ?? history[0]!;
        frozen = { x: back.x, y: back.y };
      }
      const pointer = pinched && frozen ? { ...frozen } : p;
      return out(null, pointer, enteredPinch, null, { pinch });
    }

    if (status === 'pan') {
      const raw = panAnchor(hand.image);
      const a = { x: axF.filter(raw.x, t), y: ayF.filter(raw.y, t) };
      const pan = lastAnchor ? { dx: dead((a.x - lastAnchor.x) * PAN_GAIN), dy: dead((a.y - lastAnchor.y) * PAN_GAIN) } : { dx: 0, dy: 0 };
      lastAnchor = a;
      return out(null, null, false, pan, { pinch });
    }

    return out(null, null, false, null, { pinch });
  }

  return { step };
}

/** Both hands: one machine each, combined (see GestureOutput). */
export function createGestureMachine(config: GestureConfig): GestureMachine {
  const machines = { Left: createHandMachine(config, 'Left'), Right: createHandMachine(config, 'Right') };
  const otherSide: Side = config.dominant === 'Right' ? 'Left' : 'Right';

  function step(frame: HandFrame): GestureOutput {
    const hands = { Left: machines.Left.step(frame), Right: machines.Right.step(frame) };
    const dom = hands[config.dominant];
    const oth = hands[otherSide];
    const lead = engaged(dom.status) || !engaged(oth.status) ? dom : oth;
    const pans = [dom.pan, oth.pan].filter((p): p is { dx: number; dy: number } => p !== null);
    return {
      status: lead.status === 'none' && (dom.status === 'lost' || oth.status === 'lost') ? 'lost' : lead.status,
      control: dom.control ?? oth.control,
      pointer: dom.pointer ?? oth.pointer,
      select: dom.select || oth.select,
      pan: pans.length === 0 ? null : { dx: pans.reduce((s, p) => s + p.dx, 0) / pans.length, dy: pans.reduce((s, p) => s + p.dy, 0) / pans.length },
      debug: lead.debug,
      hands,
    };
  }

  return { step };
}
