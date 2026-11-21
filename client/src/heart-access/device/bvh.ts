/**
 * A bounding-volume hierarchy over triangles, for "closest tissue point to this device sample" queries. Written here
 * rather than adding three-mesh-bvh, which would be a new runtime dependency (CLAUDE.md: those go through David).
 *
 * Built once per mesh: boxes split on their longest axis at the median triangle centre, leaves of up to 8 triangles.
 * A query walks the tree nearest box first and skips any box farther than the best distance so far.
 */
import { cross, dot, sub, unit, type V3 } from '../geometry';

export interface Hit {
  /** Closest point on the surface. */
  point: V3;
  /** Distance to it, mm (≥ 0). */
  d: number;
  /** The triangle it lies on. */
  tri: number;
  /** That triangle's unit normal (as oriented when the BVH was built). */
  normal: V3;
  /** d with the sign of the side the query point is on: positive on the normal's side. */
  signed: number;
}

const LEAF = 8;

/** Closest point to p on triangle abc (Ericson, Real-Time Collision Detection, 5.1.5). */
export function closestOnTriangle(p: V3, a: V3, b: V3, c: V3): V3 {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(p, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return [a[0] + v * ab[0], a[1] + v * ab[1], a[2] + v * ab[2]];
  }
  const cp = sub(p, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return [a[0] + w * ac[0], a[1] + w * ac[1], a[2] + w * ac[2]];
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return [b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2])];
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
}

export class TriangleBvh {
  /** Per node: box min xyz, max xyz. */
  private readonly box: Float64Array;
  /** Per node: left and right child indices, or −1 for a leaf. */
  private readonly left: Int32Array;
  private readonly right: Int32Array;
  /** Per node: first index into `order` and count (leaves). */
  private readonly first: Int32Array;
  private readonly count: Int32Array;
  private readonly order: Int32Array;
  readonly normals: V3[];
  private nodes = 0;

  /**
   * @param flip  turn every triangle's normal round (use when the winding points away from the side that should be
   *              positive)
   */
  constructor(
    readonly pts: readonly V3[],
    readonly tris: Uint32Array | readonly number[],
    flip = false,
  ) {
    const n = tris.length / 3;
    this.normals = [];
    const cen: V3[] = [];
    for (let t = 0; t < n; t++) {
      const a = pts[tris[3 * t]!]!;
      const b = pts[tris[3 * t + 1]!]!;
      const c = pts[tris[3 * t + 2]!]!;
      const nn = unit(cross(sub(b, a), sub(c, a)));
      this.normals.push(flip ? [-nn[0], -nn[1], -nn[2]] : nn);
      cen.push([(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]);
    }
    // Median splits stop once a box holds LEAF or fewer, so every leaf holds at least LEAF / 2: at most n / 4 leaves
    // for LEAF = 8, and twice that many nodes in all.
    const cap = 2 * Math.ceil(n / Math.floor(LEAF / 2)) + 2;
    this.box = new Float64Array(cap * 6);
    this.left = new Int32Array(cap).fill(-1);
    this.right = new Int32Array(cap).fill(-1);
    this.first = new Int32Array(cap);
    this.count = new Int32Array(cap);
    this.order = Int32Array.from({ length: n }, (_, i) => i);
    const build = (start: number, end: number): number => {
      const node = this.nodes++;
      const b = this.box;
      let lo: V3 = [Infinity, Infinity, Infinity];
      let hi: V3 = [-Infinity, -Infinity, -Infinity];
      for (let i = start; i < end; i++) {
        const t = this.order[i]!;
        for (let k = 0; k < 3; k++) {
          const p = pts[tris[3 * t + k]!]!;
          lo = [Math.min(lo[0], p[0]), Math.min(lo[1], p[1]), Math.min(lo[2], p[2])];
          hi = [Math.max(hi[0], p[0]), Math.max(hi[1], p[1]), Math.max(hi[2], p[2])];
        }
      }
      b.set([...lo, ...hi], node * 6);
      if (end - start <= LEAF) {
        this.first[node] = start;
        this.count[node] = end - start;
        return node;
      }
      const ext = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
      const axis = ext[0]! >= ext[1]! && ext[0]! >= ext[2]! ? 0 : ext[1]! >= ext[2]! ? 1 : 2;
      const slice = Array.from(this.order.subarray(start, end)).sort((x, y) => cen[x]![axis]! - cen[y]![axis]!);
      this.order.set(slice, start);
      const mid = (start + end) >> 1;
      this.left[node] = build(start, mid);
      this.right[node] = build(mid, end);
      return node;
    };
    if (n > 0) build(0, n);
  }

  private boxDist2(node: number, p: V3): number {
    const b = this.box;
    let d = 0;
    for (let k = 0; k < 3; k++) {
      const v = p[k]!;
      const lo = b[node * 6 + k]!;
      const hi = b[node * 6 + 3 + k]!;
      if (v < lo) d += (lo - v) ** 2;
      else if (v > hi) d += (v - hi) ** 2;
    }
    return d;
  }

  /** The closest surface point within maxDist, or null. */
  closest(p: V3, maxDist = Infinity): Hit | null {
    if (this.nodes === 0) return null;
    let best = maxDist * maxDist;
    let bestPt: V3 | null = null;
    let bestTri = -1;
    const stack: number[] = [0];
    while (stack.length) {
      const node = stack.pop()!;
      if (this.boxDist2(node, p) > best) continue;
      const l = this.left[node]!;
      if (l < 0) {
        const f = this.first[node]!;
        for (let i = f; i < f + this.count[node]!; i++) {
          const t = this.order[i]!;
          const q = closestOnTriangle(p, this.pts[this.tris[3 * t]!]!, this.pts[this.tris[3 * t + 1]!]!, this.pts[this.tris[3 * t + 2]!]!);
          const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2;
          if (d < best) {
            best = d;
            bestPt = q;
            bestTri = t;
          }
        }
        continue;
      }
      const r = this.right[node]!;
      const dl = this.boxDist2(l, p);
      const dr = this.boxDist2(r, p);
      if (dl < dr) {
        stack.push(r, l);
      } else stack.push(l, r);
    }
    if (!bestPt) return null;
    const d = Math.sqrt(best);
    const n = this.normals[bestTri]!;
    const side = dot(sub(p, bestPt), n);
    return { point: bestPt, d, tri: bestTri, normal: n, signed: side >= 0 ? d : -d };
  }
}
