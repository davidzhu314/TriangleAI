/**
 * Wire source — spec §5.1–5.3, built from physics-protocol.ts (§5.2) and events.ts (§5.6).
 *
 * Rail (Vaibhav), physics and replay (David) all implement `WireSource`. Screens get one from
 * `client/src/wire/select.ts` and never import a concrete source. Every source writes the same
 * `EventLog` in simulation time. Positions are metres in the loaded case's Y-up frame.
 */
import type { LoadedCase } from './case';
import type { EventLog, Vec3, WireMode } from './events';

export type { WireMode } from './events';

/** select.ts falls back to rail when the physics socket fails or stalls this long (spec §5.7). */
export const WIRE_STALL_TIMEOUT_MS = 2000;

/** Dead zone applied to gamepad and XR sticks before they reach `control` (spec §5.4). */
export const STICK_DEAD_ZONE = 0.15;

/**
 * One control frame from the player (spec §5.4).
 * `push` and `rotate` are each −1..1. Fluoro and contrast travel with the controls because the
 * source writes them into the event log (`EventSample.fluoro`, the `contrast_puff` event).
 */
export interface ControlInput {
  /** Push (+) / pull (−), −1..1. */
  push: number;
  /** Rotate, −1..1. */
  rotate: number;
  /** Fluoro is held on. Hold-to-activate. */
  fluoro: boolean;
  /** True on the one frame the player triggers a contrast puff. */
  contrastPuff?: boolean;
}

/** What to drive. Built by the Drive screen from the case and the chosen route. */
export interface WireStartRequest {
  case: LoadedCase;
  entryId: string;
  targetId: string;
  /** Wire preset id (spec §4.3). */
  presetId: string;
  /** Planned path, entry to target, as centerline edge ids. */
  path: string[];
}

/** The wire as the renderer draws it, emitted by every source at about 30 Hz. */
export interface WireState {
  mode: WireMode;
  /** Simulation time, seconds. */
  t: number;
  /** Wire body points, base to tip, metres. Physics sends 80; rail chooses its own count. */
  wire: Vec3[];
  /** Tip position, metres. */
  tip: Vec3;
  /** Arc-length position of the tip along the planned path, metres. */
  s: number;
  /** Centerline edge the tip is on. */
  edge: string;
  /** Tip roll angle φ in radians (rail mode, spec §5.3); absent when the source does not model it. */
  rollRad?: number;
  /** Wall contact force, newtons (a proxy in rail mode). */
  contactForceN: number;
  /** Fluoro is on. */
  fluoro: boolean;
  atTarget: boolean;
}

export type WireFallbackReason = 'socket_failed' | 'socket_stalled' | 'server_unavailable';

/** Fired by select.ts when it swaps a physics or replay source for rail. The UI shows a notice. */
export interface WireFallback {
  from: Exclude<WireMode, 'rail'>;
  to: 'rail';
  reason: WireFallbackReason;
  /** Simulation time at the switch, seconds. */
  t: number;
}

export type Unsubscribe = () => void;

export interface WireSource {
  readonly mode: WireMode;
  /** Prepare and begin a drive. Resolves when the first state is ready. */
  start(request: WireStartRequest): Promise<void>;
  /** Send one control frame. Values outside −1..1 are clamped. */
  control(input: ControlInput): void;
  /** End the drive and return its complete event log. */
  stop(): Promise<EventLog>;
  /** Subscribe to wire state at about 30 Hz. */
  onState(listener: (state: WireState) => void): Unsubscribe;
  /** Subscribe to fallback notices. Rail sources never fire it. */
  onFallback(listener: (fallback: WireFallback) => void): Unsubscribe;
}
