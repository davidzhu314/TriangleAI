/**
 * Gesture thresholds. ILLUSTRATIVE: first values, tuned on synthetic hands and to be re-tuned on real
 * hands in the local webcam lab (DECISIONS.md, "Hand gesture constants"). Flexion is 0 (straight) … 1
 * (fully curled); distances are relative to palm size (wrist → middle MCP).
 */

/** Mean bend over a finger's MCP, PIP and DIP joints that counts as fully curled, degrees. */
export const FULL_CURL_DEG = 90;

/** Ring and pinky flexion above this count as curled (gun pose, point pose). */
export const CURLED_MIN = 0.6;
/** Index flexion below this counts as extended (point pose). */
export const EXTENDED_MAX = 0.3;
/** Gun pose: thumb tip to index MCP above this × palm size means the thumb is up. */
export const THUMB_OUT_MIN = 0.5;
/** Gun pose: index and middle proximal phalanges within this angle count as together, degrees. */
export const TOGETHER_MAX_DEG = 15;

/** Curl (mean of index and middle flexion): below PUSH_BELOW pushes, above PULL_ABOVE pulls, between holds. */
export const PUSH_BELOW = 0.3;
export const PULL_ABOVE = 0.55;

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

/** A pose must hold this long before its status becomes active, ms. */
export const DEBOUNCE_MS = 150;
/** Hands scored below this are treated as lost. */
export const MIN_SCORE = 0.6;

/** One-Euro filter (Casiez et al. 2012) settings per signal. */
export const ONE_EURO = {
  curl: { minCutoff: 1.5, beta: 0.5, dCutoff: 1 },
  twist: { minCutoff: 1.5, beta: 0.02, dCutoff: 1 },
  pointer: { minCutoff: 1, beta: 5, dCutoff: 1 },
} as const;
