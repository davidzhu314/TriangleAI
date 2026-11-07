/**
 * The gesture state machine: `createGestureMachine(config).step(frame) → GestureOutput`. Same frames
 * in, same outputs out: time comes only from `frame.tMs`.
 *
 * - Engaging a pose (gun or point) needs it held for DEBOUNCE_MS; so does switching to the other one.
 * - Safety: with no dominant hand, a score below MIN_SCORE, or the gun pose broken (thumb down,
 *   fingers apart), `control` is null on that same frame, with no smoothing or debounce. When the
 *   hand returns it re-engages and captures a fresh twist neutral.
 * - Gun: push from curl (One-Euro smoothed), rotate from twist about the neutral captured over the
 *   first NEUTRAL_CAPTURE_MS after engaging (rotate is 0 meanwhile).
 * - Point: the pointer is the index tip (smoothed, user's view). A pinch (with hysteresis) fires
 *   `select` once on entering it, and freezes the pointer where it was PINCH_FREEZE_BACK_MS before.
 */

import { DEBOUNCE_MS, MIN_SCORE, NEUTRAL_CAPTURE_MS, ONE_EURO, PINCH_ENTER, PINCH_EXIT, PINCH_FREEZE_BACK_MS } from './constants';
import { OneEuro } from './filter';
import { curlOf, isGun, isPoint, knuckleLine, pinchRatio, pushFromCurl, rotateFromTwist, toUserView, twistDeg, type Vec } from './pose';
import { LM, type GestureConfig, type GestureOutput, type HandFrame, type HandObservation, type HandStatus } from './types';

type Pose = 'gun' | 'point';

export interface GestureMachine {
  step(frame: HandFrame): GestureOutput;
}

const unit = (a: Vec): Vec => {
  const n = Math.hypot(a[0], a[1], a[2]);
  return n > 1e-12 ? [a[0] / n, a[1] / n, a[2] / n] : [0, 0, 0];
};

export function createGestureMachine(config: GestureConfig): GestureMachine {
  let status: HandStatus = 'none';
  let candidate: { pose: Pose; sinceMs: number } | null = null;
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

  const out = (control: GestureOutput['control'], pointer: GestureOutput['pointer'], select: boolean, debug: GestureOutput['debug']): GestureOutput => ({
    status,
    control,
    pointer,
    select,
    debug,
  });

  function dominantHand(frame: HandFrame): HandObservation | null {
    let best: HandObservation | null = null;
    for (const raw of frame.hands) {
      const h = toUserView(raw, config);
      if (h.handedness === config.dominant && (!best || h.score > best.score)) best = h;
    }
    return best;
  }

  function step(frame: HandFrame): GestureOutput {
    const t = frame.tMs;
    const hand = dominantHand(frame);

    // safety: no hand, or a poor one: drop control on this frame
    if (!hand || hand.score < MIN_SCORE || hand.world.length < 21) {
      status = status === 'gun' || status === 'point' || status === 'lost' ? 'lost' : 'none';
      candidate = null;
      pinched = false;
      resetGun();
      resetPoint();
      return out(null, null, false, {});
    }

    const w = hand.world;
    const pose: Pose | null = isGun(w) ? 'gun' : isPoint(w) ? 'point' : null;
    const pinch = pinchRatio(w);
    let enteredPinch = false;
    if (!pinched && pinch < PINCH_ENTER) {
      pinched = true;
      enteredPinch = true;
    } else if (pinched && pinch > PINCH_EXIT) {
      pinched = false;
      frozen = null;
    }

    // an active pose that breaks disengages at once
    if ((status === 'gun' || status === 'point') && pose !== status) {
      if (status === 'gun') resetGun();
      else resetPoint();
      status = 'none';
    }
    if (status !== 'gun' && status !== 'point') {
      status = 'none';
      if (!pose) candidate = null;
      else if (!candidate || candidate.pose !== pose) candidate = { pose, sinceMs: t };
      if (candidate && t - candidate.sinceMs >= DEBOUNCE_MS) {
        status = candidate.pose;
        candidate = null;
        if (status === 'gun') {
          resetGun();
          engagedMs = t;
          capturing = true;
        } else {
          resetPoint();
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
      return out({ push: pushFromCurl(curl), rotate }, null, false, { curl, twistDeg: twist, pinch });
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
      return out(null, pointer, enteredPinch, { pinch });
    }

    return out(null, null, false, { pinch });
  }

  return { step };
}
