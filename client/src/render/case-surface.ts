/**
 * A smooth vessel surface for a generated case's card picture (case-thumb.ts). A generated case's vessels.glb is one
 * open 16-sided tube per edge, overlapping at the junctions; a CT case's mesh is one continuous segmented surface, where
 * branches flare into the aorta. This builds that kind of surface from the case's own centerlines and radii: a signed
 * distance to each tapered segment, joined with a small smooth union (a fillet of FILLET_M at every junction), then
 * polygonised with marching cubes. Nothing is invented: no shape, bulge or narrowing that the centerlines don't have.
 * Pictures only; the engine never sees it.
 */
import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import type { LoadedCase, Vec3 } from '../contracts';

/** Fillet radius of the smooth union at junctions, metres. */
export const FILLET_M = 0.0025;
/** The thinnest a vessel is drawn, in grid cells (radius), so the smallest arm arteries stay continuous. */
const MIN_CELLS = 0.85;
/** Centerline points closer than this along an edge are skipped (the surface doesn't need them), metres. */
const STEP_M = 0.0015;

/** A cube of `n`³ cells, centred at `centre`, `side` metres across: cell (i, j, k) sits at centre + (idx/(n/2) - 1)·side/2. */
export interface Grid {
  n: number;
  centre: Vec3;
  side: number;
}

/** Polynomial smooth minimum (Inigo Quilez): min(a, b) with a fillet of size k where the two are close. */
export function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
}

/**
 * Signed distance (metres, negative inside) from every cell of `grid` to the case's vessels, smooth-unioned. Each
 * segment between two kept centerline points is a capsule whose radius runs linearly between its ends. Cells far from
 * every vessel keep a large positive value. The cell order is three's MarchingCubes field order: x fastest, then y, z.
 */
export function vesselField(c: Pick<LoadedCase, 'edges'>, grid: Grid, field = new Float32Array(grid.n ** 3)): Float32Array {
  const { n, centre, side } = grid;
  field.fill(1);
  // One vessel at a time into `edge` (a plain minimum over its own segments, so a vessel keeps its exact radius), then a
  // smooth union of that vessel into `field` (the fillet is only where different vessels meet).
  const edge = new Float32Array(n ** 3);
  const half = n / 2;
  const cell = side / n;
  const toIndex = (v: number, axis: number): number => ((v - centre[axis]!) / (side / 2)) * half + half;
  const at = (i: number, axis: number): number => centre[axis]! + ((i - half) / half) * (side / 2);
  for (const e of c.edges) {
    // Keep points about STEP_M apart, always the ends.
    const pts: Vec3[] = [];
    const radii: number[] = [];
    e.points.forEach((p, i) => {
      const last = pts.at(-1);
      if (i === 0 || i === e.points.length - 1 || !last || Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]) >= STEP_M) {
        pts.push(p);
        // A vessel thinner than a cell would break into fragments: draw it at least MIN_CELLS cells wide.
        radii.push(Math.max(e.radiiM[i] ?? e.radiiM.at(-1) ?? 0.003, cell * MIN_CELLS));
      }
    });
    const segs: { a: Vec3; ab: Vec3; len2: number; ra: number; rb: number; lo: number[]; hi: number[] }[] = [];
    const lo = [n, n, n];
    const hi = [-1, -1, -1];
    for (let s = 0; s + 1 < pts.length; s++) {
      const a = pts[s]!;
      const b = pts[s + 1]!;
      const ra = radii[s]!;
      const rb = radii[s + 1]!;
      const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const reach = Math.max(ra, rb) + FILLET_M + cell;
      const sLo = [0, 1, 2].map((ax) => Math.max(1, Math.floor(toIndex(Math.min(a[ax]!, b[ax]!) - reach, ax))));
      const sHi = [0, 1, 2].map((ax) => Math.min(n - 2, Math.ceil(toIndex(Math.max(a[ax]!, b[ax]!) + reach, ax))));
      if (sLo.some((v, ax) => v > sHi[ax]!)) continue; // outside the grid
      segs.push({ a, ab, len2: ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1e-12, ra, rb, lo: sLo, hi: sHi });
      for (let ax = 0; ax < 3; ax++) {
        lo[ax] = Math.min(lo[ax]!, sLo[ax]!);
        hi[ax] = Math.max(hi[ax]!, sHi[ax]!);
      }
    }
    if (!segs.length) continue;
    for (let z = lo[2]!; z <= hi[2]!; z++) for (let y = lo[1]!; y <= hi[1]!; y++) edge.fill(1, (z * n + y) * n + lo[0]!, (z * n + y) * n + hi[0]! + 1);
    for (const { a, ab, len2, ra, rb, lo: sLo, hi: sHi } of segs) {
      for (let z = sLo[2]!; z <= sHi[2]!; z++) {
        const pz = at(z, 2);
        for (let y = sLo[1]!; y <= sHi[1]!; y++) {
          const py = at(y, 1);
          const row = (z * n + y) * n;
          for (let x = sLo[0]!; x <= sHi[0]!; x++) {
            const px = at(x, 0);
            const t = Math.min(1, Math.max(0, ((px - a[0]) * ab[0] + (py - a[1]) * ab[1] + (pz - a[2]) * ab[2]) / len2));
            const d = Math.hypot(px - (a[0] + ab[0] * t), py - (a[1] + ab[1] * t), pz - (a[2] + ab[2] * t)) - (ra + (rb - ra) * t);
            const q = row + x;
            if (d < edge[q]!) edge[q] = d;
          }
        }
      }
    }
    for (let z = lo[2]!; z <= hi[2]!; z++)
      for (let y = lo[1]!; y <= hi[1]!; y++) {
        const row = (z * n + y) * n;
        for (let x = lo[0]!; x <= hi[0]!; x++) field[row + x] = smin(field[row + x]!, edge[row + x]!, FILLET_M);
      }
  }
  return field;
}

/** The surface as a mesh in the case's world frame (metres, Y up), polygonised from vesselField. */
export function vesselSurface(c: LoadedCase, grid: Grid, material: THREE.Material): THREE.Mesh {
  const mc = new MarchingCubes(grid.n, material, false, false, 500_000);
  const sdf = vesselField(c, grid);
  // MarchingCubes treats field > isolation as inside, with the normal pointing toward lower values: use −distance.
  for (let i = 0; i < sdf.length; i++) mc.field[i] = -sdf[i]!;
  mc.isolation = 0;
  mc.update();
  mc.position.set(...grid.centre);
  mc.scale.setScalar(grid.side / 2);
  return mc;
}
