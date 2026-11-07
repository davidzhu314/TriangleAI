/**
 * Sweep a circle of varying radius along a centerline polyline (spec §3.4). Open-ended tube,
 * rotation-minimising frames, 16 sides. No Math.sin/cos: the ring uses exact constants so
 * output is byte-identical across Node versions.
 */
import type { Vec3 } from '../../client/src/contracts/events';

const C1 = 0.9238795325112867; // cos 22.5°
const C2 = 0.7071067811865476; // cos 45°
const C3 = 0.3826834323650898; // cos 67.5°
/** cos and sin of k·22.5°, k = 0..15. */
const RING: readonly (readonly [number, number])[] = [
  [1, 0], [C1, C3], [C2, C2], [C3, C1], [0, 1], [-C3, C1], [-C2, C2], [-C1, C3],
  [-1, 0], [-C1, -C3], [-C2, -C2], [-C3, -C1], [0, -1], [C3, -C1], [C2, -C2], [C1, -C3],
];
export const TUBE_SIDES = RING.length;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => {
  const l = Math.sqrt(dot(a, a));
  return [a[0] / l, a[1] / l, a[2] / l];
};

export interface TubeGeometry {
  positions: number[];
  normals: number[];
  indices: number[];
}

/** Append a tube along `points` with per-point `radii` to `out`. */
export function appendTube(out: TubeGeometry, points: Vec3[], radii: number[]): void {
  const n = points.length;
  if (n < 2) throw new Error('tube needs at least two points');
  const tangents = points.map((_, i) => norm(sub(points[Math.min(i + 1, n - 1)]!, points[Math.max(i - 1, 0)]!)));
  const t0 = tangents[0]!;
  const ref: Vec3 = Math.abs(t0[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  let normal = norm(cross(cross(t0, ref), t0));
  const base = out.positions.length / 3;

  for (let i = 0; i < n; i++) {
    const t = tangents[i]!;
    const d = dot(normal, t);
    normal = norm([normal[0] - d * t[0], normal[1] - d * t[1], normal[2] - d * t[2]]);
    const bin = cross(t, normal);
    const p = points[i]!;
    const r = radii[i]!;
    for (const [c, s] of RING) {
      const dir: Vec3 = [c * normal[0] + s * bin[0], c * normal[1] + s * bin[1], c * normal[2] + s * bin[2]];
      out.positions.push(p[0] + r * dir[0], p[1] + r * dir[1], p[2] + r * dir[2]);
      out.normals.push(dir[0], dir[1], dir[2]);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < TUBE_SIDES; k++) {
      const a = base + i * TUBE_SIDES + k;
      const b = base + i * TUBE_SIDES + ((k + 1) % TUBE_SIDES);
      const c = a + TUBE_SIDES;
      const e = b + TUBE_SIDES;
      out.indices.push(a, b, c, b, e, c); // counter-clockwise seen from outside
    }
  }
}
