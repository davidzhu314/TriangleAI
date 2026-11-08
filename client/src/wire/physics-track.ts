/**
 * Turns physics (or replayed physics) tip positions into the parts of WireState and the EventLog that
 * the physics process does not send: arc length `s` along the planned path, the active edge, and the
 * §5.6 events. Used by PhysicsWireSource and ReplayWireSource.
 *
 * Positions arrive in CathSim world metres, which is the loaded case's Y-up frame (D3a), so they are
 * compared with `LoadedCase.edges` as they are.
 *
 * - `s`: arc length of the nearest point on the planned path polyline.
 * - `edge`: the nearest centerline edge. An off-path edge counts only once the tip is outside the
 *   planned path's lumen (further from it than its local radius); near a branch origin it stays on path.
 * - `wrong_branch` when the tip enters an off-path edge; `back_out` once per retreat of more than
 *   20 mm below the furthest s since the tip last moved forward; `force_spike` when the force rises
 *   through the scoring threshold; `target_reached` the first time the server reports `at_target`.
 * - Prolapse is not detected in physics mode: the wire really bends, and no rule here labels it.
 */
import { BACK_OUT_THRESHOLD_M, type LoadedCase, type Vec3, type WireEvent } from '../contracts';
import { FORCE_SPIKE_THRESHOLD_N } from './rail';

interface Seg {
  a: Vec3;
  b: Vec3;
  edge: string;
  /** Arc length at `a` along the planned path (path segments only). */
  s0: number;
  ra: number;
  rb: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Closest point parameter u in [0, 1] on segment ab, and the distance to it. */
function project(p: Vec3, a: Vec3, b: Vec3): { u: number; d: number } {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  const u = len2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2)) : 0;
  const q: Vec3 = [a[0] + u * ab[0], a[1] + u * ab[1], a[2] + u * ab[2]];
  return { u, d: Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) };
}

export interface TrackUpdate {
  s: number;
  edge: string;
  events: WireEvent[];
}

export class PhysicsTrack {
  private readonly pathSegs: Seg[] = [];
  private readonly allSegs: Seg[] = [];
  private readonly onPath: Set<string>;
  private edge: string;
  private peakS = 0;
  private lastS = 0;
  private backOutFired = false;
  private lastForce = 0;
  private reached = false;

  constructor(
    c: LoadedCase,
    path: readonly string[],
    private readonly targetId: string,
  ) {
    const edges = new Map(c.edges.map((e) => [e.id, e]));
    this.onPath = new Set(path);
    let s = 0;
    let node: string | null = null;
    for (const id of path) {
      const e = edges.get(id);
      if (!e) throw new Error(`PhysicsTrack: path edge ${id} is not in case ${c.id}`);
      // Walk each edge in the direction the path travels it.
      const reversed: boolean = node !== null && e.to === node;
      const pts = reversed ? [...e.points].reverse() : e.points;
      const rs = reversed ? [...e.radiiM].reverse() : e.radiiM;
      node = reversed ? e.from : e.to;
      for (let i = 1; i < pts.length; i++) {
        const seg: Seg = { a: pts[i - 1]!, b: pts[i]!, edge: id, s0: s, ra: rs[i - 1]!, rb: rs[i]! };
        this.pathSegs.push(seg);
        s += Math.hypot(...sub(seg.b, seg.a));
      }
    }
    for (const e of c.edges) {
      for (let i = 1; i < e.points.length; i++) {
        this.allSegs.push({ a: e.points[i - 1]!, b: e.points[i]!, edge: e.id, s0: 0, ra: e.radiiM[i - 1]!, rb: e.radiiM[i]! });
      }
    }
    this.edge = path[0] ?? '';
    if (this.pathSegs.length === 0) throw new Error('PhysicsTrack: empty path');
  }

  /** One frame. `t` is simulation time in seconds. */
  update(t: number, tip: Vec3, forceN: number, atTarget: boolean): TrackUpdate {
    const events: WireEvent[] = [];

    let best = { d: Infinity, s: 0, edge: '', r: 0 };
    for (const g of this.pathSegs) {
      const { u, d } = project(tip, g.a, g.b);
      if (d < best.d) best = { d, s: g.s0 + u * Math.hypot(...sub(g.b, g.a)), edge: g.edge, r: g.ra + u * (g.rb - g.ra) };
    }
    let nearest = { d: Infinity, edge: '' };
    for (const g of this.allSegs) {
      const { d } = project(tip, g.a, g.b);
      if (d < nearest.d) nearest = { d, edge: g.edge };
    }
    const s = best.s;
    const offPath = !this.onPath.has(nearest.edge) && best.d > best.r;
    const edge = offPath ? nearest.edge : best.edge;
    if (offPath && edge !== this.edge) events.push({ t, kind: 'wrong_branch', edge, expectedEdge: best.edge });
    this.edge = edge;

    if (this.backOutFired && s > this.lastS) {
      this.backOutFired = false;
      this.peakS = s;
    }
    this.peakS = Math.max(this.peakS, s);
    if (!this.backOutFired && this.peakS - s > BACK_OUT_THRESHOLD_M) {
      events.push({ t, kind: 'back_out', fromS: this.peakS, toS: s });
      this.backOutFired = true;
    }
    this.lastS = s;

    if (this.lastForce <= FORCE_SPIKE_THRESHOLD_N && forceN > FORCE_SPIKE_THRESHOLD_N) {
      events.push({ t, kind: 'force_spike', forceN, thresholdN: FORCE_SPIKE_THRESHOLD_N });
    }
    this.lastForce = forceN;

    if (atTarget && !this.reached) {
      this.reached = true;
      events.push({ t, kind: 'target_reached', target: this.targetId });
    }
    return { s, edge, events };
  }
}
