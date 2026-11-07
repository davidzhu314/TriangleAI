/**
 * Physics WebSocket protocol — spec §5.2, exactly.
 *
 * The browser talks to the localhost physics process (CathSim on MuJoCo) at `/wire`.
 * The client sends `start`, `control` and `stop`; the server replies with `state` at about 30 Hz.
 * Nothing in client/ imports CathSim code; this file is the whole boundary.
 *
 * Producer and consumer: David (physics/ server and client/src/wire/physics*).
 */
import type { Vec3 } from './events';

/** WebSocket path on the physics process. */
export const PHYSICS_WS_PATH = '/wire';

/** Approximate rate at which the server sends `state`. */
export const PHYSICS_STATE_HZ = 30;

/** CathSim's guidewire is 80 linked capsule bodies; `state.wire` has one point per body. */
export const PHYSICS_WIRE_POINTS = 80;

/** The four CathSim arch phantoms (spec §3.3). */
export type PhantomId = 'low_tort' | 'phantom2' | 'phantom3' | 'phantom4';

/** Each phantom has two target sites: brachiocephalic artery and left common carotid. */
export type PhantomTargetId = 'bca' | 'lcca';

// ---------------------------------------------------------------- client -> server

export interface PhysicsStartMessage {
  type: 'start';
  phantom: PhantomId;
  target: PhantomTargetId;
  /** Wire preset id, e.g. "standard_j" (presets are defined in optimizer.ts, spec §4.3). */
  preset: string;
}

export interface PhysicsControlMessage {
  type: 'control';
  /** Push (+) / pull (−), −1..1. */
  push: number;
  /** Rotate the whole wire, −1..1. */
  rotate: number;
}

export interface PhysicsStopMessage {
  type: 'stop';
}

export type PhysicsClientMessage = PhysicsStartMessage | PhysicsControlMessage | PhysicsStopMessage;

// ---------------------------------------------------------------- server -> client

export interface PhysicsStateMessage {
  type: 'state';
  /** Simulation time in seconds (sum of dt steps), never wall-clock. */
  t: number;
  /**
   * The 80 wire body positions, base to tip. Metres, in the Y-up frame of the case package the
   * physics process serves for this phantom, so the client draws them without transforming.
   */
  wire: Vec3[];
  /** Tip position, same frame as `wire`. */
  tip: Vec3;
  /** Total wall contact force on the wire, newtons. */
  contact_force_n: number;
  at_target: boolean;
}

export type PhysicsServerMessage = PhysicsStateMessage;

// ---------------------------------------------------------------- runtime guards

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isVec3(v: unknown): v is Vec3 {
  return Array.isArray(v) && v.length === 3 && v.every(isFiniteNumber);
}

/** True when `v` is a well-formed `state` message. Use on every parsed server frame. */
export function isPhysicsStateMessage(v: unknown): v is PhysicsStateMessage {
  if (typeof v !== 'object' || v === null) return false;
  const m = v as Record<string, unknown>;
  return (
    m['type'] === 'state' &&
    isFiniteNumber(m['t']) &&
    Array.isArray(m['wire']) &&
    m['wire'].every(isVec3) &&
    isVec3(m['tip']) &&
    isFiniteNumber(m['contact_force_n']) &&
    typeof m['at_target'] === 'boolean'
  );
}

/** Clamp a control value into −1..1. Non-finite input becomes 0. */
export function clampControl(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(-1, Math.min(1, x));
}
