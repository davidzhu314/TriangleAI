/**
 * Penalty contact between a device backbone and tissue meshes. Each mesh is a BVH whose triangle normals point to the
 * side the device belongs on (into the cavity for the LV's inner wall). A backbone sample of radius r touches a
 * surface when its signed distance to it is less than r; the depth is r − signed distance, and the force on the
 * device is the tissue's stiffness × depth, along the surface normal.
 */
import { add, cross, dot, sub, type V3 } from '../geometry';
import type { MeshPart } from '../heart';
import type { LeftVentricle } from '../lv';
import { TriangleBvh } from './bvh';
import type { Backbone, Contact, ContactQuery, Tissue } from './types';

/** [ASSUMPTION] Penalty stiffness per tissue, N/mm (docs/ASSUMPTIONS.md row 10). Replace with measured values. */
export const STIFFNESS_N_PER_MM: Record<Tissue, number> = { wall: 0.1, septum: 0.1, papillary: 0.08, leaflet: 0.05, chordae: 0.03 };

export interface TissueMesh {
  name: string;
  tissue: Tissue;
  bvh: TriangleBvh;
  stiffness: number;
}

/** Signed volume of a closed surface (positive when its winding points outward). */
export function signedVolume(part: MeshPart): number {
  let v = 0;
  for (let k = 0; k < part.tris.length; k += 3) v += dot(part.pts[part.tris[k]!]!, cross(part.pts[part.tris[k + 1]!]!, part.pts[part.tris[k + 2]!]!));
  return v / 6;
}

/**
 * The LV cavity's wall as a contact surface: the triangles of the LV wall whose three corners are inner vertices,
 * with normals pointing out of the muscle, which on the inner faces is into the cavity.
 */
export function lvCavityMesh(lvPart: MeshPart, lv: LeftVentricle): TissueMesh {
  const inner = new Uint8Array(lvPart.pts.length);
  for (const i of lv.inner) inner[i] = 1;
  const tris: number[] = [];
  for (let k = 0; k < lvPart.tris.length; k += 3) {
    const a = lvPart.tris[k]!;
    const b = lvPart.tris[k + 1]!;
    const c = lvPart.tris[k + 2]!;
    if (inner[a] && inner[b] && inner[c]) tris.push(a, b, c);
  }
  return { name: 'lv_cavity_wall', tissue: 'wall', bvh: new TriangleBvh(lvPart.pts, Uint32Array.from(tris), signedVolume(lvPart) < 0), stiffness: STIFFNESS_N_PER_MM.wall };
}

/** A contact query over tissue meshes: the deepest contact per backbone sample. */
export function contactQuery(meshes: TissueMesh[]): ContactQuery {
  return (backbone: Backbone, radiusMm: number, stopAboveMm = Infinity): Contact[] => {
    const out: Contact[] = [];
    const reach = radiusMm + 10;
    // From the tip backward: the tip is where a push or a bend makes contact first, so a check that may stop early
    // finds a too-deep contact soonest.
    for (let i = backbone.pts.length - 1; i >= 0; i--) {
      const p = backbone.pts[i]!;
      let best: Contact | null = null;
      for (const m of meshes) {
        const hit = m.bvh.closest(p, reach);
        if (!hit) continue;
        const depth = radiusMm - hit.signed;
        if (depth <= 0 || (best && depth <= best.depthMm)) continue;
        best = { s: backbone.s[i]!, at: p, wall: hit.point, normal: hit.normal, depthMm: depth, tissue: m.tissue, forceN: m.stiffness * depth };
      }
      if (best) {
        out.push(best);
        if (best.depthMm > stopAboveMm) break;
      }
    }
    return out.reverse();
  };
}

/**
 * How far a line from `from` along `dir` travels before it is inside the cavity (signed distance ≥ 0 to the cavity
 * wall), mm, in 0.25 mm steps up to `maxMm`. For a port: the length of the path through the wall.
 */
export function throughWall(from: V3, dir: V3, cavity: TissueMesh, maxMm = 40): number {
  for (let s = 0; s <= maxMm; s += 0.25) {
    const hit = cavity.bvh.closest([from[0] + dir[0] * s, from[1] + dir[1] * s, from[2] + dir[2] * s], 60);
    if (hit && hit.signed >= 0) return s;
  }
  return maxMm;
}

/** The force vector a contact puts on the device, N. */
export const forceVector = (c: Contact): V3 => [c.normal[0] * c.forceN, c.normal[1] * c.forceN, c.normal[2] * c.forceN];

export { add, sub };
