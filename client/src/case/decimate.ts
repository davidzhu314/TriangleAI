/**
 * Mesh decimation for the §3.5 mesh budget: vertex clustering on one grid shared by every vessel
 * mesh, so neighbouring vessels stay joined. The grid cell is the smallest size (by bisection) that
 * brings the total under the target. Deterministic. Runs in a Web Worker (decimate-client.ts).
 *
 * Clustering is cruder than quadric simplification, but it is short, has no dependency and never
 * fails; DECISIONS.md records the choice.
 */
import { GlbError, parseGlb, readTriMeshes, writeTriMeshes, type TriMesh } from './glb';

const BISECTION_STEPS = 24;
/** Smallest cell as a fraction of the bounding-box diagonal. */
const MIN_CELL_FRACTION = 1e-5;

type Box = { min: [number, number, number]; size: [number, number, number] };

function cluster(meshes: TriMesh[], { min, size }: Box, cell: number, countOnly: boolean) {
  // Grid dimensions; MIN_CELL_FRACTION keeps the cell key below 2^53.
  const dims: [number, number] = [Math.floor(size[0] / cell) + 1, Math.floor(size[1] / cell) + 1];
  let triangles = 0;
  const out: TriMesh[] = [];
  for (const m of meshes) {
    const ids = new Map<number, number>();
    const map = new Uint32Array(m.positions.length / 3);
    const sums: number[] = [];
    const counts: number[] = [];
    for (let v = 0; v < map.length; v++) {
      const x = m.positions[v * 3]!, y = m.positions[v * 3 + 1]!, z = m.positions[v * 3 + 2]!;
      const key = Math.floor((x - min[0]) / cell) + dims[0] * (Math.floor((y - min[1]) / cell) + dims[1] * Math.floor((z - min[2]) / cell));
      let id = ids.get(key);
      if (id === undefined) {
        id = counts.length;
        ids.set(key, id);
        counts.push(0);
        sums.push(0, 0, 0);
      }
      map[v] = id;
      if (!countOnly) {
        sums[id * 3] = sums[id * 3]! + x;
        sums[id * 3 + 1] = sums[id * 3 + 1]! + y;
        sums[id * 3 + 2] = sums[id * 3 + 2]! + z;
        counts[id] = counts[id]! + 1;
      }
    }
    // Drop degenerate triangles and duplicates (two faces collapsed onto the same three clusters).
    const k = counts.length;
    const numericKeys = k * k * k < Number.MAX_SAFE_INTEGER;
    const seen = new Set<number | string>();
    const kept: number[] = [];
    for (let t = 0; t < m.indices.length; t += 3) {
      const a = map[m.indices[t]!]!, b = map[m.indices[t + 1]!]!, c = map[m.indices[t + 2]!]!;
      if (a === b || b === c || a === c) continue;
      const lo = Math.min(a, b, c), hi = Math.max(a, b, c), mid = a + b + c - lo - hi;
      const key = numericKeys ? (lo * k + mid) * k + hi : `${lo},${mid},${hi}`;
      if (seen.has(key)) continue;
      seen.add(key);
      kept.push(a, b, c);
    }
    triangles += kept.length / 3;
    if (!countOnly) {
      // Drop clusters no kept triangle uses, then renumber.
      const used = new Int32Array(counts.length).fill(-1);
      const positions: number[] = [];
      const indices = kept.map((id) => {
        if (used[id] === -1) {
          used[id] = positions.length / 3;
          positions.push(sums[id * 3]! / counts[id]!, sums[id * 3 + 1]! / counts[id]!, sums[id * 3 + 2]! / counts[id]!);
        }
        return used[id]!;
      });
      out.push({ ...m, positions: Float32Array.from(positions), indices: Uint32Array.from(indices) });
    }
  }
  return { triangles, meshes: out };
}

/** Decimate a GLB to at most `targetTriangles`. Keeps node names and transforms. Throws GlbError. */
export function decimateGlb(glbBytes: Uint8Array, targetTriangles: number): Uint8Array {
  const glb = parseGlb(glbBytes);
  const meshes = readTriMeshes(glb);
  const total = meshes.reduce((s, m) => s + m.indices.length / 3, 0);
  if (total <= targetTriangles) return glbBytes;

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes) {
    for (let i = 0; i < m.positions.length; i++) {
      const a = i % 3;
      min[a] = Math.min(min[a]!, m.positions[i]!);
      max[a] = Math.max(max[a]!, m.positions[i]!);
    }
  }
  const box: Box = { min, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
  const diag = Math.hypot(...box.size);
  if (!(diag > 0)) throw new GlbError('the mesh has no extent');

  // Bisect on cell size: `hi` always meets the target.
  let lo = diag * MIN_CELL_FRACTION;
  let hi = diag;
  if (cluster(meshes, box, hi, true).triangles > targetTriangles) throw new GlbError('the mesh cannot be reduced to the budget');
  for (let i = 0; i < BISECTION_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (cluster(meshes, box, mid, true).triangles <= targetTriangles) hi = mid;
    else lo = mid;
  }
  const { meshes: reduced } = cluster(meshes, box, hi, false);
  const asset = { ...(glb.json['asset'] ?? {}), generator: 'threadsim client/src/case/decimate.ts' };
  return writeTriMeshes(reduced, asset);
}
