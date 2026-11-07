/**
 * Gesture → the existing ControlInput (no contract change). Push and rotate come from the gesture
 * while it is engaged, but any non-zero keyboard axis wins on that axis; fluoro and contrast always
 * come from the keyboard (Space and C). With no gesture engaged the keyboard passes through.
 */

import type { ControlInput } from '../../contracts';
import type { GestureOutput } from './types';

export function mergeControl(g: GestureOutput, keyboard: ControlInput): ControlInput {
  if (!g.control) return { ...keyboard };
  return {
    push: keyboard.push !== 0 ? keyboard.push : g.control.push,
    rotate: keyboard.rotate !== 0 ? keyboard.rotate : g.control.rotate,
    fluoro: keyboard.fluoro,
    contrastPuff: keyboard.contrastPuff,
  };
}
