/**
 * Voxel grid and small numeric helpers for the scan-accuracy harness.
 *
 * The harness works in a "scan frame": millimetres, axes (u, v, w) = the loaded case's (X, Z, Y), so w is
 * the head–foot axis and a slice is one w index. Voxel (i, j, k) has its centre at origin + (index + 0.5) × spacing.
 */
import type { LoadedCase } from '../../contracts';

export type P3 = [number, number, number];

/** Loaded case (metres, Y-up) → scan frame (mm, slice axis last). */
export const toScan = (p: readonly number[]): P3 => [p[0]! * 1000, p[2]! * 1000, p[1]! * 1000];
/** Scan frame → loaded case frame. */
export const fromScan = (q: readonly number[]): P3 => [q[0]! / 1000, q[2]! / 1000, q[1]! / 1000];

export interface Grid {
  nx: number;
  ny: number;
  nz: number;
  /** Voxel size, mm. sx = sy is the in-plane spacing; sz is the slice thickness. */
  sx: number;
  sy: number;
  sz: number;
  ox: number;
  oy: number;
  oz: number;
}

export const voxelCount = (g: Grid): number => g.nx * g.ny * g.nz;
export const hMax = (g: Grid): number => Math.max(g.sx, g.sy, g.sz);
export const hMin = (g: Grid): number => Math.min(g.sx, g.sy, g.sz);

/** The 26 neighbour offsets, with each step's length in mm for a grid. */
export interface Neighbours {
  di: Int8Array;
  dj: Int8Array;
  dk: Int8Array;
  len: Float64Array;
}

export function neighbours(g: Grid): Neighbours {
  const di = new Int8Array(26);
  const dj = new Int8Array(26);
  const dk = new Int8Array(26);
  const len = new Float64Array(26);
  let n = 0;
  for (let c = -1; c <= 1; c++)
    for (let b = -1; b <= 1; b++)
      for (let a = -1; a <= 1; a++) {
        if (a === 0 && b === 0 && c === 0) continue;
        di[n] = a;
        dj[n] = b;
        dk[n] = c;
        len[n] = Math.hypot(a * g.sx, b * g.sy, c * g.sz);
        n++;
      }
  return { di, dj, dk, len };
}

/** Binary min-heap of (key, value) pairs on typed arrays. */
export class MinHeap {
  private keys: Float64Array;
  private vals: Int32Array;
  size = 0;
  /** Key of the entry the last pop() returned. */
  topKey = 0;

  constructor(capacity = 4096) {
    this.keys = new Float64Array(capacity);
    this.vals = new Int32Array(capacity);
  }

  push(key: number, val: number): void {
    if (this.size === this.keys.length) {
      const k = new Float64Array(this.size * 2);
      k.set(this.keys);
      this.keys = k;
      const v = new Int32Array(this.size * 2);
      v.set(this.vals);
      this.vals = v;
    }
    const keys = this.keys;
    const vals = this.vals;
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p]! <= key) break;
      keys[i] = keys[p]!;
      vals[i] = vals[p]!;
      i = p;
    }
    keys[i] = key;
    vals[i] = val;
  }

  pop(): number {
    const keys = this.keys;
    const vals = this.vals;
    const out = vals[0]!;
    this.topKey = keys[0]!;
    const n = --this.size;
    if (n > 0) {
      const key = keys[n]!;
      const val = vals[n]!;
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && keys[c + 1]! < keys[c]!) c++;
        if (keys[c]! >= key) break;
        keys[i] = keys[c]!;
        vals[i] = vals[c]!;
        i = c;
      }
      keys[i] = key;
      vals[i] = val;
    }
    return out;
  }
}

/** Nearest point on a polyline: its distance, and the radius interpolated there. */
export function nearestOnPolyline(pts: readonly P3[], radii: readonly number[], p: readonly number[]): { d: number; r: number } {
  let best = Infinity;
  let r = radii[0] ?? 0;
  if (pts.length === 1) return { d: Math.hypot(pts[0]![0] - p[0]!, pts[0]![1] - p[1]!, pts[0]![2] - p[2]!), r };
  for (let n = 0; n < pts.length - 1; n++) {
    const a = pts[n]!;
    const b = pts[n + 1]!;
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const abz = b[2] - a[2];
    const ab2 = abx * abx + aby * aby + abz * abz;
    let t = ab2 > 0 ? ((p[0]! - a[0]) * abx + (p[1]! - a[1]) * aby + (p[2]! - a[2]) * abz) / ab2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(p[0]! - a[0] - t * abx, p[1]! - a[1] - t * aby, p[2]! - a[2] - t * abz);
    if (d < best) {
      best = d;
      r = radii[n]! + t * (radii[n + 1]! - radii[n]!);
    }
  }
  return { d: best, r };
}

/** Small seeded generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- the known geometry ("truth")

/** One tapered capsule of the true lumen: from a (radius ra) to b (radius rb), mm, scan frame. */
export interface Segment {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  ra: number;
  rb: number;
}

export interface TruthEdge {
  id: string;
  from: string;
  to: string;
  pts: P3[];
  radii: number[];
}

export interface Endpoint {
  id: string;
  node: string;
  role: 'entry' | 'target' | 'end';
  pos: P3;
}

/** A case's own centerlines and radii, as the ground truth a scan of it is scored against. */
export interface Truth {
  caseId: string;
  edges: TruthEdge[];
  /** Node id → position. */
  nodes: Map<string, P3>;
  /** Node id → the largest radius of any edge end at that node, mm. */
  nodeRadius: Map<string, number>;
  /** The marked ends: entries, targets, then every other vessel end (a node with one edge). One per node. */
  endpoints: Endpoint[];
  /** The lumen as a union of tapered capsules. The same list draws the phantom and answers distance queries. */
  segments: Segment[];
}

export function truthOf(c: LoadedCase): Truth {
  const edges: TruthEdge[] = c.edges.map((e) => ({ id: e.id, from: e.from, to: e.to, pts: e.points.map(toScan), radii: e.radiiM.map((r) => r * 1000) }));
  const nodes = new Map(c.nodes.map((n) => [n.id, toScan(n.pos)]));
  const nodeRadius = new Map<string, number>();
  for (const e of edges) {
    nodeRadius.set(e.from, Math.max(nodeRadius.get(e.from) ?? 0, e.radii[0]!));
    nodeRadius.set(e.to, Math.max(nodeRadius.get(e.to) ?? 0, e.radii[e.radii.length - 1]!));
  }
  const endpoints: Endpoint[] = [];
  const seen = new Set<string>();
  const add = (id: string, node: string, role: Endpoint['role']) => {
    const pos = nodes.get(node);
    if (!pos || seen.has(node)) return;
    seen.add(node);
    endpoints.push({ id, node, role, pos });
  };
  for (const en of c.entries) add(en.id, en.node, 'entry');
  for (const t of c.targets) add(t.id, t.node, 'target');
  // David's Slicer export marks every vessel's far end, so the harness does too.
  const degree = new Map<string, number>();
  for (const e of edges) for (const n of [e.from, e.to]) degree.set(n, (degree.get(n) ?? 0) + 1);
  for (const [n, k] of degree) if (k === 1) add(`end:${n}`, n, 'end');

  // Capsules: join points until the chord is at least max(1 mm, r / 4), so wide vessels need few capsules.
  const segments: Segment[] = [];
  for (const e of edges) {
    let s = 0;
    while (s < e.pts.length - 1) {
      let t = s + 1;
      const a = e.pts[s]!;
      const want = Math.max(1, e.radii[s]! / 4);
      while (t < e.pts.length - 1 && Math.hypot(e.pts[t]![0] - a[0], e.pts[t]![1] - a[1], e.pts[t]![2] - a[2]) < want) t++;
      const b = e.pts[t]!;
      segments.push({ ax: a[0], ay: a[1], az: a[2], bx: b[0], by: b[1], bz: b[2], ra: e.radii[s]!, rb: e.radii[t]! });
      s = t;
    }
  }
  return { caseId: c.id, edges, nodes, nodeRadius, endpoints, segments };
}

/**
 * Signed distance to the true lumen wall, mm (negative inside), from a hash of the capsules.
 * Beyond `reach` mm outside every capsule it returns `reach`.
 */
export function truthDistance(truth: Truth, reach = 12): (x: number, y: number, z: number) => number {
  const CELL = 16;
  const cells = new Map<number, number[]>();
  const key = (cx: number, cy: number, cz: number) => cx + 512 + (cy + 512) * 1024 + (cz + 512) * 1048576;
  truth.segments.forEach((s, n) => {
    const pad = Math.max(s.ra, s.rb) + reach;
    const lo = [Math.min(s.ax, s.bx) - pad, Math.min(s.ay, s.by) - pad, Math.min(s.az, s.bz) - pad].map((v) => Math.floor(v / CELL));
    const hi = [Math.max(s.ax, s.bx) + pad, Math.max(s.ay, s.by) + pad, Math.max(s.az, s.bz) + pad].map((v) => Math.floor(v / CELL));
    for (let cz = lo[2]!; cz <= hi[2]!; cz++)
      for (let cy = lo[1]!; cy <= hi[1]!; cy++)
        for (let cx = lo[0]!; cx <= hi[0]!; cx++) {
          const k = key(cx, cy, cz);
          const list = cells.get(k);
          if (list) list.push(n);
          else cells.set(k, [n]);
        }
  });
  const segs = truth.segments;
  return (x, y, z) => {
    const list = cells.get(key(Math.floor(x / CELL), Math.floor(y / CELL), Math.floor(z / CELL)));
    let best = reach;
    if (!list) return best;
    for (let q = 0; q < list.length; q++) {
      const s = segs[list[q]!]!;
      const abx = s.bx - s.ax;
      const aby = s.by - s.ay;
      const abz = s.bz - s.az;
      const ab2 = abx * abx + aby * aby + abz * abz;
      let t = ab2 > 0 ? ((x - s.ax) * abx + (y - s.ay) * aby + (z - s.az) * abz) / ab2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - s.ax - t * abx, y - s.ay - t * aby, z - s.az - t * abz) - (s.ra + t * (s.rb - s.ra));
      if (d < best) best = d;
    }
    return best;
  };
}
