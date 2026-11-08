/**
 * Hand-tracking types, shaped like MediaPipe Tasks Vision HandLandmarker output but declared here, so
 * this folder imports nothing from MediaPipe (the dependency is not installed yet).
 *
 * Landmark indices (MediaPipe's 21-point hand): 0 wrist; 1–4 thumb (CMC, MCP, IP, tip); 5–8 index
 * (MCP, PIP, DIP, tip); 9–12 middle; 13–16 ring; 17–20 pinky.
 */

/** Image landmarks: x, y normalised 0..1 (y down). World landmarks: metres, hand-centred. */
export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface HandObservation {
  /** As MediaPipe reports it. Tasks Vision 1.2.2 on a raw webcam frame reports the person's real hand (see GestureConfig.swapHandedness). */
  handedness: 'Left' | 'Right';
  /** 0..1 */
  score: number;
  /** 21 points. */
  image: Landmark[];
  /** 21 points, metres, hand-centred. */
  world: Landmark[];
}

/** One video frame's hands. tMs comes from the video frame's timestamp, never from a clock. */
export interface HandFrame {
  tMs: number;
  hands: HandObservation[];
}

export type HandStatus = 'none' | 'lost' | 'gun' | 'point' | 'pan';

/** What one hand is doing. */
export interface HandOutput {
  status: HandStatus;
  /** −1..1 each; null when not engaged in the gun pose. */
  control: { push: number; rotate: number } | null;
  /** 0..1 screen coordinates in the user's view (already un-mirrored); null unless pointing. */
  pointer: { x: number; y: number } | null;
  /** True on the single frame a pinch-select fires. */
  select: boolean;
  /**
   * This frame's view movement, trackpad-style, in screen widths (x right, y down, user's view): move the
   * view (or page) by it. Null unless panning; 0, 0 on the first frame of a pan. `roll` (pinch-grab only):
   * this frame's twist of the pinching hand, in half-turns (1 = 180°), positive clockwise as seen.
   */
  pan: { dx: number; dy: number; roll?: number } | null;
  debug: { curl?: number; twistDeg?: number; pinch?: number };
}

/**
 * Both hands together. Either hand can do any gesture; the top-level fields combine them:
 * control, pointer and status come from the dominant hand when it's engaged, else the other hand;
 * select fires if either hand pinches; pan is the mean of the hands that are panning.
 */
export interface GestureOutput {
  status: HandStatus;
  /** −1..1 each; null when not engaged in the gun pose. */
  control: { push: number; rotate: number } | null;
  /** 0..1 screen coordinates in the user's view (already un-mirrored); null unless pointing. */
  pointer: { x: number; y: number } | null;
  /** True on the single frame a pinch-select fires. */
  select: boolean;
  /** View movement this frame (see HandOutput.pan); null unless a hand is panning. Pinch-grab rolls add up. */
  pan: { dx: number; dy: number; roll?: number } | null;
  debug: { curl?: number; twistDeg?: number; pinch?: number };
  /** Each hand on its own. */
  hands: { Left: HandOutput; Right: HandOutput };
}

export interface GestureConfig {
  /** Which hand wins when both are engaged in the same kind of output (both drive, or both point). */
  dominant: 'Right' | 'Left';
  /**
   * True when frames come from an un-mirrored front camera (MediaPipe's default input): x is
   * flipped once, in `toUserView`, so the pointer and poses work in the user's (selfie) view.
   */
  mirrored: boolean;
  /**
   * Swap MediaPipe's Left/Right label. Default false: tested with Tasks Vision 1.2.2 on a raw webcam,
   * the label already names the person's real hand (DECISIONS.md, "Hand labels"). Set it only for a
   * MediaPipe build or camera path that reports the opposite hand.
   */
  swapHandedness?: boolean;
}

export const LM = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  RING_MCP: 13,
  PINKY_MCP: 17,
} as const;

/** MCP index of each long finger. */
export const FINGER_MCP = { index: 5, middle: 9, ring: 13, pinky: 17 } as const;
export type Finger = keyof typeof FINGER_MCP;
