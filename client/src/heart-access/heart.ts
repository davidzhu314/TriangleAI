/**
 * The two hearts the fit joins, both in RAS millimetres:
 *  - the template: David's heart (client/public/hearts/<id>/heart.glb), decoded with three.js so its meshopt and
 *    quantized encoding is read the same way the Heart tab reads it;
 *  - a CT case's heart: the `heart` node of the case's context.glb (TotalSegmentator, one unlabelled surface), with
 *    the case's aortic root (the `n_aortic_root` end of its aorta centerline) and the aorta's direction there.
 */
import * as THREE from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { parseGlb, readTriMeshes } from '../case/glb';
import type { CenterlinesJson } from '../contracts';
import { add, dist, scale, sub, unit, yupMToRasMm, type V3 } from './geometry';

export interface MeshPart {
  name: string;
  /** Vertices, RAS mm. */
  pts: V3[];
  /** Triangle corner indices, three per triangle. */
  tris: Uint32Array;
}

export interface TemplateHeart {
  id: string;
  parts: Map<string, MeshPart>;
}

export interface CaseHeart {
  caseId: string;
  /** The CT heart's surface vertices, RAS mm. */
  surface: MeshPart;
  /** Every other context mesh (bone, veins), RAS mm, for display. */
  context: MeshPart[];
  /** The end of the case's aorta centerline at the heart, RAS mm. */
  aorticRoot: V3;
  /** Unit direction up the aorta, from AORTA_NEAR_MM to AORTA_FAR_MM along it from the root. */
  aortaAxis: V3;
  /** The centerline points AORTA_NEAR_MM and AORTA_FAR_MM up from the root. */
  aortaNear: V3;
  aortaFar: V3;
  /** The aorta centerline from the root outward (first 80 mm), RAS mm, for display. */
  aortaPath: V3[];
}

/**
 * Where the aorta's direction is measured, in mm of arc length from the root. The first few millimetres are skipped:
 * a centerline curls where its segmentation is cut off (the Access check trims the same artefact, END_TRIM_MM).
 */
export const AORTA_NEAR_MM = 10;
export const AORTA_FAR_MM = 35;

/** The point `at` mm of arc length along a polyline (its last point if shorter). */
export function pointAlong(path: readonly V3[], at: number): V3 {
  let left = at;
  for (let n = 1; n < path.length; n++) {
    const l = dist(path[n]!, path[n - 1]!);
    if (l >= left) {
      const t = l > 0 ? left / l : 0;
      const a = path[n - 1]!;
      const b = path[n]!;
      return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])];
    }
    left -= l;
  }
  return path[path.length - 1]!;
}

/** Decode the template heart. `bytes` is heart.glb as stored. */
export async function loadTemplateHeart(id: string, bytes: Uint8Array): Promise<TemplateHeart> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) => loader.parse(ab, '', resolve as never, reject));
  gltf.scene.updateMatrixWorld(true);
  const parts = new Map<string, MeshPart>();
  const v = new THREE.Vector3();
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry as THREE.BufferGeometry;
    const pos = g.attributes['position']!;
    const pts: V3[] = [];
    for (let n = 0; n < pos.count; n++) {
      v.fromBufferAttribute(pos, n).applyMatrix4(mesh.matrixWorld);
      pts.push(yupMToRasMm([v.x, v.y, v.z]));
    }
    const tris = g.index ? Uint32Array.from(g.index.array as ArrayLike<number>) : Uint32Array.from({ length: pos.count }, (_, n) => n);
    parts.set(mesh.name, { name: mesh.name, pts, tris });
  });
  return { id, parts };
}

/** A CT case's heart, context and aortic root from its context.glb and centerlines.json. */
export function loadCaseHeart(caseId: string, contextGlb: Uint8Array, centerlines: CenterlinesJson): CaseHeart {
  const meshes = readTriMeshes(parseGlb(contextGlb));
  const asPart = (m: (typeof meshes)[number]): MeshPart => {
    const t = m.transform;
    if (t.matrix || t.rotation || t.scale || t.translation) throw new Error(`${caseId}: context mesh ${m.name} has a node transform; expected none (mm RAS in the vertices)`);
    const pts: V3[] = [];
    for (let n = 0; n < m.positions.length; n += 3) pts.push([m.positions[n]!, m.positions[n + 1]!, m.positions[n + 2]!]);
    return { name: m.name, pts, tris: m.indices };
  };
  const heart = meshes.find((m) => m.name === 'heart');
  if (!heart) throw new Error(`${caseId}: context.glb has no heart mesh`);

  const root = centerlines.nodes.find((n) => n.id === 'n_aortic_root');
  if (!root) throw new Error(`${caseId}: centerlines.json has no n_aortic_root node`);
  const edge = centerlines.edges.find((e) => e.to === 'n_aortic_root' || e.from === 'n_aortic_root');
  if (!edge) throw new Error(`${caseId}: no edge reaches n_aortic_root`);
  // The path from the root outward, then the direction over the first AORTA_AXIS_MM of it.
  const path = (edge.to === 'n_aortic_root' ? [...edge.points].reverse() : [...edge.points]) as V3[];
  const out: V3[] = [path[0]!];
  let len = 0;
  for (let n = 1; n < path.length && len < 80; n++) {
    len += dist(path[n]!, path[n - 1]!);
    out.push(path[n]!);
  }
  const near = pointAlong(path, AORTA_NEAR_MM);
  const far = pointAlong(path, AORTA_FAR_MM);
  return {
    caseId,
    surface: asPart(heart),
    context: meshes.filter((m) => m.name !== 'heart').map(asPart),
    aorticRoot: root.pos as V3,
    aortaAxis: unit(sub(far, near)),
    aortaNear: near,
    aortaFar: far,
    aortaPath: out,
  };
}

/** Vertex centroid of a part. */
export function centroid(pts: readonly V3[]): V3 {
  let c: V3 = [0, 0, 0];
  for (const p of pts) c = add(c, p);
  return scale(c, 1 / Math.max(1, pts.length));
}

/** Every `step`-th point, for a deterministic subsample. */
export const every = <T>(xs: readonly T[], step: number): T[] => xs.filter((_, n) => n % Math.max(1, step) === 0);

/** Surface samples: every vertex plus every triangle's centre, so coarse meshes are sampled more evenly. */
export function surfaceSamples(part: MeshPart): V3[] {
  const out = [...part.pts];
  for (let n = 0; n < part.tris.length; n += 3) {
    const a = part.pts[part.tris[n]!]!;
    const b = part.pts[part.tris[n + 1]!]!;
    const c = part.pts[part.tris[n + 2]!]!;
    out.push([(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]);
  }
  return out;
}
