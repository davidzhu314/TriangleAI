/** 3×3 rotations and poses for the device model (row-major, columns are axes). */
import { add, cross, unit, type V3 } from '../geometry';
import type { M3, Pose } from './types';

export const I3: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function m3mul(a: M3, b: M3): M3 {
  const o = new Array<number>(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[3 * i + j] = a[3 * i]! * b[j]! + a[3 * i + 1]! * b[3 + j]! + a[3 * i + 2]! * b[6 + j]!;
  return o;
}

export const m3v = (m: M3, v: V3): V3 => [m[0]! * v[0] + m[1]! * v[1] + m[2]! * v[2], m[3]! * v[0] + m[4]! * v[1] + m[5]! * v[2], m[6]! * v[0] + m[7]! * v[1] + m[8]! * v[2]];

export const column = (m: M3, c: 0 | 1 | 2): V3 => [m[c]!, m[3 + c]!, m[6 + c]!];

export const rotZ = (a: number): M3 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};

export const rotY = (a: number): M3 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
};

/** A frame whose z axis is `dir`, with x chosen the same way every time (no roll ambiguity between runs). */
export function frameAlong(dir: V3): M3 {
  const z = unit(dir);
  const t: V3 = Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const y = unit(cross(z, t));
  const x = cross(y, z);
  return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
}

/** Compose: a child pose given in its parent's frame. */
export const compose = (parent: Pose, local: Pose): Pose => ({ p: add(parent.p, m3v(parent.R, local.p)), R: m3mul(parent.R, local.R) });
