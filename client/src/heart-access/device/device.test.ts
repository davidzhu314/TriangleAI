/**
 * Phase 2: the device model, its contact and the apical port, on synthetic geometry (fast, no patient data).
 * Acceptance (the brief): forward kinematics matches the closed-form tip position to 0.1 mm.
 */
import { describe, expect, test } from 'vitest';
import { add, dist, scale, sub, type M4, type V3 } from '../geometry';
import { TriangleBvh, closestOnTriangle } from './bvh';
import { ConstantCurvatureCatheter, DEFAULT_CATHETER, arc } from './constant-curvature';
import { contactQuery, STIFFNESS_N_PER_MM, type TissueMesh } from './contact';
import { compose, frameAlong, I3, m3mul, m3v, rotZ } from './frames';
import { makePort, MAX_TILT_RAD, portBase, portLoad, tiltPort, TILT_STIFFNESS_N_PER_RAD } from './port';
import { AccessSim, idle } from './sim';
import type { DeviceState, M3, Pose } from './types';

const ORIGIN: Pose = { p: [0, 0, 0], R: I3 };

/** Seeded random numbers (mulberry32), so every run tests the same configurations. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const TOL_MM = 0.1;
const cath = new ConstantCurvatureCatheter();
const state = (insertMm: number, roll: number, segs: [number, number][]): DeviceState => ({ insertMm, roll, segments: segs.map(([curvature, plane]) => ({ curvature, plane })) });

/** Independent check: integrate the bending curve with RK4 (frame ODE dR/ds = R [ω]×, dp/ds = R e_z). */
function integrate(base: Pose, roll: number, pieces: { length: number; curvature: number; plane: number }[]): V3 {
  let p: V3 = [...base.p];
  let R: M3 = m3mul(base.R, rotZ(roll));
  const h = 0.01;
  const deriv = (Rm: M3, k: number, phi: number) => {
    const w: V3 = [-Math.sin(phi) * k, Math.cos(phi) * k, 0]; // bending in plane phi turns about this local axis
    const W: M3 = [0, -w[2], w[1], w[2], 0, -w[0], -w[1], w[0], 0];
    return { dR: m3mul(Rm, W), dp: m3v(Rm, [0, 0, 1]) };
  };
  const addM = (a: M3, b: M3, s: number): M3 => a.map((v, i) => v + s * b[i]!);
  for (const piece of pieces) {
    const n = Math.round(piece.length / h);
    const hh = piece.length / n;
    for (let i = 0; i < n; i++) {
      const k1 = deriv(R, piece.curvature, piece.plane);
      const k2 = deriv(addM(R, k1.dR, hh / 2), piece.curvature, piece.plane);
      const k3 = deriv(addM(R, k2.dR, hh / 2), piece.curvature, piece.plane);
      const k4 = deriv(addM(R, k3.dR, hh), piece.curvature, piece.plane);
      p = add(p, scale(add(add(k1.dp, scale(add(k2.dp, k3.dp), 2)), k4.dp), hh / 6));
      R = R.map((v, j) => v + (hh / 6) * (k1.dR[j]! + 2 * k2.dR[j]! + 2 * k3.dR[j]! + k4.dR[j]!));
    }
  }
  return p;
}

describe('constant-curvature catheter: kinematics', () => {
  test('acceptance: a single segment\'s tip matches the closed form to 0.1 mm', () => {
    const r = rng(7);
    const single = new ConstantCurvatureCatheter({ ...DEFAULT_CATHETER, segments: [{ lengthMm: 30, maxCurvature: 1 / 10 }] });
    for (let t = 0; t < 200; t++) {
      const k = r() * 0.1;
      const phi = (r() - 0.5) * 4 * Math.PI;
      const L = 30;
      const closed: V3 = k < 1e-12 ? [0, 0, L] : [((1 - Math.cos(k * L)) / k) * Math.cos(phi), ((1 - Math.cos(k * L)) / k) * Math.sin(phi), Math.sin(k * L) / k];
      const tip = single.backbone(state(L, 0, [[k, phi]]), ORIGIN).tip.p;
      expect(dist(tip, closed)).toBeLessThan(TOL_MM);
    }
  });

  test('acceptance: shaft plus two segments, rolled, in any pose, matches an independent integration to 0.1 mm', () => {
    const r = rng(11);
    for (let t = 0; t < 40; t++) {
      const q = state(20 + r() * 100, (r() - 0.5) * 6, [
        [r() * DEFAULT_CATHETER.segments[0]!.maxCurvature, (r() - 0.5) * 6],
        [r() * DEFAULT_CATHETER.segments[1]!.maxCurvature, (r() - 0.5) * 6],
      ]);
      const base: Pose = { p: [r() * 100, r() * 100, r() * 100], R: frameAlong([r() - 0.5, r() - 0.5, r() - 0.5]) };
      const tip = cath.backbone(q, base).tip.p;
      expect(dist(tip, integrate(base, q.roll, cath.pieces(q)))).toBeLessThan(TOL_MM);
    }
  });

  test('the tip segment comes out first, and the tip moves smoothly as each segment leaves the port', () => {
    const q = (d: number) => state(d, 0, [[1 / 30, 0], [1 / 15, 1]]);
    expect(cath.pieces(q(10))).toEqual([{ length: 10, curvature: 1 / 15, plane: 1 }]);
    expect(cath.pieces(q(50)).map((p) => p.length)).toEqual([30, 20]);
    expect(cath.pieces(q(80)).map((p) => p.length)).toEqual([20, 40, 20]);
    for (const d of [20, 60]) {
      const a = cath.backbone(q(d - 0.01), ORIGIN).tip.p;
      const b = cath.backbone(q(d + 0.01), ORIGIN).tip.p;
      expect(dist(a, b)).toBeLessThan(0.05);
    }
  });

  test('the backbone is sampled about every millimetre and is as long as the insertion', () => {
    const b = cath.backbone(state(97.3, 0.4, [[0.02, 0.3], [0.05, -1]]), ORIGIN);
    for (let i = 1; i < b.pts.length; i++) expect(dist(b.pts[i]!, b.pts[i - 1]!)).toBeLessThanOrEqual(DEFAULT_CATHETER.sampleMm + 1e-9);
    expect(b.s[b.s.length - 1]!).toBeCloseTo(97.3, 9);
  });

  test('the Jacobian predicts the tip\'s move for a small joint move', () => {
    const q = state(70, 0.3, [[0.02, 0.5], [0.05, -0.7]]);
    const base: Pose = { p: [5, 6, 7], R: frameAlong([0.2, -0.3, 0.9]) };
    const J = cath.jacobian(q, base);
    expect(J.map((r) => r.length)).toEqual([6, 6, 6]);
    const dq = [0.02, 0.001, 0.00005, 0.002, 0.0001, -0.002];
    const v = cath.vector(q).map((x, i) => x + dq[i]!);
    const moved = sub(cath.backbone(cath.fromVector(v), base).tip.p, cath.backbone(q, base).tip.p);
    const predicted: V3 = [0, 1, 2].map((r) => J[r]!.reduce((s, x, i) => s + x * dq[i]!, 0)) as V3;
    expect(Math.hypot(...moved)).toBeGreaterThan(0.01);
    expect(dist(moved, predicted)).toBeLessThan(0.01 * Math.hypot(...moved) + 1e-4);
  });

  test('limits: rates and joints are clamped, insertion never goes below zero', () => {
    const big = { insertRate: 1e6, rollRate: 1e6, segments: [{ curvatureRate: 1e6, planeRate: 1e6 }, { curvatureRate: 1e6, planeRate: 1e6 }] };
    const one = cath.advance(cath.initial(), big, 1);
    expect(one.insertMm).toBe(DEFAULT_CATHETER.maxInsertRate);
    expect(one.roll).toBe(DEFAULT_CATHETER.maxRollRate);
    // One second at the largest curvature rate, or the segment's own limit if that comes first.
    one.segments.forEach((g, i) => expect(g.curvature).toBe(Math.min(DEFAULT_CATHETER.maxCurvatureRate, DEFAULT_CATHETER.segments[i]!.maxCurvature)));
    let q = cath.initial();
    for (let i = 0; i < 1000; i++) q = cath.advance(q, big, 1);
    expect(q.insertMm).toBe(DEFAULT_CATHETER.maxInsertMm);
    q.segments.forEach((g, i) => expect(g.curvature).toBe(DEFAULT_CATHETER.segments[i]!.maxCurvature));
    const back = cath.advance(q, { ...big, insertRate: -1e6, segments: big.segments.map(() => ({ curvatureRate: -1e6, planeRate: 0 })) }, 1000);
    expect(back.insertMm).toBe(0);
    back.segments.forEach((g) => expect(g.curvature).toBe(0));
  });
});

/** A flat wall at z = zWall facing −z (the device starts below it and pushes up into it). */
function wallMesh(zWall: number): TissueMesh {
  const s = 200;
  const pts: V3[] = [[-s, -s, zWall], [s, -s, zWall], [s, s, zWall], [-s, s, zWall]];
  // Winding (0,2,1),(0,3,2) gives a −z normal: the side the device is on.
  return { name: 'wall', tissue: 'wall', bvh: new TriangleBvh(pts, [0, 2, 1, 0, 3, 2]), stiffness: STIFFNESS_N_PER_MM.wall };
}

describe('triangle BVH', () => {
  test('finds the same closest point as brute force', () => {
    const r = rng(3);
    const pts: V3[] = Array.from({ length: 600 }, () => [r() * 100, r() * 100, r() * 100]);
    const tris: number[] = [];
    for (let i = 0; i + 2 < 600; i += 3) tris.push(i, i + 1, i + 2);
    const bvh = new TriangleBvh(pts, tris);
    for (let k = 0; k < 100; k++) {
      const q: V3 = [r() * 120 - 10, r() * 120 - 10, r() * 120 - 10];
      let best = Infinity;
      for (let t = 0; t < tris.length; t += 3) best = Math.min(best, dist(q, closestOnTriangle(q, pts[tris[t]!]!, pts[tris[t + 1]!]!, pts[tris[t + 2]!]!)));
      expect(bvh.closest(q)!.d).toBeCloseTo(best, 9);
    }
  });

  test('signed distance is positive on the normal\'s side', () => {
    const w = wallMesh(50);
    expect(w.bvh.closest([0, 0, 40])!.signed).toBeCloseTo(10, 9);
    expect(w.bvh.closest([0, 0, 53])!.signed).toBeCloseTo(-3, 9);
  });
});

describe('contact', () => {
  const push = { insertRate: 20, rollRate: 0, segments: [{ curvatureRate: 0, planeRate: 0 }, { curvatureRate: 0, planeRate: 0 }] };

  test('pushing straight into a wall is held at the allowed indentation, with force = stiffness × depth on the tip', () => {
    const contacts = contactQuery([wallMesh(60)]);
    let q = cath.initial();
    let last = cath.step(q, push, contacts, 0.05, ORIGIN);
    for (let i = 0; i < 200; i++) {
      last = cath.step(q, push, contacts, 0.05, ORIGIN);
      q = last.q;
    }
    const r = DEFAULT_CATHETER.outerDiameterMm / 2;
    expect(last.blocked).toBe(true);
    expect(q.insertMm).toBeLessThan(60 - r + DEFAULT_CATHETER.maxIndentMm + 0.05);
    expect(q.insertMm).toBeGreaterThan(60 - r + DEFAULT_CATHETER.maxIndentMm - 0.1);
    const deepest = last.contacts.reduce((a, c) => (c.depthMm > a.depthMm ? c : a));
    expect(deepest.depthMm).toBeLessThanOrEqual(DEFAULT_CATHETER.maxIndentMm + 1e-6);
    expect(deepest.forceN).toBeCloseTo(STIFFNESS_N_PER_MM.wall * deepest.depthMm, 9);
    expect(deepest.tissue).toBe('wall');
    expect(last.tipForceN).toBeGreaterThan(0);
  });

  test('pulling back clears the contact; no contact world means no contacts', () => {
    const contacts = contactQuery([wallMesh(60)]);
    const q = state(59, 0, [[0, 0], [0, 0]]); // tip 1 mm short of the wall, closer than its 1.65 mm radius
    expect(cath.step(q, idle(2), contacts, 0.05, ORIGIN).contacts.length).toBeGreaterThan(0);
    const back = cath.step(q, { ...push, insertRate: -20 }, contacts, 0.5, ORIGIN);
    expect(back.contacts).toHaveLength(0);
    expect(cath.step(q, push, null, 0.05, ORIGIN).contacts).toHaveLength(0);
  });

  test('a run counts each new contact with a tissue as one event, and keeps the peak force', () => {
    const sim = new AccessSim(cath, makePort([0, 0, -10], [0, 0, 100], 5, { protrusionMm: 5 }), contactQuery([wallMesh(60)]));
    for (let i = 0; i < 100; i++) sim.tick(push, 0.05);
    for (let i = 0; i < 30; i++) sim.tick({ ...push, insertRate: -20 }, 0.05);
    for (let i = 0; i < 60; i++) sim.tick(push, 0.05);
    expect(sim.tissues.get('wall')!.events).toBe(2);
    expect(sim.tissues.get('wall')!.peakForceN).toBeCloseTo(STIFFNESS_N_PER_MM.wall * DEFAULT_CATHETER.maxIndentMm, 1);
    expect(sim.peakPortLoadN).toBeGreaterThan(0);
  });
});

describe('apical port', () => {
  const port = makePort([10, 20, 30], [10, 20, 130], 8);

  test('its tip, the device\'s base, sits past the wall and the protrusion, pointing at the target', () => {
    const b = portBase(port);
    expect(dist(b.p, [10, 20, 30 + 8 + port.protrusionMm])).toBeLessThan(1e-9);
    expect(b.R[8]!).toBeCloseTo(1, 12);
  });

  test('it moves with the heart: a rigid heart motion moves the port and the whole backbone with it', () => {
    const a = 0.3;
    const heart: M4 = [Math.cos(a), -Math.sin(a), 0, 4, Math.sin(a), Math.cos(a), 0, -2, 0, 0, 1, 7, 0, 0, 0, 1];
    const q = state(70, 0.2, [[0.02, 0.4], [0.04, -0.5]]);
    const still = cath.backbone(q, portBase(port));
    const moved = cath.backbone(q, portBase(port, heart));
    const apply = (p: V3): V3 => [heart[0]! * p[0] + heart[1]! * p[1] + heart[2]! * p[2] + heart[3]!, heart[4]! * p[0] + heart[5]! * p[1] + heart[6]! * p[2] + heart[7]!, heart[8]! * p[0] + heart[9]! * p[1] + heart[10]! * p[2] + heart[11]!];
    still.pts.forEach((p, i) => expect(dist(apply(p), moved.pts[i]!)).toBeLessThan(1e-9));
  });

  test('load: none without contact; with contact, the summed contact force and its moment about the puncture', () => {
    expect(portLoad(port, []).totalN).toBe(0);
    const c = { s: 10, at: [10, 30, 60] as V3, wall: [10, 31, 60] as V3, normal: [0, -1, 0] as V3, depthMm: 2, tissue: 'wall' as const, forceN: 0.2 };
    const l = portLoad(port, [c, { ...c, at: [10, 30, 50] }]);
    expect(l.forceN).toBeCloseTo(0.4, 12);
    // Each 0.2 N force in −y acts at 10 mm off-axis in y... the lever is the offset from the puncture point.
    const m = (at: V3) => Math.abs((at[2] - 30) * -0.2);
    expect(l.momentNmm).toBeCloseTo(m([10, 30, 60]) + m([10, 30, 50]), 9);
  });

  test('tilt is held to its limit, and its wall load grows with it', () => {
    let p = port;
    for (let i = 0; i < 100; i++) p = tiltPort(p, { tiltRate: [1, 1] }, 0.1);
    expect(Math.hypot(...p.tilt)).toBeCloseTo(MAX_TILT_RAD, 12);
    expect(portLoad(p, []).tiltLoadN).toBeCloseTo(TILT_STIFFNESS_N_PER_RAD * MAX_TILT_RAD, 12);
    // A tilted port points the device elsewhere, pivoting at the puncture point.
    expect(dist(portBase(p).p, p.puncture)).toBeCloseTo(dist(portBase(port).p, port.puncture), 9);
  });
});

export { arc, compose };
