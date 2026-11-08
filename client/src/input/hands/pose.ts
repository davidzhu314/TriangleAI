/**
 * Pose geometry on world landmarks (metres, hand-centred), so poses don't change as the hand moves
 * or rotates. Pure functions.
 *
 * Coordinates are in the user's view after `toUserView`: x toward the user's right, y down, z away
 * from the camera (toward the user).
 */

import { FULL_CURL_DEG, GUN, PINCH_EXIT, POINT, PULL_ABOVE, PULL_FULL_AT, PUSH_BELOW, PUSH_FULL_AT, TWIST_DEAD_DEG, TWIST_FULL_DEG } from './constants';
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

/** Thumb tip to index MCP, ÷ palm size: high when the thumb is up on top of the "gun". */
export function thumbUp(w: readonly Landmark[]): number {
  return norm(sub(v(w[LM.THUMB_TIP]!), v(w[LM.INDEX_MCP]!))) / palmSize(w);
}

/** Angle between the index and middle proximal phalanges, degrees: small when they form one barrel. */
export function barrelGapDeg(w: readonly Landmark[]): number {
  return angleDeg(sub(v(w[6]!), v(w[5]!)), sub(v(w[10]!), v(w[9]!)));
}

/** One named pose check, as the tests and the lab's diagnostic panel show it. */
export interface PoseCheck {
  name: 'ring curl' | 'pinky curl' | 'thumb up' | 'barrel gap' | 'index straight' | 'middle curl';
  value: number;
  /** `value` must be above `min`, or at most `max`. */
  min?: number;
  max?: number;
  ok: boolean;
}

export type PoseLevel = 'enter' | 'stay';

const above = (name: PoseCheck['name'], value: number, min: number): PoseCheck => ({ name, value, min, ok: value > min });
const atMost = (name: PoseCheck['name'], value: number, max: number): PoseCheck => ({ name, value, max, ok: value <= max });

/**
 * The gun pose, check by check: ring and pinky curled (the grip), thumb up on top, index and middle
 * together (the barrel). How curled the barrel is does not matter, so pulling never breaks the pose.
 */
export function gunChecks(w: readonly Landmark[], level: PoseLevel = 'enter'): PoseCheck[] {
  const lim = GUN[level];
  return [
    above('ring curl', flexion(w, 'ring'), lim.gripCurlMin),
    above('pinky curl', flexion(w, 'pinky'), lim.gripCurlMin),
    above('thumb up', thumbUp(w), lim.thumbUpMin),
    atMost('barrel gap', barrelGapDeg(w), lim.barrelGapMaxDeg),
  ];
}

/**
 * The point pose, check by check: index extended; middle, ring and pinky curled. The thumb is free
 * (it pinches). While keeping the pose, the index check is waived when `pinch` (pinchRatio of the
 * image landmarks) says the thumb is at the fingertip: a real index bends to meet the thumb, and that
 * must not drop the pose mid-pinch.
 */
export function pointChecks(w: readonly Landmark[], level: PoseLevel = 'enter', pinch = Infinity): PoseCheck[] {
  const lim = POINT[level];
  const index = atMost('index straight', flexion(w, 'index'), lim.indexCurlMax);
  if (level === 'stay' && !index.ok && pinch < PINCH_EXIT) index.ok = true;
  return [
    index,
    above('middle curl', flexion(w, 'middle'), lim.othersCurlMin),
    above('ring curl', flexion(w, 'ring'), lim.othersCurlMin),
    above('pinky curl', flexion(w, 'pinky'), lim.othersCurlMin),
  ];
}

export const allOk = (checks: readonly PoseCheck[]): boolean => checks.every((c) => c.ok);
export const isGun = (w: readonly Landmark[], level: PoseLevel = 'enter'): boolean => allOk(gunChecks(w, level));
export const isPoint = (w: readonly Landmark[], level: PoseLevel = 'enter', pinch = Infinity): boolean => allOk(pointChecks(w, level, pinch));
/** The thumb is still up enough to keep the gun (failing this releases at once). */
export const thumbStillUp = (w: readonly Landmark[]): boolean => thumbUp(w) > GUN.stay.thumbUpMin;

/** Curl for push/pull: mean flexion of index and middle. */
export function curlOf(w: readonly Landmark[]): number {
  return (flexion(w, 'index') + flexion(w, 'middle')) / 2;
}

/** Push from curl: straight pushes, half-curled holds, curled pulls. −1..1 (zones in constants.ts). */
export function pushFromCurl(curl: number): number {
  if (curl < PUSH_BELOW) return clamp((PUSH_BELOW - curl) / (PUSH_BELOW - PUSH_FULL_AT), 0, 1);
  if (curl > PULL_ABOVE) return -clamp((curl - PULL_ABOVE) / (PULL_FULL_AT - PULL_ABOVE), 0, 1);
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

/**
 * Pinch, on IMAGE landmarks: the 2D thumb-tip to index-tip distance, ÷ the larger of the 2D palm length
 * (wrist → middle MCP) and the 2D knuckle width (index MCP → pinky MCP). 2D, because the tracker's depth
 * is poorest exactly when the thumb tip hides behind the fingertip: on a real clip the 3D distance saw
 * 1 of 8 pinches, this saw all 8. The larger of two normalisers stays steady when the hand points at
 * the camera (the palm length foreshortens, the knuckle width doesn't).
 */
export function pinchRatio(image: readonly Landmark[]): number {
  const d2 = (a: number, b: number) => Math.hypot(image[a]!.x - image[b]!.x, image[a]!.y - image[b]!.y);
  const scale = Math.max(d2(LM.WRIST, LM.MIDDLE_MCP), d2(LM.INDEX_MCP, LM.PINKY_MCP));
  return scale > 0 ? d2(LM.THUMB_TIP, LM.INDEX_TIP) / scale : Infinity;
}

export type Vec = V;
