/**
 * Setting the catheter tip to an angle, precisely: the trainee states the angle (typed, nudged with [ and ], or set by
 * the hand in angle mode) and Drive turns the wire there and stops, through the same `rotate` control the keys use.
 * Pure: no DOM, unit-tested. The angle is the tip's twist as the readout shows it, 0..359.
 */

/** A signed difference of two angles, −180..180: how far, and which way, to turn from `from` to `to`. */
export const angleDiff = (from: number, to: number): number => ((((to - from) % 360) + 540) % 360) - 180;

/** An angle folded into 0..359. */
export const fold = (deg: number): number => ((deg % 360) + 360) % 360;

/** Within this, the tip is at the angle, degrees. */
export const AIM_DONE_DEG = 0.5;
/** Full twist speed when further than this from the angle; slower as it closes in, degrees. */
export const AIM_SLOW_DEG = 30;

/** The rotate control (−1..1) that turns the tip from `current` toward `target`; 0 once there. */
export function aimRotate(current: number, target: number): number {
  const err = angleDiff(current, target);
  if (Math.abs(err) <= AIM_DONE_DEG) return 0;
  return Math.max(-1, Math.min(1, err / AIM_SLOW_DEG));
}

/**
 * Hand angle mode: the tip angle the hand asks for. From the tip's angle when the gun pose started (`anchor`), the
 * hand's twist from its own start, scaled down (`scale` 0.5: 10° of hand is 5° of tip) for small changes.
 */
export const HAND_ANGLE_SCALE = 0.5;
export function handAngleTarget(anchor: number, handTwistDeg: number, scale = HAND_ANGLE_SCALE): number {
  return fold(anchor + handTwistDeg * scale);
}

/** A typed angle, if it is one: a number, folded into 0..359; null for anything else. */
export function parseAngle(text: string): number | null {
  const t = text.trim().replace(/°$/, '');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return fold(Math.round(Number(t)));
}
