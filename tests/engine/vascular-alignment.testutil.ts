/**
 * Visual alignment between a case (its centerlines and vessels.glb) and an imported anatomical model
 * (assets/vascular/bodyparts3d-aortic.glb), for feature/vascular-integration. Test-side only (Gibran's lane):
 * nothing in client/ imports this. It is the reference implementation for the contract proposed in
 * team/requests/to-all-from-gibran-contract-visual-alignment.md.
 *
 * Frames:
 * - Case files (centerlines.json, vessels.glb) are RAS millimetres in the case's own frame. The client converts
 *   once with RAS_MM_TO_YUP_M; the route trace (LoadedCase edges) and the case mesh then share the scene frame.
 * - The anatomical model is RAS millimetres in BodyParts3D's frame (origin near the soles).
 * - The visual alignment maps model RAS mm to case RAS mm: a similarity (uniform scale, rotation, translation),
 *   p_case = s · R · p_model + t. The renderer would apply RAS_MM_TO_YUP_M after it, exactly as for vessels.glb.
 *   It never touches case data, so planning, comparison, driving and scoring can't see it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGlb, readTriMeshes } from '../../client/src/case/glb';
import { CASES_DIR, REPO } from './engine.testutil';

export type V3 = [number, number, number];

// ---------------------------------------------------------------- the configurable alignment

/** Model RAS mm → case RAS mm. Rotation as intrinsic X-then-Y-then-Z Euler angles in degrees, about RAS axes. */
export interface VisualAlignment {
  schema: 'threadsim.visual-alignment/1';
  caseId: string;
  model: string;
  scale: number;
  rotationDeg: V3;
  translationMm: V3;
  /** How it was made: 'landmark-fit' (centroids of matched vessels) or 'manual'. */
  method: 'landmark-fit' | 'manual';
  /** Case vessel id → model node ids, the pairs a landmark fit used. */
  landmarks?: Record<string, string[]>;
}

const RAD = Math.PI / 180;

/** Rotation matrix (row-major 3×3) from X-then-Y-then-Z degrees: R = Rz · Ry · Rx. */
export function rotation(deg: V3): number[][] {
  const [x, y, z] = deg.map((d) => d * RAD) as V3;
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
  return [
    [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
    [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
    [-sy, cy * sx, cy * cx],
  ];
}

/** Euler X-then-Y-then-Z degrees back from a rotation matrix (the inverse of `rotation`). */
export function eulerDeg(R: number[][]): V3 {
  const sy = -R[2]![0]!;
  const y = Math.asin(Math.max(-1, Math.min(1, sy)));
  const x = Math.atan2(R[2]![1]!, R[2]![2]!);
  const z = Math.atan2(R[1]![0]!, R[0]![0]!);
  return [x / RAD, y / RAD, z / RAD];
}

/** The alignment as a column-major 4×4 (three.js Matrix4.fromArray), model RAS mm → case RAS mm. */
export function alignmentMatrix(a: Pick<VisualAlignment, 'scale' | 'rotationDeg' | 'translationMm'>): number[] {
  const R = rotation(a.rotationDeg);
  const s = a.scale;
  const t = a.translationMm;
  return [
    s * R[0]![0]!, s * R[1]![0]!, s * R[2]![0]!, 0,
    s * R[0]![1]!, s * R[1]![1]!, s * R[2]![1]!, 0,
    s * R[0]![2]!, s * R[1]![2]!, s * R[2]![2]!, 0,
    t[0], t[1], t[2], 1,
  ];
}

export function apply(m: readonly number[], p: V3): V3 {
  return [m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!, m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!, m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!];
}

/** Determinant of the 3×3 part: positive for a proper (non-mirroring) transform. */
export function det3(m: readonly number[]): number {
  const [a, b, c, , d, e, f, , g, h, i] = m as number[];
  return a! * (e! * i! - f! * h!) - b! * (d! * i! - f! * g!) + c! * (d! * h! - e! * g!);
}

// ---------------------------------------------------------------- landmark fit (Umeyama 1991, similarity)

const mean = (ps: readonly V3[]): V3 => {
  const s: V3 = [0, 0, 0];
  for (const p of ps) for (let k = 0; k < 3; k++) s[k] = s[k]! + p[k]!;
  return s.map((v) => v / ps.length) as V3;
};

/** 3×3 SVD by Jacobi on AᵀA; enough for landmark fits (well-conditioned, a handful of points). */
function svd3(A: number[][]): { U: number[][]; S: number[]; V: number[][] } {
  const At = [0, 1, 2].map((i) => [0, 1, 2].map((j) => A[j]![i]!));
  const AtA = [0, 1, 2].map((i) => [0, 1, 2].map((j) => At[i]!.reduce((s, _, k) => s + At[i]![k]! * A[k]![j]!, 0)));
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const M = AtA.map((r) => [...r]);
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let p = 0; p < 2; p++) for (let q = p + 1; q < 3; q++) {
      off += M[p]![q]! ** 2;
      if (Math.abs(M[p]![q]!) < 1e-15) continue;
      const theta = (M[q]![q]! - M[p]![p]!) / (2 * M[p]![q]!);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) {
        const mkp = M[k]![p]!, mkq = M[k]![q]!;
        M[k]![p] = c * mkp - s * mkq;
        M[k]![q] = s * mkp + c * mkq;
      }
      for (let k = 0; k < 3; k++) {
        const mpk = M[p]![k]!, mqk = M[q]![k]!;
        M[p]![k] = c * mpk - s * mqk;
        M[q]![k] = s * mpk + c * mqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = V[k]![p]!, vkq = V[k]![q]!;
        V[k]![p] = c * vkp - s * vkq;
        V[k]![q] = s * vkp + c * vkq;
      }
    }
    if (off < 1e-24) break;
  }
  const order = [0, 1, 2].sort((a, b) => M[b]![b]! - M[a]![a]!);
  const S = order.map((i) => Math.sqrt(Math.max(0, M[i]![i]!)));
  const Vs = [0, 1, 2].map((r) => order.map((i) => V[r]![i]!));
  const U = [0, 1, 2].map((r) => [0, 1, 2].map((j) => (S[j]! > 1e-12 ? [0, 1, 2].reduce((s, k) => s + A[r]![k]! * Vs[k]![j]!, 0) / S[j]! : 0)));
  // Complete U for a rank-deficient A (collinear landmarks would make the fit meaningless; the test forbids it).
  return { U, S, V: Vs };
}

/** Best similarity mapping src points onto dst points (least squares). Needs ≥ 3 non-collinear pairs. */
export function fitSimilarity(src: readonly V3[], dst: readonly V3[]): { scale: number; R: number[][]; t: V3; rmsMm: number } {
  if (src.length !== dst.length || src.length < 3) throw new Error('fitSimilarity needs ≥ 3 matched points');
  const ms = mean(src), md = mean(dst);
  const n = src.length;
  const cov = [0, 1, 2].map((i) => [0, 1, 2].map((j) => src.reduce((s, p, k) => s + (dst[k]![i]! - md[i]!) * (p[j]! - ms[j]!), 0) / n));
  const varS = src.reduce((s, p) => s + (p[0] - ms[0]) ** 2 + (p[1] - ms[1]) ** 2 + (p[2] - ms[2]) ** 2, 0) / n;
  const { U, S, V } = svd3(cov);
  const detUV = det3([U[0]![0]!, U[1]![0]!, U[2]![0]!, 0, U[0]![1]!, U[1]![1]!, U[2]![1]!, 0, U[0]![2]!, U[1]![2]!, U[2]![2]!, 0]) * det3([V[0]![0]!, V[1]![0]!, V[2]![0]!, 0, V[0]![1]!, V[1]![1]!, V[2]![1]!, 0, V[0]![2]!, V[1]![2]!, V[2]![2]!, 0]);
  const D = [1, 1, detUV < 0 ? -1 : 1];
  const R = [0, 1, 2].map((i) => [0, 1, 2].map((j) => [0, 1, 2].reduce((s, k) => s + U[i]![k]! * D[k]! * V[j]![k]!, 0)));
  const scale = varS > 0 ? (S[0]! * D[0]! + S[1]! * D[1]! + S[2]! * D[2]!) / varS : 1;
  const Rms = [0, 1, 2].map((i) => R[i]![0]! * ms[0] + R[i]![1]! * ms[1] + R[i]![2]! * ms[2]);
  const t: V3 = [md[0] - scale * Rms[0]!, md[1] - scale * Rms[1]!, md[2] - scale * Rms[2]!];
  const m = alignmentMatrix({ scale, rotationDeg: eulerDeg(R), translationMm: t });
  const rmsMm = Math.sqrt(src.reduce((s, p, k) => {
    const q = apply(m, p as V3);
    return s + (q[0] - dst[k]![0]!) ** 2 + (q[1] - dst[k]![1]!) ** 2 + (q[2] - dst[k]![2]!) ** 2;
  }, 0) / n);
  return { scale, R, t, rmsMm };
}

// ---------------------------------------------------------------- reading the files (RAS mm, as stored)

export const MODEL_PATH = join(REPO, 'assets/vascular/bodyparts3d-aortic.glb');

interface CenterlineEdge {
  id: string;
  vessel: string;
  points: V3[];
  radii_mm: number[];
}

/** A case's centerline points with their radii, by vessel, in stored RAS mm. */
export function caseCenterlines(caseId: string): Map<string, { p: V3; r: number }[]> {
  const cl = JSON.parse(readFileSync(join(CASES_DIR, caseId, 'centerlines.json'), 'utf8')) as { edges: CenterlineEdge[] };
  const out = new Map<string, { p: V3; r: number }[]>();
  for (const e of cl.edges) {
    const list = out.get(e.vessel) ?? [];
    e.points.forEach((p, i) => list.push({ p: [p[0], p[1], p[2]], r: e.radii_mm[i] ?? e.radii_mm[0] ?? 0 }));
    out.set(e.vessel, list);
  }
  return out;
}

/** Mesh vertices by node name, in stored coordinates (node transforms must be absent: checked by the caller). */
export function meshVertices(path: string): Map<string, V3[]> {
  const meshes = readTriMeshes(parseGlb(new Uint8Array(readFileSync(path))));
  const out = new Map<string, V3[]>();
  for (const m of meshes) {
    if (Object.keys(m.transform).length) throw new Error(`${m.name}: node transforms are not supported here`);
    const list = out.get(m.name) ?? [];
    for (let i = 0; i < m.positions.length; i += 3) list.push([m.positions[i]!, m.positions[i + 1]!, m.positions[i + 2]!]);
    out.set(m.name, list);
  }
  return out;
}

// ---------------------------------------------------------------- matching case vessels to model vessels

/** Case vessel ids (case.json) → the model's node ids that are the same vessel. */
export const VESSEL_MAP: Readonly<Record<string, readonly string[]>> = {
  aorta: ['ascending_aorta', 'aortic_arch', 'thoracic_aorta', 'abdominal_aorta'],
  bca: ['brachiocephalic_trunk'],
  rcca: ['r_carotid_arteries'],
  lcca: ['l_carotid_arteries'],
  r_subclavian: ['r_subclavian_arteries'],
  l_subclavian: ['l_subclavian_arteries'],
  r_iliac: ['r_common_iliac_arteries', 'r_external_iliac_arteries'],
  l_iliac: ['l_common_iliac_arteries', 'l_external_iliac_arteries'],
};

/** Branch vessels make the landmarks: their centroids pin position, scale and turn. The aorta is too long to. */
export const LANDMARK_VESSELS = ['bca', 'rcca', 'lcca', 'r_subclavian', 'l_subclavian', 'r_iliac', 'l_iliac'] as const;

export const centroid = (ps: readonly V3[]): V3 => mean(ps);

/**
 * Fit the model to a case: first from the origins of the branch vessels both have (where each leaves the aorta),
 * then refined by iterative closest points over every matched vessel.
 */
export function landmarkFit(caseId: string, model: Map<string, V3[]>): VisualAlignment & { rmsMm: number; originRmsMm: number } {
  const cl = caseCenterlines(caseId);
  const caseAorta = new PointGrid((cl.get('aorta') ?? []).map((x) => x.p), 8);
  const modelAorta = new PointGrid(VESSEL_MAP['aorta']!.flatMap((id) => model.get(id) ?? []), 8);
  const src: V3[] = [];
  const dst: V3[] = [];
  const landmarks: Record<string, string[]> = {};
  for (const v of LANDMARK_VESSELS) {
    const ids = VESSEL_MAP[v]!.filter((id) => model.has(id));
    const caseVessel = cl.get(v);
    if (!caseVessel?.length || !ids.length) continue;
    src.push(origin(ids.flatMap((id) => model.get(id)!), modelAorta));
    dst.push(origin(caseVessel.map((x) => x.p), caseAorta));
    landmarks[v] = [...ids];
  }
  const fit = fitSimilarity(src, dst);
  const start: VisualAlignment = {
    schema: 'threadsim.visual-alignment/1',
    caseId,
    model: 'assets/vascular/bodyparts3d-aortic.glb',
    scale: fit.scale,
    rotationDeg: eulerDeg(fit.R),
    translationMm: fit.t,
    method: 'landmark-fit',
    landmarks,
  };
  const refined = refine(start, cl, model);
  const matched = [...cl.entries()].filter(([v]) => VESSEL_MAP[v]).flatMap(([, pts]) => pts);
  const score = (a: VisualAlignment): number => coverage(matched, matchedSurface(model, a)).inside;
  const keepRefined = score(refined) >= score(start);
  return keepRefined ? { ...refined, originRmsMm: fit.rmsMm } : { ...start, rmsMm: fit.rmsMm, originRmsMm: fit.rmsMm };
}

/** The model's matched vessels, moved by an alignment, as a nearest-point grid. */
export function matchedSurface(model: Map<string, V3[]>, a: Pick<VisualAlignment, 'scale' | 'rotationDeg' | 'translationMm'>): PointGrid {
  const m = alignmentMatrix(a);
  const ids = new Set(Object.values(VESSEL_MAP).flat());
  return new PointGrid([...model.entries()].filter(([k]) => ids.has(k)).flatMap(([, v]) => v).map((q) => apply(m, q)), 6);
}

/**
 * Where a branch leaves the aorta: the branch point nearest the aorta. In a case, that's an end of the vessel's
 * centerline; in the model, the vertex of the vessel's mesh nearest the aortic mesh. Origins pin the arch far
 * better than centroids, which follow how much of each vessel a model happens to include.
 */
export function origin(points: readonly V3[], aorta: PointGrid): V3 {
  let best = points[0]!;
  let bestD = Infinity;
  for (const q of points) {
    const d = aorta.nearest(q, bestD);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

/**
 * Refine a fit by iterative closest points (similarity), matching each case centerline point of a mapped vessel to
 * the nearest vertex of the same vessel in the moved model. Converges in a few rounds from an origin fit.
 */
export function refine(start: VisualAlignment, cl: Map<string, { p: V3; r: number }[]>, model: Map<string, V3[]>, rounds = 6): VisualAlignment & { rmsMm: number } {
  let a = { ...start };
  let rmsMm = Infinity;
  for (let round = 0; round < rounds; round++) {
    const m = alignmentMatrix(a);
    const src: V3[] = [];
    const dst: V3[] = [];
    for (const [vessel, ids] of Object.entries(VESSEL_MAP)) {
      const pts = cl.get(vessel);
      const verts = ids.flatMap((id) => model.get(id) ?? []);
      if (!pts?.length || !verts.length) continue;
      const moved = verts.map((v) => apply(m, v));
      const grid = new PointGrid(moved, 8);
      const byPoint = new Map(moved.map((q, i) => [q, verts[i]!] as const));
      // Every 8th centerline point is plenty, and keeps the fit fast.
      for (let i = 0; i < pts.length; i += 8) {
        const q = grid.closest(pts[i]!.p);
        if (q) {
          src.push(byPoint.get(q)!);
          dst.push(pts[i]!.p);
        }
      }
    }
    const fit = fitSimilarity(src, dst);
    a = { ...a, scale: fit.scale, rotationDeg: eulerDeg(fit.R), translationMm: fit.t };
    rmsMm = fit.rmsMm;
  }
  return { ...a, rmsMm };
}

// ---------------------------------------------------------------- misalignment measures

/** Nearest-point lookup over a uniform grid (cells of `cellMm`). */
export class PointGrid {
  private readonly cells = new Map<string, V3[]>();
  constructor(
    points: readonly V3[],
    private readonly cellMm: number,
  ) {
    for (const p of points) {
      const k = this.key(p);
      const list = this.cells.get(k) ?? [];
      list.push(p);
      this.cells.set(k, list);
    }
  }
  private key(p: V3): string {
    return p.map((v) => Math.floor(v / this.cellMm)).join(',');
  }
  /** The nearest point itself (null when the grid is empty). */
  closest(p: V3): V3 | null {
    const c = p.map((v) => Math.floor(v / this.cellMm)) as V3;
    let best: V3 | null = null;
    let bestD = Infinity;
    for (let ring = 0; ring < 40; ring++) {
      let any = false;
      for (let i = -ring; i <= ring; i++) for (let j = -ring; j <= ring; j++) for (let k = -ring; k <= ring; k++) {
        if (Math.max(Math.abs(i), Math.abs(j), Math.abs(k)) !== ring) continue;
        for (const q of this.cells.get(`${c[0] + i},${c[1] + j},${c[2] + k}`) ?? []) {
          any = true;
          const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
          if (d < bestD) {
            bestD = d;
            best = q;
          }
        }
      }
      if (best && bestD <= ring * this.cellMm) break;
      if (!any && ring > 0 && !best && ring * this.cellMm > 4000) break;
    }
    return best;
  }

  /** Distance to the nearest point, searching outward until a ring of cells can't hold anything closer. */
  nearest(p: V3, maxMm = Infinity): number {
    const c = p.map((v) => Math.floor(v / this.cellMm)) as V3;
    let best = Infinity;
    for (let ring = 0; ring * this.cellMm <= Math.min(maxMm, 4000) + this.cellMm; ring++) {
      for (let i = -ring; i <= ring; i++) for (let j = -ring; j <= ring; j++) for (let k = -ring; k <= ring; k++) {
        if (Math.max(Math.abs(i), Math.abs(j), Math.abs(k)) !== ring) continue;
        for (const q of this.cells.get(`${c[0] + i},${c[1] + j},${c[2] + k}`) ?? []) best = Math.min(best, Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]));
      }
      if (best <= ring * this.cellMm) break;
    }
    return best;
  }
}

export interface Coverage {
  /** Centerline points checked. */
  points: number;
  /** Share whose nearest surface vertex is within `slackMm + factor · radius` of the centerline point. */
  inside: number;
  /** Median of (nearest vertex distance − radius), mm: about 0 when the surface hugs the centerline. */
  medianExcessMm: number;
  /** 95th percentile of the same, mm. */
  p95ExcessMm: number;
}

/**
 * How well a surface sits on a case's centerlines. A centerline point is "inside" when the nearest surface vertex is
 * no farther than factor × its radius plus a slack: a vertex ring around it, as a tube drawn around the centerline
 * would give. Decimated meshes have sparse vertices, hence the slack.
 */
export function coverage(centerline: readonly { p: V3; r: number }[], surface: PointGrid, factor = 2, slackMm = 2, capMm = 40): Coverage {
  const excess: number[] = [];
  let inside = 0;
  for (const { p, r } of centerline) {
    // Distances past the cap count as the cap: a point that far off is misaligned whatever the exact figure.
    const d = Math.min(capMm, surface.nearest(p, capMm));
    excess.push(d - r);
    if (d <= factor * r + slackMm) inside++;
  }
  excess.sort((a, b) => a - b);
  const q = (f: number): number => excess[Math.min(excess.length - 1, Math.floor(f * excess.length))] ?? NaN;
  return { points: centerline.length, inside: centerline.length ? inside / centerline.length : 0, medianExcessMm: q(0.5), p95ExcessMm: q(0.95) };
}

/** Laterality in RAS: the right-sided vessel's centroid has the larger x. Null when the pair is missing. */
export function rightIsRight(centroids: Map<string, V3>, right: string, left: string): boolean | null {
  const r = centroids.get(right);
  const l = centroids.get(left);
  return r && l ? r[0] > l[0] : null;
}
