/**
 * The steerable-device interface for the access module (brief, "Device and physics model"). Every device sits behind
 * it, so a client's real design can replace the default without touching the rest:
 *
 *   config        lengths, segment count, stiffness, outer diameter, limits
 *   q             joint state: insertion, roll, per-segment bend (curvature, plane)
 *   backbone(q)   polyline of the device centreline, about 1 mm spacing
 *   jacobian(q)   tip velocity per joint velocity
 *   step(q, u, contacts, dt) -> q'   applies commands, limits and contact
 *
 * Units: mm, radians, seconds, newtons. Frame: the case's RAS millimetres. A "pose" is a position and a rotation
 * whose third column is the direction the device points.
 */
import type { V3 } from '../geometry';

/** Row-major 3×3; its columns are the frame's x, y and z axes in world coordinates. */
export type M3 = number[];

export interface Pose {
  p: V3;
  R: M3;
}

export interface SegmentConfig {
  lengthMm: number;
  /** Largest curvature, 1/mm (1 / smallest bend radius). */
  maxCurvature: number;
}

export interface DeviceConfig {
  name: string;
  outerDiameterMm: number;
  /** How far the device can go past the port tip, mm. */
  maxInsertMm: number;
  /** Bending segments, proximal first; the last is at the tip. */
  segments: SegmentConfig[];
  /** Command limits: insertion mm/s, roll rad/s, curvature 1/mm per s, bending plane rad/s. */
  maxInsertRate: number;
  maxRollRate: number;
  maxCurvatureRate: number;
  maxPlaneRate: number;
  /** Backbone sample spacing, mm. */
  sampleMm: number;
  /** Deepest the device may press into tissue before the step is held back, mm. */
  maxIndentMm: number;
}

export interface SegmentState {
  /** Curvature, 1/mm, 0 to the segment's maxCurvature. */
  curvature: number;
  /** Bending plane angle, rad, about the device axis from the frame's x axis. */
  plane: number;
}

export interface DeviceState {
  /** Length past the port tip, mm. */
  insertMm: number;
  /** Shaft roll, rad. */
  roll: number;
  segments: SegmentState[];
}

/** One frame of commands. The same commands come from a person (keys, hands) and from the autonomy layer. */
export interface DeviceCommand {
  insertRate: number;
  rollRate: number;
  segments: { curvatureRate: number; planeRate: number }[];
}

export interface Backbone {
  /** Centreline samples from the port tip to the device tip. */
  pts: V3[];
  /** Arc length of each sample from the port tip, mm. */
  s: number[];
  tip: Pose;
}

export type Tissue = 'wall' | 'leaflet' | 'chordae' | 'papillary' | 'septum';

export interface Contact {
  /** Arc length along the device where it touches, mm. */
  s: number;
  /** The device sample that touches. */
  at: V3;
  /** The closest tissue point. */
  wall: V3;
  /** Unit normal of the tissue surface there, pointing toward the side the device belongs on. */
  normal: V3;
  /** How far the device's surface is pressed into the tissue, mm (> 0). */
  depthMm: number;
  tissue: Tissue;
  /** Penalty force on the device, N: stiffness × depth, along the normal. */
  forceN: number;
}

/**
 * Finds the contacts of a backbone with the tissue around it. With `stopAboveMm`, it may stop at the first contact
 * deeper than that (callers that only need "too deep or not" pass it).
 */
export type ContactQuery = (backbone: Backbone, radiusMm: number, stopAboveMm?: number) => Contact[];

export interface StepResult {
  q: DeviceState;
  backbone: Backbone;
  contacts: Contact[];
  /** True when contact held the step back (the device did not move as far as commanded). */
  blocked: boolean;
  /** Share of the commanded step that was taken, 0 to 1. */
  taken: number;
  /** Sum of contact forces within TIP_ZONE_MM of the tip, N. */
  tipForceN: number;
}

export interface DeviceModel {
  readonly config: DeviceConfig;
  /** Joint order for jacobian(): insertion, roll, then curvature and plane per segment. */
  readonly joints: string[];
  initial(): DeviceState;
  backbone(q: DeviceState, base: Pose): Backbone;
  /** 3 × joints: tip velocity (mm/s) per unit joint velocity, numerically, at q. */
  jacobian(q: DeviceState, base: Pose): number[][];
  step(q: DeviceState, u: DeviceCommand, contacts: ContactQuery | null, dt: number, base: Pose): StepResult;
}

/** Contact forces this close to the tip count as tip force, mm. */
export const TIP_ZONE_MM = 5;
