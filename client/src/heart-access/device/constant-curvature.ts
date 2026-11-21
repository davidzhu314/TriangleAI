/**
 * ConstantCurvatureCatheter, the default device [ASSUMPTION] (docs/ASSUMPTIONS.md row 8): a straight shaft that leaves
 * a rigid apical port, then one or two tendon-driven bending segments, each bending at constant curvature κ in a plane
 * at angle φ. For a segment of length L in its base frame, the tip is at
 *
 *   p = [ (1 − cos κL)/κ · cos φ,  (1 − cos κL)/κ · sin φ,  sin κL / κ ]
 *
 * and the frame turns by Rz(φ) · Ry(κL) · Rz(−φ). (κ → 0: a straight segment of length L.)
 *
 * Insertion feeds the device out of the port tip. The tip segment comes out first; until a segment is fully out, the
 * port's sheath holds the rest of it straight, so only the part outside bends. The shaft's roll turns every segment's
 * bending plane with it.
 *
 * Contact (step): after the commanded move, any backbone sample pressed deeper than maxIndentMm into tissue holds the
 * move back: the largest share of the step that stays within it is taken (bisection). Each contact's force is the
 * tissue's stiffness × depth. Kinematic, not dynamic: no buckling, no friction. A Cosserat or MuJoCo model can sit
 * behind the same interface for that (brief, "High-fidelity option").
 */
import { add, dist, type V3 } from '../geometry';
import { compose, I3, m3mul, rotY, rotZ } from './frames';
import { TIP_ZONE_MM, type Backbone, type ContactQuery, type DeviceCommand, type DeviceConfig, type DeviceModel, type DeviceState, type Pose, type StepResult } from './types';

/** [ASSUMPTION] The default device until the client's own parameters arrive (private config, never in the repo). */
export const DEFAULT_CATHETER: DeviceConfig = {
  name: 'Constant-curvature catheter (default, assumed)',
  outerDiameterMm: 3.3, // 10 Fr
  maxInsertMm: 150,
  segments: [
    { lengthMm: 40, maxCurvature: 1 / 25 }, // proximal: bends to a 25 mm radius
    { lengthMm: 20, maxCurvature: 1 / 12 }, // distal tip: bends to a 12 mm radius
  ],
  maxInsertRate: 20,
  maxRollRate: 1.5,
  maxCurvatureRate: 0.05,
  maxPlaneRate: 1.5,
  sampleMm: 1,
  maxIndentMm: 3,
};

/** One constant-curvature piece in its base frame. */
export function arc(curvature: number, plane: number, length: number): Pose {
  const k = curvature;
  if (Math.abs(k) < 1e-12) return { p: [0, 0, length], R: I3 };
  const th = k * length;
  const r = (1 - Math.cos(th)) / k;
  return {
    p: [r * Math.cos(plane), r * Math.sin(plane), Math.sin(th) / k],
    R: m3mul(m3mul(rotZ(plane), rotY(th)), rotZ(-plane)),
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class ConstantCurvatureCatheter implements DeviceModel {
  readonly joints: string[];

  constructor(readonly config: DeviceConfig = DEFAULT_CATHETER) {
    this.joints = ['insert', 'roll', ...config.segments.flatMap((_, i) => [`curvature_${i + 1}`, `plane_${i + 1}`])];
  }

  initial(): DeviceState {
    return { insertMm: 0, roll: 0, segments: this.config.segments.map(() => ({ curvature: 0, plane: 0 })) };
  }

  /**
   * The pieces outside the port, proximal first: the straight shaft, then each segment's exposed length. The tip
   * segment comes out first.
   */
  pieces(q: DeviceState): { length: number; curvature: number; plane: number }[] {
    const segs = this.config.segments;
    const total = segs.reduce((s, g) => s + g.lengthMm, 0);
    let left = Math.min(q.insertMm, total);
    const exposed = new Array<number>(segs.length).fill(0);
    for (let i = segs.length - 1; i >= 0 && left > 0; i--) {
      exposed[i] = Math.min(left, segs[i]!.lengthMm);
      left -= exposed[i]!;
    }
    const out = [{ length: Math.max(0, q.insertMm - total), curvature: 0, plane: 0 }];
    segs.forEach((_, i) => out.push({ length: exposed[i]!, curvature: q.segments[i]!.curvature, plane: q.segments[i]!.plane }));
    return out.filter((p) => p.length > 0);
  }

  backbone(q: DeviceState, base: Pose): Backbone {
    let frame: Pose = { p: base.p, R: m3mul(base.R, rotZ(q.roll)) };
    const pts: V3[] = [frame.p];
    const s: number[] = [0];
    let at = 0;
    for (const piece of this.pieces(q)) {
      const n = Math.max(1, Math.ceil(piece.length / this.config.sampleMm));
      const step = arc(piece.curvature, piece.plane, piece.length / n);
      for (let k = 0; k < n; k++) {
        frame = compose(frame, step);
        at += piece.length / n;
        pts.push(frame.p);
        s.push(at);
      }
    }
    return { pts, s, tip: frame };
  }

  /** Joint vector in `joints` order. */
  vector(q: DeviceState): number[] {
    return [q.insertMm, q.roll, ...q.segments.flatMap((g) => [g.curvature, g.plane])];
  }

  fromVector(v: number[]): DeviceState {
    return { insertMm: v[0]!, roll: v[1]!, segments: this.config.segments.map((_, i) => ({ curvature: v[2 + 2 * i]!, plane: v[3 + 2 * i]! })) };
  }

  jacobian(q: DeviceState, base: Pose): number[][] {
    const v = this.vector(q);
    const steps = this.joints.map((j) => (j === 'insert' ? 1e-3 : j.startsWith('curvature') ? 1e-6 : 1e-5));
    const J: number[][] = [[], [], []];
    v.forEach((_, i) => {
      const hi = [...v];
      const lo = [...v];
      hi[i]! += steps[i]!;
      lo[i]! -= steps[i]!;
      const a = this.backbone(this.fromVector(hi), base).tip.p;
      const b = this.backbone(this.fromVector(lo), base).tip.p;
      for (let r = 0; r < 3; r++) J[r]![i] = (a[r]! - b[r]!) / (2 * steps[i]!);
    });
    return J;
  }

  /** Apply commands for dt with rate and joint limits, ignoring contact. */
  advance(q: DeviceState, u: DeviceCommand, dt: number): DeviceState {
    const c = this.config;
    return {
      insertMm: clamp(q.insertMm + clamp(u.insertRate, -c.maxInsertRate, c.maxInsertRate) * dt, 0, c.maxInsertMm),
      roll: q.roll + clamp(u.rollRate, -c.maxRollRate, c.maxRollRate) * dt,
      segments: q.segments.map((g, i) => ({
        curvature: clamp(g.curvature + clamp(u.segments[i]?.curvatureRate ?? 0, -c.maxCurvatureRate, c.maxCurvatureRate) * dt, 0, c.segments[i]!.maxCurvature),
        plane: g.plane + clamp(u.segments[i]?.planeRate ?? 0, -c.maxPlaneRate, c.maxPlaneRate) * dt,
      })),
    };
  }

  /** Joint-space blend: a + t (b − a). */
  blend(a: DeviceState, b: DeviceState, t: number): DeviceState {
    const va = this.vector(a);
    const vb = this.vector(b);
    return this.fromVector(va.map((x, i) => x + t * (vb[i]! - x)));
  }

  step(q: DeviceState, u: DeviceCommand, contacts: ContactQuery | null, dt: number, base: Pose): StepResult {
    const target = this.advance(q, u, dt);
    const r = this.config.outerDiameterMm / 2;
    const at = (t: number, quick = false) => {
      const state = t === 1 ? target : this.blend(q, target, t);
      const backbone = this.backbone(state, base);
      const found = contacts ? contacts(backbone, r, quick ? this.config.maxIndentMm : Infinity) : [];
      return { state, backbone, found, deepest: found.reduce((m, c) => Math.max(m, c.depthMm), 0) };
    };
    let best = at(1);
    let taken = 1;
    if (best.deepest > this.config.maxIndentMm) {
      // Largest share of the step that stays within the allowed indentation.
      // Seven halvings resolve a 0.67 mm frame step (20 mm/s at 30 Hz) to 0.005 mm. Trials stop at the first
      // too-deep contact; the share finally taken is checked in full.
      let lo = 0;
      let hi = 1;
      for (let k = 0; k < 7; k++) {
        const mid = (lo + hi) / 2;
        if (at(mid, true).deepest <= this.config.maxIndentMm) lo = mid;
        else hi = mid;
      }
      best = at(lo);
      taken = lo;
    }
    const tipS = best.backbone.s[best.backbone.s.length - 1]!;
    const tipForceN = best.found.filter((c) => tipS - c.s <= TIP_ZONE_MM).reduce((s, c) => s + c.forceN, 0);
    return { q: best.state, backbone: best.backbone, contacts: best.found, blocked: taken < 1, taken, tipForceN };
  }
}

/** Length of a backbone, mm. */
export const backboneLength = (b: Backbone): number => b.pts.reduce((s, p, i) => (i ? s + dist(p, b.pts[i - 1]!) : 0), 0);

export { add };
