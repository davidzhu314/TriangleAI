/**
 * The pure parts of AR mode (A7, spec §7.2), kept apart so they are unit-tested without a headset.
 */

/** Spec §7.2: place the model at 50% scale, configurable to 1:1. */
export const AR_SCALES = { half: 0.5, full: 1 } as const;
export type ArScale = keyof typeof AR_SCALES;

/** Spec A7: 72 fps or better; past 14 ms a frame, swap in the simplified meshes. */
export const FRAME_BUDGET_MS = 14;
export const TARGET_FPS = 72;

/**
 * A rolling frame-time check. It trips once the mean of the last `window` frames is over budget, and stays tripped:
 * flipping meshes back and forth would cost more frames than it saves.
 */
export class FrameBudget {
  private readonly times: number[] = [];
  private tripped = false;
  constructor(
    private readonly budgetMs = FRAME_BUDGET_MS,
    private readonly window = 30,
  ) {}

  /** Record one frame's time; returns true on the frame the budget trips. */
  record(dtMs: number): boolean {
    if (this.tripped || !(dtMs > 0)) return false;
    this.times.push(dtMs);
    if (this.times.length > this.window) this.times.shift();
    if (this.times.length < this.window) return false;
    const mean = this.times.reduce((a, b) => a + b, 0) / this.times.length;
    if (mean > this.budgetMs) {
      this.tripped = true;
      return true;
    }
    return false;
  }

  get over(): boolean {
    return this.tripped;
  }
}

type P = readonly [number, number, number];

/**
 * Two-hand scale and turn (spec §7.2: "two-hand pinch or both grips to scale and rotate"). From the two hands'
 * positions at the start of the gesture and now: the scale factor is the ratio of their distances, and the turn
 * is the change of the line between them around the vertical axis. Clamped so a glitchy frame can't throw the
 * model away.
 */
export function twoHand(startA: P, startB: P, nowA: P, nowB: P): { scale: number; yaw: number } {
  const d0 = Math.hypot(startB[0] - startA[0], startB[1] - startA[1], startB[2] - startA[2]);
  const d1 = Math.hypot(nowB[0] - nowA[0], nowB[1] - nowA[1], nowB[2] - nowA[2]);
  const scale = d0 > 1e-4 ? Math.min(8, Math.max(0.125, d1 / d0)) : 1;
  const a0 = Math.atan2(startB[2] - startA[2], startB[0] - startA[0]);
  const a1 = Math.atan2(nowB[2] - nowA[2], nowB[0] - nowA[0]);
  let yaw = a0 - a1;
  while (yaw > Math.PI) yaw -= 2 * Math.PI;
  while (yaw < -Math.PI) yaw += 2 * Math.PI;
  return { scale, yaw };
}

/**
 * An XR controller's gamepad (xr-standard mapping) as the Drive screen's standard-gamepad snapshot: thumbstick
 * forward pushes (axis 1, up is negative), thumbstick sideways rotates (axis 2), the trigger holds fluoro (button 7)
 * and the A/X face button puffs contrast (button 0).
 */
export function xrPad(axes: readonly number[], buttons: readonly number[]): { axes: number[]; buttons: number[] } {
  const stickX = axes[2] ?? 0;
  const stickY = axes[3] ?? 0;
  const trigger = buttons[0] ?? 0;
  const face = buttons[4] ?? 0;
  const out = new Array<number>(8).fill(0);
  out[0] = face;
  out[7] = trigger;
  return { axes: [0, stickY, stickX, 0], buttons: out };
}
