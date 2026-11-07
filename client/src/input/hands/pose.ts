/**
 * Pose geometry on world landmarks (metres, hand-centred), so poses don't change as the hand moves
 * or rotates. Pure functions.
 *
 * Coordinates are in the user's view after `toUserView`: x toward the user's right, y down, z away
 * from the camera (toward the user).
 */

import {
  CURLED_MIN,
  EXTENDED_MAX,
  FULL_CURL_DEG,
  PULL_ABOVE,
  PUSH_BELOW,
  THUMB_OUT_MIN,
  TOGETHER_MAX_DEG,
  TWIST_DEAD_DEG,
  TWIST_FULL_DEG,
} from './constants';
import { FINGER_MCP, LM, type Finger, type GestureConfig, type HandObservation, type Landmark } from './types';

type V = [number, number, number];
const DEG = 180 / Math.PI;

const v = (p: Landmark): V => [p.x, p.y, p.z];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: V): V => {
  const n = norm(a);
  return n > 1e-12 ? [a[0] / n, a[1] / n, a[2] / n] : [0, 0, 0];
};
const angleDeg = (a: V, b: V) => Math.atan2(norm(cross(a, b)), dot(a, b)) * DEG;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/**
 * Mirroring and handedness, in one place. An un-mirrored front-camera frame shows the user's right
 * hand on the image's left: with `mirrored`, x is flipped in both landmark sets so everything after
 * works in the user's (selfie) view. The Left/Right label is a separate question: MediaPipe Tasks
 * Vision 1.2.2 already reports the person's real hand on raw webcam frames, so it is kept unless
 * `swapHandedness` is set.
 */
export function toUserView(h: HandObservation, config: Pick<GestureConfig, 'mirrored' | 'swapHandedness'>): HandObservation {
  const handedness = config.swapHandedness ? (h.handedness === 'Left' ? 'Right' : 'Left') : h.handedness;
  if (!config.mirrored) return handedness === h.handedness ? h : { ...h, handedness };
  return {
    handedness,
    score: h.score,
    image: h.image.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })),
    world: h.world.map((p) => ({ x: -p.x, y: p.y, z: p.z })),
  };
}

/** Palm size: wrist to middle MCP, metres. */
export function palmSize(w: readonly Landmark[]): number {
  return norm(sub(v(w[LM.MIDDLE_MCP]!), v(w[LM.WRIST]!)));
}

/** Palm axis: wrist → middle MCP, unit (roughly along the forearm). */
export function palmAxis(w: readonly Landmark[]): V {
  return unit(sub(v(w[LM.MIDDLE_MCP]!), v(w[LM.WRIST]!)));
}

/**
 * Finger flexion, 0 straight … 1 fully curled: the mean of the bend angles at MCP (against the palm
 * axis), PIP and DIP, over FULL_CURL_DEG.
 */
export function flexion(w: readonly Landmark[], finger: Finger): number {
  const m = FINGER_MCP[finger];
  const p = [m, m + 1, m + 2, m + 3].map((i) => v(w[i]!));
  const seg = [sub(p[1]!, p[0]!), sub(p[2]!, p[1]!), sub(p[3]!, p[2]!)];
  const bends = [angleDeg(palmAxis(w), seg[0]!), angleDeg(seg[0]!, seg[1]!), angleDeg(seg[1]!, seg[2]!)];
  return clamp((bends[0]! + bends[1]! + bends[2]!) / 3 / FULL_CURL_DEG, 0, 1);
}

export function thumbOut(w: readonly Landmark[]): boolean {
  return norm(sub(v(w[LM.THUMB_TIP]!), v(w[LM.INDEX_MCP]!))) > THUMB_OUT_MIN * palmSize(w);
}

/** Index and middle proximal phalanges side by side. */
export function indexMiddleTogether(w: readonly Landmark[]): boolean {
  const idx = sub(v(w[6]!), v(w[5]!));
  const mid = sub(v(w[10]!), v(w[9]!));
  return angleDeg(idx, mid) <= TOGETHER_MAX_DEG;
}

/** Gun pose: ring and pinky curled, thumb up, index and middle together. Index/middle curl is free. */
export function isGun(w: readonly Landmark[]): boolean {
  return flexion(w, 'ring') > CURLED_MIN && flexion(w, 'pinky') > CURLED_MIN && thumbOut(w) && indexMiddleTogether(w);
}

/** Point pose: index extended; middle, ring and pinky curled. The thumb may be anywhere (it pinches). */
export function isPoint(w: readonly Landmark[]): boolean {
  return flexion(w, 'index') < EXTENDED_MAX && flexion(w, 'middle') > CURLED_MIN && flexion(w, 'ring') > CURLED_MIN && flexion(w, 'pinky') > CURLED_MIN;
}

/** Curl for push/pull: mean flexion of index and middle. */
export function curlOf(w: readonly Landmark[]): number {
  return (flexion(w, 'index') + flexion(w, 'middle')) / 2;
}

/** Push from curl: straight pushes, curled pulls, half-curled holds. −1..1. */
export function pushFromCurl(curl: number): number {
  if (curl < PUSH_BELOW) return clamp((PUSH_BELOW - curl) / PUSH_BELOW, -1, 1);
  if (curl > PULL_ABOVE) return clamp(-(curl - PULL_ABOVE) / (1 - PULL_ABOVE), -1, 1);
  return 0;
}

/** The knuckle line (index MCP → pinky MCP) projected perpendicular to the palm axis, unit. */
export function knuckleLine(w: readonly Landmark[]): V {
  const a = palmAxis(w);
  const k = sub(v(w[LM.PINKY_MCP]!), v(w[LM.INDEX_MCP]!));
  const d = dot(k, a);
  return unit([k[0] - d * a[0], k[1] - d * a[1], k[2] - d * a[2]]);
}

/**
 * Twist of the knuckle line from `neutral` around the palm axis, degrees in (−180, 180].
 * Sign: positive is a clockwise twist as the user sees it, looking along their fingers toward the
 * screen. (The user-view axes are left-handed, x right, y down, z toward the user, so the
 * right-hand-rule angle about the forward-pointing palm axis is negated.)
 */
export function twistDeg(w: readonly Landmark[], neutral: V): number {
  const a = palmAxis(w);
  const c = knuckleLine(w);
  return Math.atan2(-dot(a, cross(neutral, c)), dot(neutral, c)) * DEG;
}

/** Rotate from twist: ±TWIST_DEAD_DEG dead zone, linear to ±1 at ±TWIST_FULL_DEG. */
export function rotateFromTwist(deg: number): number {
  const m = Math.abs(deg);
  if (m <= TWIST_DEAD_DEG) return 0;
  return Math.sign(deg) * clamp((m - TWIST_DEAD_DEG) / (TWIST_FULL_DEG - TWIST_DEAD_DEG), 0, 1);
}

/** Pinch: thumb tip to index tip ÷ palm size. */
export function pinchRatio(w: readonly Landmark[]): number {
  return norm(sub(v(w[LM.THUMB_TIP]!), v(w[LM.INDEX_TIP]!))) / palmSize(w);
}

export type Vec = V;
