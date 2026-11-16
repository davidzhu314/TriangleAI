/**
 * How far a case's vessel mesh sits from the lumen its centerlines and radii describe, and what simplifying the
 * mesh does to that. (CathSim simplifies its meshes into convex hulls for collisions and does not report the
 * error; this is the same question for our meshes, which the views draw and the wire is shown inside.)
 *
 * Distances are signed: negative means the mesh surface is inside the lumen, so the vessel looks narrower.
 * Triangle centres are sampled as well as corners, because a flat triangle across a round wall cuts inside it.
 */
import { decimateGlb } from '../../case/decimate';
import { parseGlb, readTriMeshes, type TriMesh } from '../../case/glb';
import type { LoadedCase } from '../../contracts';
import { toScan, truthDistance, truthOf, type P3 } from './grid';

export interface MeshScore {
  triangles: number;
  /** Mean |distance| from the mesh surface to the lumen wall, mm. */
  meanAbsMm: number;
  p95AbsMm: number;
  maxAbsMm: number;
  /** Mean signed distance, mm: negative when the mesh is inside the lumen on average. */
  biasMm: number;
  /** Share of samples more than 1 mm inside the lumen, %: where the mesh makes a vessel look narrower. */
  insideOver1mmPct: number;
}

/** A point of the mesh file → the scan frame, through the node's own transform and the case's file-to-world map. */
function placer(mesh: TriMesh, toWorld: readonly number[]): (x: number, y: number, z: number) => P3 {
  const t = mesh.transform;
  const local = (x: number, y: number, z: number): P3 => {
    if (t.matrix) {
      const m = t.matrix;
      return [m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!];
    }
    if (t.rotation) throw new Error(`mesh node ${mesh.name} has a rotation; scoreMesh does not read those`);
    const s = t.scale ?? [1, 1, 1];
    const o = t.translation ?? [0, 0, 0];
    return [x * s[0]! + o[0]!, y * s[1]! + o[1]!, z * s[2]! + o[2]!];
  };
  return (x, y, z) => {
    const p = local(x, y, z);
    const m = toWorld;
    return toScan([m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!, m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!, m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!]);
  };
}

/** Score a GLB (the case's own, or a simplified copy) against the case's lumen. */
export function scoreMeshBytes(c: LoadedCase, glb: Uint8Array): MeshScore {
  const sdf = truthDistance(truthOf(c), 20);
  const d: number[] = [];
  let triangles = 0;
  for (const mesh of readTriMeshes(parseGlb(glb))) {
    const place = placer(mesh, c.mesh.toWorld);
    const pts: P3[] = [];
    for (let n = 0; n < mesh.positions.length; n += 3) {
      const p = place(mesh.positions[n]!, mesh.positions[n + 1]!, mesh.positions[n + 2]!);
      pts.push(p);
      d.push(sdf(p[0], p[1], p[2]));
    }
    for (let n = 0; n < mesh.indices.length; n += 3) {
      const a = pts[mesh.indices[n]!]!;
      const b = pts[mesh.indices[n + 1]!]!;
      const e = pts[mesh.indices[n + 2]!]!;
      d.push(sdf((a[0] + b[0] + e[0]) / 3, (a[1] + b[1] + e[1]) / 3, (a[2] + b[2] + e[2]) / 3));
      triangles++;
    }
  }
  const abs = d.map(Math.abs).sort((x, y) => x - y);
  const n = d.length || 1;
  return {
    triangles,
    meanAbsMm: abs.reduce((s, v) => s + v, 0) / n,
    p95AbsMm: abs[Math.min(abs.length - 1, Math.floor(0.95 * abs.length))] ?? 0,
    maxAbsMm: abs[abs.length - 1] ?? 0,
    biasMm: d.reduce((s, v) => s + v, 0) / n,
    insideOver1mmPct: (d.filter((v) => v < -1).length / n) * 100,
  };
}

/**
 * The case's mesh as loaded, then simplified to each share of its triangles with the app's own decimator.
 * A share the decimator cannot reach is left out.
 */
export function scoreMesh(c: LoadedCase, shares: readonly number[] = [0.5, 0.25, 0.1]): { share: number; score: MeshScore }[] {
  const bytes = new Uint8Array(c.mesh.glb);
  const out = [{ share: 1, score: scoreMeshBytes(c, bytes) }];
  for (const share of shares) {
    try {
      out.push({ share, score: scoreMeshBytes(c, decimateGlb(bytes, Math.max(4, Math.floor(c.mesh.triangles * share)))) });
    } catch {
      // the decimator's floor is above this share
    }
  }
  return out;
}
