/**
 * Gesture thresholds. ILLUSTRATIVE: first values, tuned on synthetic hands and on a real webcam in
 * the local lab (DECISIONS.md, "Hand gesture constants", "Hand gesture robustness"). Flexion is 0
 * (straight) … 1 (fully curled); distances are relative to palm size (wrist → middle MCP).
 *
 * Each pose has two levels: ENTER (strict, to start the pose) and STAY (loose, to keep it once
 * engaged), so tracking noise and twisting the hand don't drop the pose.
 */

/** Mean bend over a finger's MCP, PIP and DIP joints that counts as fully curled, degrees. */
export const FULL_CURL_DEG = 90;

export interface GunLimits {
  /** Ring and pinky flexion must be above this (they hold the "grip"). */
  gripCurlMin: number;
  /** Thumb tip to index MCP, ÷ palm size, must be above this (thumb up, on top). */
  thumbUpMin: number;
  /** Index and middle proximal phalanges must be within this angle (one "barrel"), degrees. */
  barrelGapMaxDeg: number;
}

export const GUN: Readonly<{ enter: GunLimits; stay: GunLimits }> = {
  enter: { gripCurlMin: 0.5, thumbUpMin: 0.4, barrelGapMaxDeg: 30 },
  // tuned on a real clip: twisting and aiming loosen ring and pinky to 0.2–0.3, open the barrel to
  // ~53° and lower the thumb to ~0.25 at a 90° twist
  stay: { gripCurlMin: 0.2, thumbUpMin: 0.2, barrelGapMaxDeg: 55 },
};

export interface PointLimits {
  /** Index flexion must be at most this (extended). Not checked while pinching at the STAY level. */
  indexCurlMax: number;
  /** Middle, ring and pinky flexion must be above this (curled). */
  othersCurlMin: number;
}

export const POINT: Readonly<{ enter: PointLimits; stay: PointLimits }> = {
  // a real pointing index reads ~0.34 curl, and ~0.5 while pinching (it bends to meet the thumb)
  enter: { indexCurlMax: 0.45, othersCurlMin: 0.45 },
  stay: { indexCurlMax: 0.6, othersCurlMin: 0.3 },
};

export interface PanLimits {
  /** Index, middle, ring and pinky flexion must all be above this: a fist. */
  fingersCurlMin: number;
  /** Thumb tip to index MCP, ÷ palm size, must be at most this: the thumb tucked, not up as in the gun. */
  thumbUpMax: number;
}

/**
 * The pan pose, "grab and drag": a fist, thumb tucked. Move the fist and the view follows (in 3D it turns).
 * Vaibhav's call after trying the V: the easiest shape to make, and far from the point (index out).
 * The gun pulling also curls the fingers, so the THUMB tells them apart: the gun starts with the thumb up
 * (GUN.enter.thumbUpMin 0.4) and an engaged gun keeps its pull while the thumb stays above GUN.stay (0.2);
 * a fist pan starts only with the thumb tucked (at most 0.35; a synthetic fist reads 0.13, a gun 0.96).
 * Illustrative and untuned on a real hand (DECISIONS.md, "Pan: a fist, thumb tucked").
 */
export const PAN: Readonly<{ enter: PanLimits; stay: PanLimits }> = {
  enter: { fingersCurlMin: 0.6, thumbUpMax: 0.35 },
  stay: { fingersCurlMin: 0.45, thumbUpMax: 0.5 },
};

/** Pan: view movement per unit of hand movement (both in screen widths), and a per-frame dead zone. */
export const PAN_GAIN = 1.5;
export const PAN_DEADZONE = 0.002;

/**
 * Push and pull from curl (mean of index and middle flexion). Relaxed "straight" fingers read about
 * 0.2 on a real webcam, so full push starts just above that:
 *   curl ≤ PUSH_FULL_AT → push 1;  … PUSH_BELOW → 0 (linear);  PUSH_BELOW … PULL_ABOVE → hold (0);
 *   PULL_ABOVE … PULL_FULL_AT → 0 … −1 (linear);  ≥ PULL_FULL_AT → −1.
 */
export const PUSH_FULL_AT = 0.25;
export const PUSH_BELOW = 0.35;
export const PULL_ABOVE = 0.55;
export const PULL_FULL_AT = 0.85;

/** Twist: dead zone and saturation, degrees from the neutral captured after engaging. */
export const TWIST_DEAD_DEG = 10;
export const TWIST_FULL_DEG = 45;
/** Neutral twist is captured over this long after engaging, ms (rotate is 0 meanwhile). */
export const NEUTRAL_CAPTURE_MS = 300;

/** Pinch (thumb tip to index tip ÷ palm size): enters below, exits above (hysteresis). */
export const PINCH_ENTER = 0.25;
export const PINCH_EXIT = 0.35;
/** On a pinch, the pointer freezes where it was this long before, ms (pinching drags the fingertip). */
export const PINCH_FREEZE_BACK_MS = 100;

/** A pose must hold this long (at ENTER level) before its status becomes active, ms. */
export const DEBOUNCE_MS = 150;
/**
 * An engaged pose that fails a STAY check other than the thumb stays engaged this long before it
 * drops, ms (one noisy frame is not a release). Lost tracking, a low score or a dropped thumb
 * release at once.
 */
export const RELEASE_GRACE_MS = 250;
/** Hands scored below this are treated as lost. */
export const MIN_SCORE = 0.6;

/** One-Euro filter (Casiez et al. 2012) settings per signal. */
export const ONE_EURO = {
  curl: { minCutoff: 1.5, beta: 0.5, dCutoff: 1 },
  twist: { minCutoff: 1.5, beta: 0.02, dCutoff: 1 },
  pointer: { minCutoff: 1, beta: 5, dCutoff: 1 },
  pan: { minCutoff: 1, beta: 5, dCutoff: 1 },
} as const;
