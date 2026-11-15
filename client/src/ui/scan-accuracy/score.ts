/**
 * Scores for a segmentation and its centerlines against the known geometry.
 *
 * Voxel overlap: Dice, MCC, precision, recall. Topology: clDice (do the centerlines stay inside each other's
 * lumen), lost endpoints, lost edges. Surface: average Hausdorff distance, mm. Centerline: offset, mm.
 * Radius: error at every point and at each vessel's narrowest point, away from junctions. Branch angle: degrees.
 * (Dice, MCC, clDice and AHD are the measures iVesseger reports: Li et al., Biomed. Signal Process. Control 2025.)
 */
import { hMax, hMin, nearestOnPolyline, truthDistance, type Grid, type P3, type Truth, type TruthEdge } from './grid';
import { KEPT, TRUTH } from './phantom';
import type { Segmentation } from './pipeline';
import type { RecoveredGeometry } from './recovered';

export interface VoxelScore {
  dice: number;
  mcc: number;
  precision: number;
  recall: number;
  /** Centerline Dice, from samples along both centerlines. */
  clDice: number;
  /** Average Hausdorff distance between the two walls, mm (mean of the two directed averages). */
  ahdMm: number;
}

export interface EdgeScore {
  id: string;
  recovered: boolean;
  /** Share of the edge's points outside junctions, %. Offsets and radii are scored on these. */
  clearPct: number;
  meanOffsetMm: number | null;
  meanAbsRadiusErrPct: number | null;
  /** Radius error at the edge's narrowest point outside junctions, %. */
  narrowestErrPct: number | null;
  narrowestTrueMm: number;
}

export interface GeometryScore {
  centerline: {
    /** Share of the true centerline length on recovered edges, %. */
    coveragePct: number;
    /** Share of true centerline points inside junctions (not scored for offset or radius), %. */
    junctionSharePct: number;
    /** Distance from true centerline points to the recovered centerline, mm. */
    meanOffsetMm: number;
    maxOffsetMm: number;
  };
  radius: {
    meanAbsErrPct: number;
    p95AbsErrPct: number;
    /** Mean signed error, %: positive when the scan reads vessels too wide. */
    biasPct: number;
    /** Error at the narrowest point of the whole case, %; null when that edge was lost. */
    narrowestErrPct: number | null;
    /** The largest |narrowest-point error| over recovered edges, %. */
    worstEdgeNarrowestErrPct: number;
  };
  /**
   * Direction each edge leaves a shared node, over the engine's 5 mm window: what the steering check reads.
   * For a branch off a wide vessel that window is inside the parent's lumen, where a scan cannot see the branch.
   */
  branchAngle: { n: number; meanErrDeg: number; maxErrDeg: number; /** Where the largest error is: "edge at node". */ worst: string | null };
  /** The same for side branches, measured from where the branch leaves its parent's lumen: what a scan can see. */
  ostiumAngle: { n: number; meanErrDeg: number; maxErrDeg: number };
  edges: EdgeScore[];
}

const cross = (a: readonly number[], b: readonly number[]): P3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const norm = (a: readonly number[]): P3 => {
  const l = Math.hypot(a[0]!, a[1]!, a[2]!) || 1;
  return [a[0]! / l, a[1]! / l, a[2]! / l];
};

export function scoreVoxels(seg: Segmentation, truth: Truth): VoxelScore {
  const g: Grid = seg.grid;
  const { nx, ny, nz, sx, sy, sz, ox, oy, oz } = g;
  const { mask, id, vox, wallMm } = seg;
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (let q = 0; q < mask.length; q++) {
    const m = mask[q]!;
    if (m & KEPT) {
      if (m & TRUTH) tp++;
      else fp++;
    } else if (m & TRUTH) fn++;
  }
  const tn = mask.length - tp - fp - fn;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const dice = 2 * tp + fp + fn > 0 ? (2 * tp) / (2 * tp + fp + fn) : 0;
  const den = Math.sqrt((tp + fp) * (tp + fn)) * Math.sqrt((tn + fp) * (tn + fn));
  const mcc = den > 0 ? (tp * tn - fp * fn) / den : 0;

  const at = (p: readonly number[]): number => {
    const i = Math.floor((p[0]! - ox) / sx);
    const j = Math.floor((p[1]! - oy) / sy);
    const k = Math.floor((p[2]! - oz) / sz);
    return i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? -1 : i + nx * (j + ny * k);
  };

  // clDice: recovered centerline inside the true lumen, true centerline inside the segmentation.
  let inTruth = 0;
  for (let q = 0; q < seg.pathVoxels.length; q++) if (mask[seg.pathVoxels[q]!]! & TRUTH) inTruth++;
  const tprec = seg.pathVoxels.length > 0 ? inTruth / seg.pathVoxels.length : 0;
  let samples = 0;
  let inSeg = 0;
  const step = 0.5 * hMin(g);
  for (const e of truth.edges)
    for (let n = 0; n < e.pts.length - 1; n++) {
      const a = e.pts[n]!;
      const b = e.pts[n + 1]!;
      const parts = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / step));
      for (let q = 0; q < parts; q++) {
        const t = q / parts;
        const idx = at([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])]);
        samples++;
        if (idx >= 0 && mask[idx]! & KEPT) inSeg++;
      }
    }
  const tsens = samples > 0 ? inSeg / samples : 0;
  const clDice = tprec + tsens > 0 ? (2 * tprec * tsens) / (tprec + tsens) : 0;

  // AHD, segmentation wall → true wall: every kept voxel with a face on the background.
  const CAP = 10;
  const sdf = truthDistance(truth, CAP);
  const area = nx * ny;
  let sumPL = 0;
  let nPL = 0;
  for (let c = 0; c < vox.length; c++) {
    const idx = vox[c]!;
    const i = idx % nx;
    const j = ((idx / nx) | 0) % ny;
    const k = (idx / area) | 0;
    const face =
      i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1 || !id[idx - 1] || !id[idx + 1] || !id[idx - nx] || !id[idx + nx] || !id[idx - area] || !id[idx + area];
    if (!face) continue;
    sumPL += Math.abs(sdf(ox + (i + 0.5) * sx, oy + (j + 0.5) * sy, oz + (k + 0.5) * sz));
    nPL++;
  }
  // AHD, true wall → segmentation wall: eight points round the wall at every true centerline point.
  const half = (sx + sy + sz) / 6;
  const toSeg = (p: P3): number => {
    const idx = at(p);
    if (idx >= 0 && id[idx]! > 0) return wallMm[id[idx]! - 1]!;
    const ci = Math.floor((p[0] - ox) / sx);
    const cj = Math.floor((p[1] - oy) / sy);
    const ck = Math.floor((p[2] - oz) / sz);
    for (let R = 2 * hMax(g); ; ) {
      let best = Infinity;
      const ri = Math.ceil(R / sx);
      const rj = Math.ceil(R / sy);
      const rk = Math.ceil(R / sz);
      for (let k = Math.max(0, ck - rk); k <= Math.min(nz - 1, ck + rk); k++)
        for (let j = Math.max(0, cj - rj); j <= Math.min(ny - 1, cj + rj); j++)
          for (let i = Math.max(0, ci - ri); i <= Math.min(nx - 1, ci + ri); i++) {
            if (!id[i + nx * (j + ny * k)]) continue;
            const d = Math.hypot(ox + (i + 0.5) * sx - p[0], oy + (j + 0.5) * sy - p[1], oz + (k + 0.5) * sz - p[2]);
            if (d < best) best = d;
          }
      if (best <= R) return Math.max(0, best - half);
      if (R >= CAP) return CAP;
      R = Math.min(CAP, Number.isFinite(best) ? best : 2 * R);
    }
  };
  let sumLP = 0;
  let nLP = 0;
  for (const e of truth.edges)
    for (let n = 0; n < e.pts.length; n++) {
      const p = e.pts[n]!;
      const t = norm([e.pts[Math.min(e.pts.length - 1, n + 1)]![0] - e.pts[Math.max(0, n - 1)]![0], e.pts[Math.min(e.pts.length - 1, n + 1)]![1] - e.pts[Math.max(0, n - 1)]![1], e.pts[Math.min(e.pts.length - 1, n + 1)]![2] - e.pts[Math.max(0, n - 1)]![2]]);
      const u = norm(cross(t, Math.abs(t[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
      const v = cross(t, u);
      const r = e.radii[n]!;
      for (let q = 0; q < 8; q++) {
        const c = Math.cos((q * Math.PI) / 4) * r;
        const s = Math.sin((q * Math.PI) / 4) * r;
        const w: P3 = [p[0] + c * u[0] + s * v[0], p[1] + c * u[1] + s * v[1], p[2] + c * u[2] + s * v[2]];
        if (Math.abs(sdf(w[0], w[1], w[2])) > 0.1) continue; // inside another vessel: not wall
        sumLP += toSeg(w);
        nLP++;
      }
    }
  const ahdMm = ((nPL > 0 ? sumPL / nPL : CAP) + (nLP > 0 ? sumLP / nLP : CAP)) / 2;
  return { dice, mcc, precision, recall, clDice, ahdMm };
}

/** Unit direction from a polyline's first point to the point `window` mm along it. */
function leaving(pts: readonly P3[], window: number): P3 {
  let left = window;
  for (let n = 1; n < pts.length; n++) {
    const a = pts[n - 1]!;
    const b = pts[n]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (l >= left || n === pts.length - 1) {
      const t = l > 0 ? Math.min(1, left / l) : 0;
      return norm([a[0] + t * (b[0] - a[0]) - pts[0]![0], a[1] + t * (b[1] - a[1]) - pts[0]![1], a[2] + t * (b[2] - a[2]) - pts[0]![2]]);
    }
    left -= l;
  }
  return [0, 0, 1];
}

/**
 * Centerline, radius and branch-angle errors of recovered edges. This part needs no voxels, so it also scores
 * centerlines from any other pipeline (a Slicer export of the same phantom) as long as the edge ids match.
 *
 * Offsets and radii are scored away from junctions. Where two vessels overlap, the case file still gives each its
 * own centerline and radius, but the lumen there is one merged space with one middle, so no pipeline can return
 * the file's numbers. A true point counts as "in a junction" when another vessel's wall comes within half its own
 * radius. Branch angles, and the route comparison, are where junction errors are scored.
 */
export function scoreGeometry(truth: Truth, geom: RecoveredGeometry): GeometryScore {
  const rec = [...geom.edges.values()];
  const nearestAny = (p: readonly number[]): { d: number; r: number } => {
    let best = { d: Infinity, r: 0 };
    for (const r of rec) {
      const hit = nearestOnPolyline(r.pts, r.radii, p);
      if (hit.d < best.d) best = hit;
    }
    return best;
  };
  const endDir = (e: TruthEdge, node: string): P3 => leaving(node === e.from ? e.pts : [...e.pts].reverse(), 5);
  const endRadius = (e: TruthEdge, node: string): number => (node === e.from ? e.radii[0]! : e.radii[e.radii.length - 1]!);
  /** Two edges that are one vessel carrying straight on through a node (the arch, cut at each branch). */
  const sameVessel = (a: TruthEdge, b: TruthEdge): boolean => {
    const node = [a.from, a.to].find((n) => n === b.from || n === b.to);
    if (!node) return false;
    const da = endDir(a, node);
    const db = endDir(b, node);
    const ratio = endRadius(a, node) / endRadius(b, node);
    return da[0] * db[0] + da[1] * db[1] + da[2] * db[2] < -0.866 && ratio > 0.7 && ratio < 1.43;
  };

  const edges: EdgeScore[] = [];
  let lenAll = 0;
  let lenRec = 0;
  let sumOff = 0;
  let maxOff = 0;
  let nPts = 0;
  let nAll = 0;
  let nJunction = 0;
  let sumSigned = 0;
  const absErr: number[] = [];
  let caseNarrowest: { trueMm: number; errPct: number | null } | null = null;
  for (const e of truth.edges) {
    let L = 0;
    for (let n = 1; n < e.pts.length; n++) L += Math.hypot(e.pts[n]![0] - e.pts[n - 1]![0], e.pts[n]![1] - e.pts[n - 1]![1], e.pts[n]![2] - e.pts[n - 1]![2]);
    lenAll += L;
    const others = truth.edges.filter((o) => o !== e && !sameVessel(e, o));
    const clear = e.pts.map((p, n) => !others.some((o) => {
      const hit = nearestOnPolyline(o.pts, o.radii, p);
      return hit.d - hit.r < 0.5 * e.radii[n]!;
    }));
    nAll += e.pts.length;
    nJunction += clear.filter((c) => !c).length;
    // The narrowest clear point; an edge that is all junction falls back to its narrowest point.
    let narrowAt = -1;
    e.radii.forEach((r, n) => {
      if ((clear[n] || !clear.includes(true)) && (narrowAt < 0 || r < e.radii[narrowAt]!)) narrowAt = n;
    });
    const narrowestTrueMm = e.radii[narrowAt]!;
    const recovered = geom.edges.has(e.id);
    if (!recovered) {
      edges.push({ id: e.id, recovered, clearPct: (clear.filter(Boolean).length / e.pts.length) * 100, meanOffsetMm: null, meanAbsRadiusErrPct: null, narrowestErrPct: null, narrowestTrueMm });
      if (!caseNarrowest || narrowestTrueMm < caseNarrowest.trueMm) caseNarrowest = { trueMm: narrowestTrueMm, errPct: null };
      continue;
    }
    lenRec += L;
    let off = 0;
    let err = 0;
    let n = 0;
    e.pts.forEach((p, q) => {
      if (!clear[q]) return;
      const hit = nearestAny(p);
      const rel = ((hit.r - e.radii[q]!) / e.radii[q]!) * 100;
      off += hit.d;
      err += Math.abs(rel);
      n++;
      sumOff += hit.d;
      maxOff = Math.max(maxOff, hit.d);
      sumSigned += rel;
      absErr.push(Math.abs(rel));
      nPts++;
    });
    const narrowestErrPct = ((nearestAny(e.pts[narrowAt]!).r - narrowestTrueMm) / narrowestTrueMm) * 100;
    edges.push({ id: e.id, recovered, clearPct: (n / e.pts.length) * 100, meanOffsetMm: n > 0 ? off / n : null, meanAbsRadiusErrPct: n > 0 ? err / n : null, narrowestErrPct, narrowestTrueMm });
    if (!caseNarrowest || narrowestTrueMm < caseNarrowest.trueMm) caseNarrowest = { trueMm: narrowestTrueMm, errPct: narrowestErrPct };
  }
  absErr.sort((a, b) => a - b);

  // Branch angles: the direction each edge leaves a shared node, over the engine's 5 mm steering window.
  const incident = new Map<string, number>();
  for (const e of truth.edges) for (const n of [e.from, e.to]) incident.set(n, (incident.get(n) ?? 0) + 1);
  let nAng = 0;
  let sumAng = 0;
  let maxAng = 0;
  let worstAng: string | null = null;
  let nOst = 0;
  let sumOst = 0;
  let maxOst = 0;
  for (const e of truth.edges) {
    const r = geom.edges.get(e.id);
    if (!r) continue;
    for (const end of ['from', 'to'] as const) {
      if ((incident.get(e[end]) ?? 0) < 2) continue;
      const a = leaving(end === 'from' ? e.pts : [...e.pts].reverse(), 5);
      const b = leaving(end === 'from' ? r.pts : [...r.pts].reverse(), 5);
      const deg = (Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180) / Math.PI;
      nAng++;
      sumAng += deg;
      // A side branch (clearly narrower than the widest vessel at the node): compare again at its ostium.
      const parentR = truth.nodeRadius.get(e[end]) ?? 0;
      const own = end === 'from' ? e.pts : [...e.pts].reverse();
      const ownR = end === 'from' ? e.radii[0]! : e.radii[e.radii.length - 1]!;
      const exit = own.findIndex((p) => Math.hypot(p[0] - own[0]![0], p[1] - own[0]![1], p[2] - own[0]![2]) > parentR);
      if (ownR < 0.8 * parentR && exit > 0 && exit < own.length - 2) {
        const got = end === 'from' ? r.pts : [...r.pts].reverse();
        let at = 0;
        for (let q = 1; q < got.length; q++) if (Math.hypot(got[q]![0] - own[exit]![0], got[q]![1] - own[exit]![1], got[q]![2] - own[exit]![2]) < Math.hypot(got[at]![0] - own[exit]![0], got[at]![1] - own[exit]![1], got[at]![2] - own[exit]![2])) at = q;
        if (at < got.length - 2) {
          const ta = leaving(own.slice(exit), 5);
          const tb = leaving(got.slice(at), 5);
          const od = (Math.acos(Math.max(-1, Math.min(1, ta[0] * tb[0] + ta[1] * tb[1] + ta[2] * tb[2]))) * 180) / Math.PI;
          nOst++;
          sumOst += od;
          maxOst = Math.max(maxOst, od);
        }
      }
      if (deg > maxAng) worstAng = `${e.id} at ${e[end]}`;
      maxAng = Math.max(maxAng, deg);
    }
  }
  return {
    centerline: {
      coveragePct: lenAll > 0 ? (lenRec / lenAll) * 100 : 0,
      junctionSharePct: nAll > 0 ? (nJunction / nAll) * 100 : 0,
      meanOffsetMm: nPts > 0 ? sumOff / nPts : 0,
      maxOffsetMm: maxOff,
    },
    radius: {
      meanAbsErrPct: nPts > 0 ? absErr.reduce((s, v) => s + v, 0) / nPts : 0,
      p95AbsErrPct: nPts > 0 ? absErr[Math.min(nPts - 1, Math.floor(0.95 * nPts))]! : 0,
      biasPct: nPts > 0 ? sumSigned / nPts : 0,
      narrowestErrPct: caseNarrowest?.errPct ?? null,
      worstEdgeNarrowestErrPct: edges.reduce((m, e) => Math.max(m, Math.abs(e.narrowestErrPct ?? 0)), 0),
    },
    branchAngle: { n: nAng, meanErrDeg: nAng > 0 ? sumAng / nAng : 0, maxErrDeg: maxAng, worst: worstAng },
    ostiumAngle: { n: nOst, meanErrDeg: nOst > 0 ? sumOst / nOst : 0, maxErrDeg: maxOst },
    edges,
  };
}
