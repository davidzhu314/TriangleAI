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
  /** As MediaPipe reports it (it assumes a mirrored image; see GestureConfig.mirrored). */
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

export type HandStatus = 'none' | 'lost' | 'gun' | 'point';

export interface GestureOutput {
  status: HandStatus;
  /** −1..1 each; null when not engaged in the gun pose. */
  control: { push: number; rotate: number } | null;
  /** 0..1 screen coordinates in the user's view (already un-mirrored); null unless pointing. */
  pointer: { x: number; y: number } | null;
  /** True on the single frame a pinch-select fires. */
  select: boolean;
  debug: { curl?: number; twistDeg?: number; pinch?: number };
}

export interface GestureConfig {
  /** Which hand drives. */
  dominant: 'Right' | 'Left';
  /**
   * True when frames come from an un-mirrored front camera (MediaPipe's default input): x and
   * handedness are flipped once, in `toUserView`, so everything after works in the user's view.
   */
  mirrored: boolean;
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
