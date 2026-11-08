/**
 * The vessel lumen for the chain simulation (physics-chain.ts): the union of tubes along the case's centerline edges,
 * each segment a truncated cone between two centerline points with their inscribed radii. Positions are metres, Y-up
 * (LoadedCase). A uniform grid of cells holds the segments whose expanded bounds touch each cell, so a query looks at
 * a few segments instead of all of them.
 *
 * This is the geometry the device is kept inside. It is an approximation of the wall: the radius is VMTK's or the
 * generator's inscribed radius, so the true lumen of a real scan is somewhat wider in non-circular sections.
 */
import type { LoadedCase, Vec3 } from '../contracts';

export interface LumenSegment {
  edge: string;
  /** Index of the segment's first point within the edge. */
  index: number;
  a: Vec3;
  b: Vec3;
  ra: number;
  rb: number;
  /** Arc length along the edge (from its `from` node) at `a`, metres. */
  sa: number;
  len: number;
}

export interface LumenQuery {
  /** The segment whose wall is nearest (most inside, or least outside). */
  seg: LumenSegment;
  /** 0..1 along the segment. */
  u: number;
  /** Closest point on the segment's axis. */
  centre: Vec3;
  /** Distance from the axis, metres. */
  dist: number;
  /** Local lumen radius, metres. */
  radius: number;
  /** dist − radius: negative inside, positive outside. */
  slack: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export class Lumen {
  readonly segments: LumenSegment[] = [];
  private readonly cells = new Map<string, number[]>();
  private readonly cell: number;

  constructor(c: LoadedCase, cellM = 0.01) {
    this.cell = cellM;
    for (const e of c.edges) {
      let s = 0;
      for (let i = 0; i + 1 < e.points.length; i++) {
        const a = e.points[i]!;
        const b = e.points[i + 1]!;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        if (len > 0) this.segments.push({ edge: e.id, index: i, a, b, ra: e.radiiM[i]!, rb: e.radiiM[i + 1]!, sa: s, len });
        s += len;
      }
    }
    this.segments.forEach((sg, k) => {
      const r = Math.max(sg.ra, sg.rb) + this.cell;
      const lo = [0, 1, 2].map((ax) => Math.floor((Math.min(sg.a[ax]!, sg.b[ax]!) - r) / this.cell));
      const hi = [0, 1, 2].map((ax) => Math.floor((Math.max(sg.a[ax]!, sg.b[ax]!) + r) / this.cell));
      for (let x = lo[0]!; x <= hi[0]!; x++)
        for (let y = lo[1]!; y <= hi[1]!; y++)
          for (let z = lo[2]!; z <= hi[2]!; z++) {
            const key = `${x},${y},${z}`;
            const list = this.cells.get(key);
            if (list) list.push(k);
            else this.cells.set(key, [k]);
          }
    });
  }

  /** The nearest wall to `p`: the segment with the smallest slack (most inside), among `only` edges if given. */
  query(p: Vec3, only?: ReadonlySet<string>): LumenQuery {
    const key = `${Math.floor(p[0] / this.cell)},${Math.floor(p[1] / this.cell)},${Math.floor(p[2] / this.cell)}`;
    let near = this.cells.get(key);
    if (only && near && !near.some((k) => only.has(this.segments[k]!.edge))) near = undefined;
    let best: LumenQuery | null = null;
    const consider = (sg: LumenSegment): void => {
      if (only && !only.has(sg.edge)) return;
      const ab = sub(sg.b, sg.a);
      const u = Math.min(1, Math.max(0, dot(sub(p, sg.a), ab) / (sg.len * sg.len)));
      const centre: Vec3 = [sg.a[0] + ab[0] * u, sg.a[1] + ab[1] * u, sg.a[2] + ab[2] * u];
      const dist = Math.hypot(p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]);
      const radius = sg.ra + (sg.rb - sg.ra) * u;
      const slack = dist - radius;
      if (!best || slack < best.slack) best = { seg: sg, u, centre, dist, radius, slack };
    };
    if (near) for (const k of near) consider(this.segments[k]!);
    else for (const sg of this.segments) consider(sg); // far outside every tube: a full scan, rare
    return best!;
  }

  /** Arc length along the segment's edge (from the edge's `from` node) at a query's closest point. */
  edgeArc(q: LumenQuery): number {
    return q.seg.sa + q.seg.len * q.u;
  }
}
