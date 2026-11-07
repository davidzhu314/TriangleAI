/**
 * Synthetic hands for the gesture tests: 21 image and world landmarks built from per-finger flexion,
 * thumb placement, roll, position and handedness. Tests only; no camera.
 *
 * Built in the user's view (x right, y down, z toward the user), with the fingers pointing at the
 * screen (−z), thumb up, index knuckle on top. `cameraFrame: true` returns what an un-mirrored front
 * camera would report instead (x flipped; MediaPipe Tasks still labels the real hand), for `mirrored: true` configs.
 */

import { FULL_CURL_DEG } from './constants';
import type { HandFrame, HandObservation, Landmark } from './types';

type V = [number, number, number];
type FingerName = 'index' | 'middle' | 'ring' | 'pinky';

export interface HandSpec {
  /** In the user's view. Default 'Right'. */
  handedness?: 'Left' | 'Right';
  /** 0 straight … 1 fully curled. Default 0 each. */
  flex?: Partial<Record<FingerName, number>>;
  /** 'out' (thumb up), 'folded' (across the palm), or a pinch: thumb tip this far from the index tip, ÷ palm size. */
  thumb?: 'out' | 'folded' | { pinch: number };
  /** Twist, clockwise as the user sees it, degrees. */
  rollDeg?: number;
  /** Where the hand points: yaw to the user's right (+) or left (−), pitch up (+) or down (−), degrees. 0, 0 = at the camera. */
  yawDeg?: number;
  pitchDeg?: number;
  /** Tracking jitter, mm (seeded, so tests stay deterministic). Depth is usually the noisiest. */
  noise?: { xyMm: number; zMm: number; seed: number };
  /** Index spread away from the middle finger, degrees. */
  spreadDeg?: number;
  /** Wrist position in the image, 0..1. */
  pos?: { x: number; y: number };
  /** Image units per metre (bigger = closer to the camera). */
  imageScale?: number;
  score?: number;
  cameraFrame?: boolean;
}

const add = (...vs: V[]): V => vs.reduce<V>((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], [0, 0, 0]);
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
const RAD = Math.PI / 180;

const F: V = [0, 0, -1]; // fingers toward the screen
const U: V = [0, -1, 0]; // thumb side (up)
const PALM_LEN = 0.08;
const KNUCKLE: Record<FingerName, number> = { index: 0.024, middle: 0.008, ring: -0.008, pinky: -0.024 };
const SEG = [0.045, 0.027, 0.02];
/** Bend split over MCP, PIP, DIP; the mean is FULL_CURL_DEG at flexion 1. */
const BEND = [FULL_CURL_DEG, FULL_CURL_DEG + 10, FULL_CURL_DEG - 10];

export function syntheticHand(spec: HandSpec = {}): HandObservation {
  const hand = spec.handedness ?? 'Right';
  const S: V = hand === 'Right' ? [-1, 0, 0] : [1, 0, 0]; // palm side: fingers curl this way
  const pts: V[] = new Array(21);
  pts[0] = [0, 0, 0];
  const fingers: FingerName[] = ['index', 'middle', 'ring', 'pinky'];
  fingers.forEach((name, k) => {
    const mcp = add(mul(F, PALM_LEN), mul(U, KNUCKLE[name]));
    const flex = spec.flex?.[name] ?? 0;
    const spread = name === 'index' ? (spec.spreadDeg ?? 0) * RAD : 0;
    const base = add(mul(F, Math.cos(spread)), mul(U, Math.sin(spread)));
    const i0 = 5 + 4 * k;
    pts[i0] = mcp;
    let p = mcp;
    let phi = 0;
    for (let j = 0; j < 3; j++) {
      phi += flex * BEND[j]! * RAD;
      const dir = add(mul(base, Math.cos(phi)), mul(S, Math.sin(phi)));
      p = add(p, mul(dir, SEG[j]!));
      pts[i0 + j + 1] = p;
    }
  });
  const palm = Math.hypot(...add(mul(F, PALM_LEN), mul(U, KNUCKLE.middle)));
  const cmc = add(mul(F, 0.02), mul(U, 0.02), mul(S, 0.01));
  let tip: V;
  const thumb = spec.thumb ?? 'out';
  if (thumb === 'out') tip = add(mul(F, 0.04), mul(U, 0.09));
  else if (thumb === 'folded') tip = add(mul(F, 0.07), mul(U, 0.015), mul(S, 0.02));
  else tip = add(pts[8]!, mul(U, thumb.pinch * palm));
  pts[1] = cmc;
  for (let j = 2; j <= 4; j++) pts[j] = add(cmc, mul(add(tip, mul(cmc, -1)), (j - 1) / 3));

  const c = Math.cos((spec.rollDeg ?? 0) * RAD);
  const s = Math.sin((spec.rollDeg ?? 0) * RAD);
  // clockwise on screen in a y-down frame
  const rolled: V[] = pts.map(([x, y, z]) => [x * c - y * s, x * s + y * c, z]);
  // then point the hand: pitch about x (up is −y), yaw about y (right is +x), fingers start at −z
  const cp = Math.cos((spec.pitchDeg ?? 0) * RAD);
  const sp = Math.sin((spec.pitchDeg ?? 0) * RAD);
  const cy = Math.cos((spec.yawDeg ?? 0) * RAD);
  const sy = Math.sin((spec.yawDeg ?? 0) * RAD);
  const aimed: V[] = rolled.map(([x, y, z]) => {
    const y1 = y * cp + z * sp;
    const z1 = -y * sp + z * cp;
    return [x * cy - z1 * sy, y1, x * sy + z1 * cy];
  });
  const jitter = spec.noise ? seeded(spec.noise.seed) : null;
  const world: Landmark[] = aimed.map(([x, y, z]) => {
    if (!jitter || !spec.noise) return { x, y, z };
    const j = () => (jitter() * 2 - 1) / 1000;
    return { x: x + j() * spec.noise.xyMm, y: y + j() * spec.noise.xyMm, z: z + j() * spec.noise.zMm };
  });
  const pos = spec.pos ?? { x: 0.5, y: 0.6 };
  const k = spec.imageScale ?? 2.5;
  const image: Landmark[] = world.map((p) => ({ x: pos.x + p.x * k, y: pos.y + p.y * k, z: p.z * k }));
  const obs: HandObservation = { handedness: hand, score: spec.score ?? 0.95, image, world };
  if (!spec.cameraFrame) return obs;
  return {
    handedness: hand,
    score: obs.score,
    image: image.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })),
    world: world.map((p) => ({ x: -p.x, y: p.y, z: p.z })),
  };
}

/** Deterministic PRNG (mulberry32) for jitter. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export const frame = (tMs: number, ...hands: HandObservation[]): HandFrame => ({ tMs, hands });

/** Gun pose with the given index/middle curl and twist. */
export const gun = (curl = 0.42, rollDeg = 0, extra: HandSpec = {}): HandObservation =>
  syntheticHand({ flex: { index: curl, middle: curl, ring: 1, pinky: 1 }, thumb: 'out', rollDeg, ...extra });

/** Point pose; `pinch` sets the thumb-to-index distance ÷ palm size (default: thumb folded). */
export const point = (extra: HandSpec = {}, pinch?: number): HandObservation =>
  syntheticHand({ flex: { index: 0, middle: 1, ring: 1, pinky: 1 }, thumb: pinch === undefined ? 'folded' : { pinch }, ...extra });

/** 30 Hz frame times. */
export const FRAME_MS = 1000 / 30;
