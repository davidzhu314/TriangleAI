/**
 * The classical pipeline the harness scores: thresholded image → the vessels connected to the case's endpoints →
 * distance to the wall → centerlines as minimum-cost paths that stay far from the wall → smoothed, 1 mm apart,
 * each point with the radius of the largest circle that fits across the vessel there, measured by rays through
 * the image to where it falls to half the lumen contrast (sub-voxel).
 *
 * It takes what David's Slicer export takes (a segmentation and one marked point per entry and target) and
 * returns what that export returns (centerlines with radii). No AI model; every number is arithmetic on voxels.
 */
import { CAND, IMAGE_HALF, KEPT } from './phantom';
import { hMax, hMin, MinHeap, nearestOnPolyline, neighbours, type Endpoint, type Grid, type P3 } from './grid';

/** One stretch of recovered centerline between two forks or marked ends. */
export interface TreeEdge {
  /** Ids of the marked ends at or beyond this stretch (away from the root), sorted. This is what identifies it. */
  below: string[];
  /** mm, scan frame, from the root side outward. */
  pts: P3[];
  /** Radius of the largest circle that fits across the vessel at each point, mm. */
  radii: number[];
}

export interface Segmentation {
  grid: Grid;
  /** Mask bytes with the KEPT bit set on the segmentation. */
  mask: Uint8Array;
  /** Kept voxels: compact number → linear index. */
  vox: Int32Array;
  /** Linear index → compact number + 1 (0 where not kept). */
  id: Int32Array;
  /** Per kept voxel: distance from its centre to the wall of the mask, mm (voxel accuracy; path radii use rays instead). */
  wallMm: Float32Array;
  /** The endpoint every path starts from; null when no endpoint was found. */
  root: string | null;
  /** Marked ends the tree reaches, the root included. */
  reached: string[];
  tree: TreeEdge[];
  /** Linear indices of every voxel on a path before smoothing. */
  pathVoxels: Int32Array;
  /** Endpoints with no vessel voxel near them. */
  lostEndpoints: string[];
  /** Endpoints found, but not connected to the root. */
  disconnected: string[];
}

export interface PipelineOptions {
  /** How far an endpoint may be from the nearest vessel voxel, mm. Default max(5, two voxels). */
  snapMm?: number;
  /** Gaussian σ of the last smoothing along each path, mm of arc length. Default max(2.5, two voxels). */
  finalSmoothMm?: number;
}

class IntList {
  data = new Int32Array(1 << 14);
  length = 0;
  push(v: number): void {
    if (this.length === this.data.length) {
      const d = new Int32Array(this.length * 2);
      d.set(this.data);
      this.data = d;
    }
    this.data[this.length++] = v;
  }
}

/** The nearest above-threshold voxel to a point, within maxMm; −1 when there is none. */
function snap(mask: Uint8Array, g: Grid, p: P3, maxMm: number): number {
  const { nx, ny, nz, sx, sy, sz, ox, oy, oz } = g;
  const ci = Math.floor((p[0] - ox) / sx);
  const cj = Math.floor((p[1] - oy) / sy);
  const ck = Math.floor((p[2] - oz) / sz);
  const inside = ci >= 0 && cj >= 0 && ck >= 0 && ci < nx && cj < ny && ck < nz;
  if (inside && mask[ci + nx * (cj + ny * ck)]! & CAND) return ci + nx * (cj + ny * ck);
  const ri = Math.ceil(maxMm / sx);
  const rj = Math.ceil(maxMm / sy);
  const rk = Math.ceil(maxMm / sz);
  let best = -1;
  let bestD = maxMm * maxMm;
  for (let k = Math.max(0, ck - rk); k <= Math.min(nz - 1, ck + rk); k++)
    for (let j = Math.max(0, cj - rj); j <= Math.min(ny - 1, cj + rj); j++)
      for (let i = Math.max(0, ci - ri); i <= Math.min(nx - 1, ci + ri); i++) {
        const idx = i + nx * (j + ny * k);
        if (!(mask[idx]! & CAND)) continue;
        const dx = ox + (i + 0.5) * sx - p[0];
        const dy = oy + (j + 0.5) * sy - p[1];
        const dz = oz + (k + 0.5) * sz - p[2];
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = idx;
        }
      }
  return best;
}

/** Gaussian smoothing along the path (σ in mm of arc length); the two ends stay where they are. */
function smooth(pts: P3[], radii: number[], sigma: number): { pts: P3[]; radii: number[] } {
  const n = pts.length;
  const s = new Float64Array(n);
  for (let i = 1; i < n; i++) s[i] = s[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1], pts[i]![2] - pts[i - 1]![2]);
  const outP: P3[] = [];
  const outR: number[] = [];
  const reach = 3 * sigma;
  let lo = 0;
  for (let i = 0; i < n; i++) {
    while (s[i]! - s[lo]! > reach) lo++;
    let w = 0;
    let x = 0;
    let y = 0;
    let z = 0;
    let r = 0;
    for (let j = lo; j < n && s[j]! - s[i]! <= reach; j++) {
      const d = s[j]! - s[i]!;
      const g = Math.exp((-d * d) / (2 * sigma * sigma));
      w += g;
      x += g * pts[j]![0];
      y += g * pts[j]![1];
      z += g * pts[j]![2];
      r += g * radii[j]!;
    }
    outP.push(i === 0 || i === n - 1 ? [pts[i]![0], pts[i]![1], pts[i]![2]] : [x / w, y / w, z / w]);
    outR.push(r / w);
  }
  return { pts: outP, radii: outR };
}

/** The same smoothing with the curve mirrored through each end, so the ends stay put and keep their direction. */
function smoothPinned(pts: P3[], vals: number[], sigma: number): { pts: P3[]; radii: number[] } {
  const n = pts.length;
  if (n < 3) return { pts: pts.map((p) => [p[0], p[1], p[2]] as P3), radii: [...vals] };
  const reach = (from: number, dir: 1 | -1): number => {
    let len = 0;
    let k = 0;
    while (k < n - 1 && len < 3 * sigma) {
      const a = pts[from + dir * k]!;
      const b = pts[from + dir * (k + 1)]!;
      len += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      k++;
    }
    return k;
  };
  const padA = reach(0, 1);
  const padB = reach(n - 1, -1);
  const extP: P3[] = [];
  const extV: number[] = [];
  const p0 = pts[0]!;
  const pn = pts[n - 1]!;
  for (let k = padA; k >= 1; k--) {
    extP.push([2 * p0[0] - pts[k]![0], 2 * p0[1] - pts[k]![1], 2 * p0[2] - pts[k]![2]]);
    extV.push(vals[k]!);
  }
  for (let k = 0; k < n; k++) {
    extP.push(pts[k]!);
    extV.push(vals[k]!);
  }
  for (let k = 1; k <= padB; k++) {
    extP.push([2 * pn[0] - pts[n - 1 - k]![0], 2 * pn[1] - pts[n - 1 - k]![1], 2 * pn[2] - pts[n - 1 - k]![2]]);
    extV.push(vals[n - 1 - k]!);
  }
  const sm = smooth(extP, extV, sigma);
  const outP = sm.pts.slice(padA, padA + n);
  outP[0] = [p0[0], p0[1], p0[2]];
  outP[n - 1] = [pn[0], pn[1], pn[2]];
  return { pts: outP, radii: sm.radii.slice(padA, padA + n) };
}

/** Points every `step` mm along a polyline, both ends kept. */
export function resample(pts: readonly P3[], radii: readonly number[], step: number): { pts: P3[]; radii: number[] } {
  const n = pts.length;
  if (n < 2) return { pts: pts.map((p) => [p[0], p[1], p[2]] as P3), radii: [...radii] };
  const s = new Float64Array(n);
  for (let i = 1; i < n; i++) s[i] = s[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1], pts[i]![2] - pts[i - 1]![2]);
  const L = s[n - 1]!;
  const count = Math.max(1, Math.round(L / step));
  const outP: P3[] = [];
  const outR: number[] = [];
  let seg = 0;
  for (let q = 0; q <= count; q++) {
    const at = (L * q) / count;
    while (seg < n - 2 && s[seg + 1]! < at) seg++;
    const span = s[seg + 1]! - s[seg]!;
    const t = span > 0 ? (at - s[seg]!) / span : 0;
    const a = pts[seg]!;
    const b = pts[seg + 1]!;
    outP.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])]);
    outR.push(radii[seg]! + t * (radii[seg + 1]! - radii[seg]!));
  }
  return { pts: outP, radii: outR };
}

export function segmentAndTrace(mask: Uint8Array, image: Uint8Array, g: Grid, endpoints: readonly Endpoint[], opts: PipelineOptions = {}): Segmentation {
  const { nx, ny, nz, sx, sy, sz, ox, oy, oz } = g;
  const area = nx * ny;
  const nb = neighbours(g);
  const snapMm = opts.snapMm ?? Math.max(5, 2 * hMax(g));

  // ---- 1. The vessels connected to the endpoints.
  const seeds = endpoints.map((e) => snap(mask, g, e.pos, snapMm));
  const lostEndpoints = endpoints.filter((_, n) => seeds[n]! < 0).map((e) => e.id);
  const list = new IntList();
  for (const seed of seeds) {
    if (seed < 0 || mask[seed]! & KEPT) continue;
    mask[seed] = mask[seed]! | KEPT;
    list.push(seed);
  }
  for (let head = 0; head < list.length; head++) {
    const idx = list.data[head]!;
    const i = idx % nx;
    const j = ((idx / nx) | 0) % ny;
    const k = (idx / area) | 0;
    for (let n = 0; n < 26; n++) {
      const ii = i + nb.di[n]!;
      const jj = j + nb.dj[n]!;
      const kk = k + nb.dk[n]!;
      if (ii < 0 || jj < 0 || kk < 0 || ii >= nx || jj >= ny || kk >= nz) continue;
      const w = ii + nx * (jj + ny * kk);
      const m = mask[w]!;
      if (m & CAND && !(m & KEPT)) {
        mask[w] = m | KEPT;
        list.push(w);
      }
    }
  }
  const count = list.length;
  const vox = list.data.slice(0, count);
  const id = new Int32Array(mask.length);
  for (let c = 0; c < count; c++) id[vox[c]!] = c + 1;

  // ---- 2. Distance from every kept voxel to the nearest background voxel (vector propagation, so it is
  //         Euclidean and respects thick slices), then to the wall.
  const dist = new Float32Array(count).fill(Infinity);
  const vx = new Int16Array(count);
  const vy = new Int16Array(count);
  const vz = new Int16Array(count);
  const heap = new MinHeap(Math.max(4096, count >> 2));
  for (let c = 0; c < count; c++) {
    const idx = vox[c]!;
    const i = idx % nx;
    const j = ((idx / nx) | 0) % ny;
    const k = (idx / area) | 0;
    let best = Infinity;
    let bn = -1;
    for (let n = 0; n < 26; n++) {
      const ii = i + nb.di[n]!;
      const jj = j + nb.dj[n]!;
      const kk = k + nb.dk[n]!;
      const out = ii < 0 || jj < 0 || kk < 0 || ii >= nx || jj >= ny || kk >= nz;
      if (!out && id[ii + nx * (jj + ny * kk)]! > 0) continue;
      if (nb.len[n]! < best) {
        best = nb.len[n]!;
        bn = n;
      }
    }
    if (bn >= 0) {
      dist[c] = best;
      vx[c] = nb.di[bn]!;
      vy[c] = nb.dj[bn]!;
      vz[c] = nb.dk[bn]!;
      heap.push(best, c);
    }
  }
  while (heap.size > 0) {
    const c = heap.pop();
    if (heap.topKey > dist[c]! + 1e-6) continue;
    const idx = vox[c]!;
    const i = idx % nx;
    const j = ((idx / nx) | 0) % ny;
    const k = (idx / area) | 0;
    for (let n = 0; n < 26; n++) {
      const ii = i + nb.di[n]!;
      const jj = j + nb.dj[n]!;
      const kk = k + nb.dk[n]!;
      if (ii < 0 || jj < 0 || kk < 0 || ii >= nx || jj >= ny || kk >= nz) continue;
      const w = id[ii + nx * (jj + ny * kk)]! - 1;
      if (w < 0) continue;
      const ax = vx[c]! - nb.di[n]!;
      const ay = vy[c]! - nb.dj[n]!;
      const az = vz[c]! - nb.dk[n]!;
      const d = Math.hypot(ax * sx, ay * sy, az * sz);
      if (d < dist[w]! - 1e-6) {
        dist[w] = d;
        vx[w] = ax;
        vy[w] = ay;
        vz[w] = az;
        heap.push(d, w);
      }
    }
  }
  const wallMm = new Float32Array(count);
  for (let c = 0; c < count; c++) {
    const d = dist[c]!;
    if (!Number.isFinite(d)) continue;
    const h = (Math.abs(vx[c]!) * sx * sx + Math.abs(vy[c]!) * sy * sy + Math.abs(vz[c]!) * sz * sz) / d;
    wallMm[c] = Math.max(0, d - 0.5 * h); // the wall of the mask is the face between the two voxels
  }

  // ---- 3. The centerline tree. A step costs its length over the squared wall distance, so the cheapest way is
  //         along the middle of the vessel. Each marked end is joined by its cheapest path to the tree so far
  //         (the tree itself costs nothing), so vessels share one centerline up to where they part.
  const order = [...endpoints.keys()].filter((n) => seeds[n]! >= 0);
  const rootAt = order.find((n) => endpoints[n]!.role === 'entry') ?? order[0];
  const result: Segmentation = { grid: g, mask, vox, id, wallMm, root: null, reached: [], tree: [], pathVoxels: new Int32Array(0), lostEndpoints, disconnected: [] };
  if (rootAt === undefined) return result;
  result.root = endpoints[rootAt]!.id;
  const rootC = id[seeds[rootAt]!]! - 1;
  const cost = new Float64Array(count);
  const prev = new Int32Array(count);
  const floor = 0.5 * hMin(g);
  const inTree: number[] = [rootC];
  /** Cheapest path from the tree to a voxel; false when there is none. Leaves the path in `prev`. */
  const reach = (end: number): boolean => {
    cost.fill(Infinity);
    heap.size = 0;
    for (const v of inTree) {
      cost[v] = 0;
      heap.push(0, v);
    }
    while (heap.size > 0) {
      const c = heap.pop();
      if (heap.topKey > cost[c]!) continue;
      if (c === end) return true;
      const idx = vox[c]!;
      const i = idx % nx;
      const j = ((idx / nx) | 0) % ny;
      const k = (idx / area) | 0;
      const dc = Math.max(floor, dist[c]!);
      for (let n = 0; n < 26; n++) {
        const ii = i + nb.di[n]!;
        const jj = j + nb.dj[n]!;
        const kk = k + nb.dk[n]!;
        if (ii < 0 || jj < 0 || kk < 0 || ii >= nx || jj >= ny || kk >= nz) continue;
        const w = id[ii + nx * (jj + ny * kk)]! - 1;
        if (w < 0) continue;
        const m = (dc + Math.max(floor, dist[w]!)) / 2;
        const t = cost[c]! + nb.len[n]! / (m * m);
        if (t < cost[w]!) {
          cost[w] = t;
          prev[w] = c;
          heap.push(t, w);
        }
      }
    }
    return false;
  };

  // ---- 4. One path per other endpoint: walk back to the root, move each voxel sideways to the local middle,
  //         smooth, then measure the lumen at each point with rays through the image, and resample at 1 mm.
  const centre = (c: number): P3 => {
    const idx = vox[c]!;
    return [ox + ((idx % nx) + 0.5) * sx, oy + ((((idx / nx) | 0) % ny) + 0.5) * sy, oz + (((idx / area) | 0) + 0.5) * sz];
  };
  /** The image at a point, trilinear between voxel centres; background outside the grid. */
  const sample = (x: number, y: number, z: number): number => {
    const fx = (x - ox) / sx - 0.5;
    const fy = (y - oy) / sy - 0.5;
    const fz = (z - oz) / sz - 0.5;
    const i0 = Math.floor(fx);
    const j0 = Math.floor(fy);
    const k0 = Math.floor(fz);
    if (i0 < 0 || j0 < 0 || k0 < 0 || i0 >= nx - 1 || j0 >= ny - 1 || k0 >= nz - 1) return 0;
    const ax = fx - i0;
    const ay = fy - j0;
    const az = fz - k0;
    const b = i0 + nx * (j0 + ny * k0);
    const lo = (image[b]! * (1 - ax) + image[b + 1]! * ax) * (1 - ay) + (image[b + nx]! * (1 - ax) + image[b + nx + 1]! * ax) * ay;
    const hi = (image[b + area]! * (1 - ax) + image[b + area + 1]! * ax) * (1 - ay) + (image[b + area + nx]! * (1 - ax) + image[b + area + nx + 1]! * ax) * ay;
    return lo * (1 - az) + hi * az;
  };
  const rayStep = 0.25 * hMin(g);
  /** Distance from p along a unit direction to where the image falls to half the lumen contrast, mm. */
  const rayToWall = (p: P3, dx: number, dy: number, dz: number, maxLen: number): number => {
    let before = sample(p[0], p[1], p[2]);
    if (before < IMAGE_HALF) return 0;
    for (let s = rayStep; s <= maxLen; s += rayStep) {
      const v = sample(p[0] + s * dx, p[1] + s * dy, p[2] + s * dz);
      if (v < IMAGE_HALF) return s - rayStep + (rayStep * (before - IMAGE_HALF)) / (before - v);
      before = v;
    }
    return maxLen;
  };
  const RAYS = 16;
  const rays = new Float64Array(RAYS);
  /**
   * The lumen across the path at p: the centre of the cross-section (within two voxels of p) and the radius of the
   * largest circle that fits, which is the shortest of 16 rays to the wall.
   */
  const measure = (p: P3, t: P3, guess: number): { p: P3; r: number } => {
    const ref: P3 = Math.abs(t[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    let u: P3 = [t[1] * ref[2] - t[2] * ref[1], t[2] * ref[0] - t[0] * ref[2], t[0] * ref[1] - t[1] * ref[0]];
    const ul = Math.hypot(u[0], u[1], u[2]) || 1;
    u = [u[0] / ul, u[1] / ul, u[2] / ul];
    const v: P3 = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
    const maxLen = Math.min(60, 3 * guess + 3 * hMax(g));
    const dir = (q: number): P3 => {
      const c = Math.cos((q * 2 * Math.PI) / RAYS);
      const s = Math.sin((q * 2 * Math.PI) / RAYS);
      return [c * u[0] + s * v[0], c * u[1] + s * v[1], c * u[2] + s * v[2]];
    };
    let c: P3 = [p[0], p[1], p[2]];
    for (let pass = 0; ; pass++) {
      for (let q = 0; q < RAYS; q++) {
        const d = dir(q);
        rays[q] = rayToWall(c, d[0], d[1], d[2], maxLen);
      }
      if (pass === 2) break;
      // Centre on the chords whose two ends are both wall (not a branch opening).
      const median = [...rays].sort((a, b) => a - b)[RAYS / 2]!;
      let mx = 0;
      let my = 0;
      let mz = 0;
      let pairs = 0;
      for (let q = 0; q < RAYS / 2; q++) {
        const a = rays[q]!;
        const b = rays[q + RAYS / 2]!;
        if (a > 1.3 * median || b > 1.3 * median) continue;
        const d = dir(q);
        const half = (a - b) / 2;
        mx += half * d[0];
        my += half * d[1];
        mz += half * d[2];
        pairs++;
      }
      if (pairs < RAYS / 4) break;
      let nxt: P3 = [c[0] + (2 * mx) / pairs, c[1] + (2 * my) / pairs, c[2] + (2 * mz) / pairs];
      const off = Math.hypot(nxt[0] - c[0], nxt[1] - c[1], nxt[2] - c[2]);
      const cap = hMax(g);
      if (off > cap) nxt = [c[0] + ((nxt[0] - c[0]) * cap) / off, c[1] + ((nxt[1] - c[1]) * cap) / off, c[2] + ((nxt[2] - c[2]) * cap) / off];
      c = nxt;
    }
    const shortest = (): number => {
      let at = 0;
      for (let q = 1; q < RAYS; q++) if (rays[q]! < rays[at]!) at = q;
      return at;
    };
    // Then the largest circle that fits: step away from the nearest wall while that makes the nearest wall farther.
    let near = shortest();
    let r = rays[near]!;
    for (let step = 0.5 * hMin(g), moved = 0; step >= 0.05 * hMin(g) && moved < 3 * hMax(g); ) {
      const d = dir(near);
      const trial: P3 = [c[0] - step * d[0], c[1] - step * d[1], c[2] - step * d[2]];
      let least = Infinity;
      for (let q = 0; q < RAYS && least > r; q++) {
        const e = dir(q);
        least = Math.min(least, rayToWall(trial, e[0], e[1], e[2], maxLen));
      }
      if (least <= r + 1e-4) {
        step /= 2;
        continue;
      }
      c = trial;
      moved += step;
      for (let q = 0; q < RAYS; q++) {
        const e = dir(q);
        rays[q] = rayToWall(c, e[0], e[1], e[2], maxLen);
      }
      near = shortest();
      r = rays[near]!;
    }
    return { p: c, r };
  };

  // The paths from the root to every other marked end form a tree of voxels.
  const marked = new Set<number>([rootC]);
  const kids = new Map<number, number[]>();
  const endsAt = new Map<number, string[]>();
  const markedPos = new Map(endpoints.map((e) => [e.id, e.pos]));
  result.reached.push(result.root);
  /** Tree voxel → the next voxel toward the root. */
  const parent = new Map<number, number>();
  for (const n of order) {
    if (n === rootAt) continue;
    const e = endpoints[n]!;
    const end = id[seeds[n]!]! - 1;
    if (!marked.has(end) && !reach(end)) {
      result.disconnected.push(e.id);
      continue;
    }
    result.reached.push(e.id);
    if (end === rootC) continue; // collapsed onto the root voxel: its edge will read as lost
    const at = endsAt.get(end);
    if (at) at.push(e.id);
    else endsAt.set(end, [e.id]);
    for (let c = end; !marked.has(c); c = prev[c]!) {
      marked.add(c);
      inTree.push(c);
      const p = prev[c]!;
      parent.set(c, p);
      const list = kids.get(p);
      if (list) list.push(c);
      else kids.set(p, [c]);
    }
  }
  /** Tree voxel → the marked ends at or beyond it. */
  const through = new Map<number, string[]>();
  for (const [end, ids] of endsAt)
    for (let c: number | undefined = end; c !== undefined; c = parent.get(c)) {
      const list = through.get(c);
      if (list) list.push(...ids);
      else through.set(c, [...ids]);
    }

  const sigma = Math.max(1.5 * hMax(g), 1.5);
  const sigma2 = opts.finalSmoothMm ?? Math.max(2.5, 2 * hMax(g));
  /** Turn a run of path voxels into a smooth, centred curve with radii. Both ends stay where they are put. */
  const shape = (voxels: number[], start: P3 | null, end: P3 | null): { pts: P3[]; radii: number[]; vertexOf: Int32Array } => {
    const pts: P3[] = [];
    const guess: number[] = [];
    const vertexOf = new Int32Array(voxels.length);
    let last = -1;
    for (let t = 0; t < voxels.length; t++) {
      const c0 = voxels[t]!;
      const a = centre(voxels[Math.max(0, t - 3)]!);
      const b = centre(voxels[Math.min(voxels.length - 1, t + 3)]!);
      const tl = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1;
      const tx = (b[0] - a[0]) / tl;
      const ty = (b[1] - a[1]) / tl;
      const tz = (b[2] - a[2]) / tl;
      const p0 = centre(c0);
      const limit = 0.5 * dist[c0]!;
      let cur = c0;
      // Ends stay put; the rest climb to the largest wall distance in the plane across the path.
      for (let step = 0; step < 40 && t > 0 && t < voxels.length - 1; step++) {
        const idx = vox[cur]!;
        const i = idx % nx;
        const j = ((idx / nx) | 0) % ny;
        const k = (idx / area) | 0;
        let best = cur;
        for (let q = 0; q < 26; q++) {
          const mx = nb.di[q]! * sx;
          const my = nb.dj[q]! * sy;
          const mz = nb.dk[q]! * sz;
          if (Math.abs(mx * tx + my * ty + mz * tz) > 0.5 * nb.len[q]!) continue;
          const ii = i + nb.di[q]!;
          const jj = j + nb.dj[q]!;
          const kk = k + nb.dk[q]!;
          if (ii < 0 || jj < 0 || kk < 0 || ii >= nx || jj >= ny || kk >= nz) continue;
          const w = id[ii + nx * (jj + ny * kk)]! - 1;
          if (w < 0 || dist[w]! <= dist[best]!) continue;
          const pw = centre(w);
          if (Math.hypot(pw[0] - p0[0], pw[1] - p0[1], pw[2] - p0[2]) > limit) continue;
          best = w;
        }
        if (best === cur) break;
        cur = best;
      }
      if (cur !== last || t === voxels.length - 1) {
        pts.push(centre(cur));
        guess.push(dist[cur]!);
        last = cur;
      }
      vertexOf[t] = pts.length - 1;
    }
    if (start) pts[0] = [start[0], start[1], start[2]];
    if (end) pts[pts.length - 1] = [end[0], end[1], end[2]];
    const sm = smoothPinned(pts, guess, sigma);
    const across = (curve: P3[], t: number): { p: P3; r: number } => {
      const a = curve[Math.max(0, t - 2)]!;
      const b = curve[Math.min(curve.length - 1, t + 2)]!;
      const tl = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1;
      return measure(curve[t]!, [(b[0] - a[0]) / tl, (b[1] - a[1]) / tl, (b[2] - a[2]) / tl], sm.radii[t]!);
    };
    // Centre every point on its cross-section, smooth lightly, then size the lumen at each final point. The radius
    // is the cross-section's own (centred) one, so a point that sits a little off the middle still reads the lumen.
    const fine = sm.pts.map((p, t) => (t === 0 || t === sm.pts.length - 1 ? p : across(sm.pts, t).p));
    const out = smoothPinned(fine, sm.radii, sigma2).pts;
    const radii = out.map((_, t) => across(out, t).r);
    // Median of three takes out a single bad ray without widening a short narrowing.
    const med = radii.map((r, t) => [radii[Math.max(0, t - 1)]!, r, radii[Math.min(radii.length - 1, t + 1)]!].sort((x, y) => x - y)[1]!);
    return { pts: out, radii: med, vertexOf };
  };

  // Cut the tree into chains: at each fork one branch carries straight on and the others are side chains, so
  // every chain is one smooth curve.
  const ahead = (c: number, steps: number): number => {
    for (let s = 0; s < steps; s++) {
      const k = kids.get(c);
      if (!k || k.length === 0) break;
      c = k[0]!;
    }
    return c;
  };
  const marker = (ids: string[] | undefined, c: number): P3 | null => {
    if (!ids || ids.length !== 1) return null;
    const p = markedPos.get(ids[0]!);
    const q = centre(c);
    return p && Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) <= hMax(g) ? p : null;
  };
  interface Chain {
    voxels: number[];
    pts: P3[];
    radii: number[];
    vertexOf: Int32Array;
    side: { at: number; kid: number }[];
  }
  const onPath = new IntList();
  const grow = (voxels: number[], isRoot: boolean): Chain => {
    const side: Chain['side'] = [];
    for (let cur = voxels[voxels.length - 1]!; ; ) {
      const k = kids.get(cur);
      if (!k || k.length === 0) break;
      let pick = k[0]!;
      if (k.length > 1 && voxels.length > 1) {
        const from = centre(voxels[Math.max(0, voxels.length - 7)]!);
        const here = centre(cur);
        let bestDot = -Infinity;
        for (const kid of k) {
          const to = centre(ahead(kid, 6));
          const la = Math.hypot(here[0] - from[0], here[1] - from[1], here[2] - from[2]) || 1;
          const lb = Math.hypot(to[0] - here[0], to[1] - here[1], to[2] - here[2]) || 1;
          const dot = ((here[0] - from[0]) * (to[0] - here[0]) + (here[1] - from[1]) * (to[1] - here[1]) + (here[2] - from[2]) * (to[2] - here[2])) / (la * lb);
          if (dot > bestDot) {
            bestDot = dot;
            pick = kid;
          }
        }
      }
      for (const kid of k) if (kid !== pick) side.push({ at: voxels.length - 1, kid });
      voxels.push(pick);
      cur = pick;
    }
    for (let t = isRoot ? 0 : 1; t < voxels.length; t++) onPath.push(vox[voxels[t]!]!);
    const lastVoxel = voxels[voxels.length - 1]!;
    const curve = shape(voxels, isRoot ? marker([result.root!], voxels[0]!) : null, marker(endsAt.get(lastVoxel), lastVoxel));
    return { voxels, pts: curve.pts, radii: curve.radii, vertexOf: curve.vertexOf, side };
  };

  /**
   * Where a side chain joins its parent. Inside the parent the cheapest path wanders, so that part is replaced:
   * the branch's direction just outside the parent's lumen is carried straight back to the parent's centerline.
   * (This is also how the case files define a branch point: on the parent's axis.) Returns the parent vertex.
   */
  const join = (parentChain: Chain, child: Chain, hint: number, forced: number | undefined): number => {
    let out = -1;
    for (let q = 1; q < child.pts.length; q++) {
      const hit = nearestOnPolyline(parentChain.pts, parentChain.radii, child.pts[q]!);
      if (hit.d > hit.r + hMax(g)) {
        out = q;
        break;
      }
    }
    if (out < 0 || out >= child.pts.length - 1) {
      const a = forced ?? hint;
      child.pts[0] = parentChain.pts[a]!;
      return a;
    }
    const x = child.pts[out]!;
    let far = out;
    for (let len = 0; far < child.pts.length - 1 && len < Math.max(8, 2 * child.radii[out]!); far++) len += Math.hypot(child.pts[far + 1]![0] - child.pts[far]![0], child.pts[far + 1]![1] - child.pts[far]![1], child.pts[far + 1]![2] - child.pts[far]![2]);
    const f = child.pts[far]!;
    const fl = Math.hypot(x[0] - f[0], x[1] - f[1], x[2] - f[2]) || 1;
    const ex = (x[0] - f[0]) / fl; // unit direction back toward the parent
    const ey = (x[1] - f[1]) / fl;
    const ez = (x[2] - f[2]) / fl;
    let a = forced ?? hint;
    if (forced === undefined) {
      const window = 3 * parentChain.radii[hint]! + 10;
      let best = Infinity;
      for (const dir of [1, -1])
        for (let q = hint, len = 0; q >= 0 && q < parentChain.pts.length && len <= window; q += dir) {
          const p = parentChain.pts[q]!;
          if (q !== hint) len += Math.hypot(p[0] - parentChain.pts[q - dir]![0], p[1] - parentChain.pts[q - dir]![1], p[2] - parentChain.pts[q - dir]![2]);
          const wx = p[0] - x[0];
          const wy = p[1] - x[1];
          const wz = p[2] - x[2];
          const t = Math.max(0, wx * ex + wy * ey + wz * ez);
          const d = Math.hypot(wx - t * ex, wy - t * ey, wz - t * ez);
          if (d < best) {
            best = d;
            a = q;
          }
        }
    }
    child.pts = [parentChain.pts[a]!, ...child.pts.slice(out)];
    child.radii = [parentChain.radii[a]!, ...child.radii.slice(out)];
    for (let t = 0; t < child.vertexOf.length; t++) child.vertexOf[t] = Math.max(0, child.vertexOf[t]! - out + 1);
    return a;
  };

  const emit = (chain: Chain): void => {
    // Marked ends and forks along this chain, as vertices, each with the marked ends that hang there.
    const at = new Map<number, string[]>();
    const add = (v: number, ids: readonly string[]) => at.set(v, [...(at.get(v) ?? []), ...ids]);
    for (let t = 1; t < chain.voxels.length; t++) {
      const ids = endsAt.get(chain.voxels[t]!);
      if (ids) add(chain.vertexOf[t]!, ids);
    }
    const joined = new Map<number, number>();
    for (const s of chain.side) {
      const child = grow([chain.voxels[s.at]!, s.kid], false);
      const a = join(chain, child, chain.vertexOf[s.at]!, joined.get(s.at));
      joined.set(s.at, a);
      add(a, through.get(s.kid) ?? []);
      if (child.pts.length >= 2) emit(child);
    }
    const order = [...at.keys()].sort((p, q) => p - q);
    const acc: string[] = [];
    const sets: string[][] = [];
    for (let n = order.length - 1; n >= 0; n--) {
      acc.push(...at.get(order[n]!)!);
      sets[n] = [...acc].sort();
    }
    let from = 0;
    order.forEach((v, n) => {
      if (v > from) result.tree.push({ below: sets[n]!, pts: chain.pts.slice(from, v + 1), radii: chain.radii.slice(from, v + 1) });
      from = Math.max(from, v);
    });
  };
  const rootChain = grow([rootC], true);
  if (rootChain.pts.length >= 2) emit(rootChain);
  result.pathVoxels = onPath.data.slice(0, onPath.length);
  return result;
}
