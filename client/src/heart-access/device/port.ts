/**
 * The apical port: a rigid sheath through the LV wall near the apex. It is the device's base: the device leaves its
 * tip, inside the cavity. It is a pivot that moves with the heart, so its pose is recomputed from the heart's motion
 * each frame (a rigid 4×4 in RAS mm; identity while the heart is static).
 *
 * Load on the apex, the main injury the brief asks to watch: the port holds the device, so it carries the sum of the
 * contact forces on the device (quasi-static), plus their moment about the puncture point, plus any load from
 * tilting the port if a robot holds it. All reported in N (and N·mm for the moment). Peak load is tracked per run.
 */
import { add, cross, dist, norm, scale, sub, unit, type M4, type V3 } from '../geometry';
import { forceVector } from './contact';
import { column, frameAlong, m3mul, m3v } from './frames';
import type { Contact, M3, Pose } from './types';

/** [ASSUMPTION] Sheath outer diameter, mm (docs/ASSUMPTIONS.md row 9): 8 mm, the Apex plan's illustrative sheath. */
export const SHEATH_OUTER_DIAMETER_MM = 8;
/** [ASSUMPTION] How far the sheath tip sits inside the cavity past the inner wall, mm. */
export const PORT_PROTRUSION_MM = 5;
/** [ASSUMPTION] Largest tilt a robot may give the port, rad (15°). */
export const MAX_TILT_RAD = (15 * Math.PI) / 180;
/** [ASSUMPTION] Wall load per radian of port tilt, N/rad. */
export const TILT_STIFFNESS_N_PER_RAD = 3;

export interface ApicalPort {
  /** Puncture point on the LV's outer wall, RAS mm. */
  puncture: V3;
  /** Unit direction into the LV (toward the target), before tilt. */
  axis: V3;
  /** Wall thickness at the puncture (the shortest way through), mm. */
  wallMm: number;
  /** How far the port's axis travels through the wall to the cavity, mm. Longer than wallMm when it goes in at a slant. */
  throughWallMm: number;
  protrusionMm: number;
  sheathOuterDiameterMm: number;
  /** Tilt about the port frame's x and y axes, rad. */
  tilt: [number, number];
  maxTiltRad: number;
}

export interface PortCommand {
  /** Tilt rates about the port frame's x and y, rad/s. */
  tiltRate: [number, number];
}

export interface PortLoad {
  /** Force the device puts on the port, N (vector and size). */
  force: V3;
  forceN: number;
  /** Moment of the contact forces about the puncture point, N·mm. */
  momentNmm: number;
  /** Wall load from the port's tilt, N. */
  tiltLoadN: number;
  /** forceN + tiltLoadN. */
  totalN: number;
}

/**
 * @param throughWallMm  how far the axis runs through the wall (throughWall() measures it on the cavity mesh); the
 *                       wall thickness when not given
 */
export function makePort(puncture: V3, target: V3, wallMm: number, opts: Partial<Pick<ApicalPort, 'protrusionMm' | 'sheathOuterDiameterMm' | 'maxTiltRad' | 'throughWallMm'>> = {}): ApicalPort {
  return {
    puncture,
    axis: unit(sub(target, puncture)),
    wallMm,
    throughWallMm: opts.throughWallMm ?? wallMm,
    protrusionMm: opts.protrusionMm ?? PORT_PROTRUSION_MM,
    sheathOuterDiameterMm: opts.sheathOuterDiameterMm ?? SHEATH_OUTER_DIAMETER_MM,
    tilt: [0, 0],
    maxTiltRad: opts.maxTiltRad ?? MAX_TILT_RAD,
  };
}

const rotX = (a: number): M3 => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];
const rotYm = (a: number): M3 => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];

/** The port tip's pose: the device's base. `heart` is the heart's rigid motion this frame (RAS mm, row-major). */
export function portBase(port: ApicalPort, heart: M4 | null = null): Pose {
  const R0 = m3mul(m3mul(frameAlong(port.axis), rotX(port.tilt[0])), rotYm(port.tilt[1]));
  const tip = add(port.puncture, m3v(R0, [0, 0, port.throughWallMm + port.protrusionMm]));
  if (!heart) return { p: tip, R: R0 };
  const H: M3 = [heart[0]!, heart[1]!, heart[2]!, heart[4]!, heart[5]!, heart[6]!, heart[8]!, heart[9]!, heart[10]!];
  return { p: add(m3v(H, tip), [heart[3]!, heart[7]!, heart[11]!]), R: m3mul(H, R0) };
}

/** Where the puncture point is this frame. */
export function puncturePoint(port: ApicalPort, heart: M4 | null = null): V3 {
  if (!heart) return port.puncture;
  const p = port.puncture;
  return [heart[0]! * p[0] + heart[1]! * p[1] + heart[2]! * p[2] + heart[3]!, heart[4]! * p[0] + heart[5]! * p[1] + heart[6]! * p[2] + heart[7]!, heart[8]! * p[0] + heart[9]! * p[1] + heart[10]! * p[2] + heart[11]!];
}

/** Tilt the port by its commanded rates for dt; the tilt's size is held to maxTiltRad. */
export function tiltPort(port: ApicalPort, u: PortCommand, dt: number): ApicalPort {
  let tx = port.tilt[0] + u.tiltRate[0] * dt;
  let ty = port.tilt[1] + u.tiltRate[1] * dt;
  const m = Math.hypot(tx, ty);
  if (m > port.maxTiltRad) {
    tx *= port.maxTiltRad / m;
    ty *= port.maxTiltRad / m;
  }
  return { ...port, tilt: [tx, ty] };
}

export function portLoad(port: ApicalPort, contacts: readonly Contact[], heart: M4 | null = null): PortLoad {
  const pivot = puncturePoint(port, heart);
  let force: V3 = [0, 0, 0];
  let moment: V3 = [0, 0, 0];
  for (const c of contacts) {
    const f = forceVector(c);
    force = add(force, f);
    moment = add(moment, cross(sub(c.at, pivot), f));
  }
  const tiltLoadN = TILT_STIFFNESS_N_PER_RAD * Math.hypot(port.tilt[0], port.tilt[1]);
  const forceN = norm(force);
  return { force, forceN, momentNmm: norm(moment), tiltLoadN, totalN: forceN + tiltLoadN };
}

/** Angle between the port's current direction and its untilted axis, rad. */
export const portTiltAngle = (port: ApicalPort): number => Math.acos(Math.max(-1, Math.min(1, column(portBase(port).R, 2).reduce((s, v, i) => s + v * port.axis[i]!, 0))));

export { dist, scale };
