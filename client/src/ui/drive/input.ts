/**
 * Drive controls (spec §5.4) → the contract's ControlInput. Pure: no DOM, no clock.
 *
 * | Input    | Push/pull   | Rotate        | Fluoro (hold)  | Contrast puff |
 * | Keyboard | W / S       | A / D         | Space          | C             |
 * | Gamepad  | Left stick Y| Right stick X | Right trigger  | A button      |
 *
 * Sticks get the contract's 0.15 dead zone, rescaled so the stick still reaches ±1. Fluoro is hold-to-activate;
 * a contrast puff is true on one frame only. The on-screen buttons feed the same held set as the keyboard.
 */
import { STICK_DEAD_ZONE, type ControlInput } from '../../contracts';

export type Held = ReadonlySet<'push' | 'pull' | 'left' | 'right' | 'fluoro'>;

export const KEY_BINDINGS: Readonly<Record<string, 'push' | 'pull' | 'left' | 'right' | 'fluoro' | 'puff'>> = {
  KeyW: 'push',
  KeyS: 'pull',
  KeyA: 'left',
  KeyD: 'right',
  Space: 'fluoro',
  KeyC: 'puff',
};

/** A stick axis with the dead zone applied: 0 inside it, rescaled to reach ±1 outside it. */
export function deadZone(v: number, zone = STICK_DEAD_ZONE): number {
  if (!Number.isFinite(v) || Math.abs(v) <= zone) return 0;
  const out = (Math.abs(v) - zone) / (1 - zone);
  return Math.sign(v) * Math.min(1, out);
}

export interface PadSnapshot {
  axes: readonly number[];
  /** Button values 0..1 (standard mapping: 0 = A, 7 = right trigger). */
  buttons: readonly number[];
}

/** Shift with A or D twists at this share of full speed: fine aiming into a narrow branch opening. */
export const FINE_TWIST = 0.25;

/**
 * One frame of control from held keys or buttons, an optional gamepad, and whether a puff was triggered. With
 * `fine` (Shift held), the keys' twist runs at FINE_TWIST of full speed; the gamepad's stick is analogue already.
 */
export function controlFrame(held: Held, pad: PadSnapshot | null, puff: boolean, fine = false): ControlInput {
  const keysPush = (held.has('push') ? 1 : 0) - (held.has('pull') ? 1 : 0);
  const keysRotate = ((held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0)) * (fine ? FINE_TWIST : 1);
  // Standard gamepad: left stick Y is axis 1 (up is −1, so push is −axis); right stick X is axis 2.
  const padPush = pad ? -deadZone(pad.axes[1] ?? 0) : 0;
  const padRotate = pad ? deadZone(pad.axes[2] ?? 0) : 0;
  const pick = (a: number, b: number): number => (Math.abs(a) >= Math.abs(b) ? a : b);
  return {
    push: Math.max(-1, Math.min(1, pick(keysPush, padPush))),
    rotate: Math.max(-1, Math.min(1, pick(keysRotate, padRotate))),
    fluoro: held.has('fluoro') || (pad?.buttons[7] ?? 0) > 0.5,
    contrastPuff: puff,
  };
}

/** A gamepad's A button pressed this frame and not the last: one puff per press. */
export function padPuff(prev: PadSnapshot | null, next: PadSnapshot | null): boolean {
  return (next?.buttons[0] ?? 0) > 0.5 && (prev?.buttons[0] ?? 0) <= 0.5;
}
