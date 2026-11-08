/**
 * Wire source — spec §5.1–5.3, built from physics-protocol.ts (§5.2) and events.ts (§5.6).
 *
 * Rail (Vaibhav), physics and replay (David) all implement `WireSource`. Screens get one from
 * `client/src/wire/select.ts` and never import a concrete source. Every source writes the same
 * `EventLog` in simulation time. Positions are metres in the loaded case's Y-up frame.
 */
import type { LoadedCase } from './case';
import type { DeviceId, EventLog, Vec3, WireMode } from './events';
import type { WirePresetId } from './optimizer';

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
  /** True on the one frame the player triggers a contrast puff, false otherwise. */
  contrastPuff: boolean;
  // v3, optional; sources that don't model them ignore them:
  /** Which device push and rotate move (chain source). */
  device?: DeviceId;
  /** Fluoro pulse-rate preset (chain source). */
  pulse?: PulseRate;
  /** True on the one frame the player stores a roadmap (chain source). */
  storeRoadmap?: boolean;
}

/** v3: fluoro pulse-rate presets: continuous 30 frames/s, pulsed 15/s or 7.5/s. */
export type PulseRate = 'continuous' | 'p15' | 'p7_5';

/** v3: the tip as a pose. */
export interface WireTipPose {
  /** Unit tangent of the last link: where the tip points. */
  tangent: Vec3;
  /** Curvature at the tip, 1/m. */
  curvature: number;
  tipRollRad: number;
  hubRollRad: number;
  leading: DeviceId;
}

/** v3: both devices as drawn. */
export interface WireDevices {
  wire: Vec3[];
  catheter: Vec3[];
  insertedM: Record<DeviceId, number>;
  active: DeviceId;
}

/** v3: one place pressing on the wall (illustrative load proxy, N). */
export interface WireContact {
  node: number;
  edge: string;
  loadN: number;
}

/** v3: imaging state and its cost. Units are simulated: exposure is not a dose, contrast is not millilitres. */
export interface WireImaging {
  held: boolean;
  pulse: PulseRate;
  /** Capture time of the newest live frame while fluoro is held. */
  liveFrameT: number | null;
  /** Capture time of the last-image-hold, and whether the device has moved since. */
  holdImageT: number | null;
  holdStale: boolean;
  /** Capture time of the stored roadmap. */
  roadmapT: number | null;
  totals: { fluoroS: number; activations: number; frames: number; exposureUnits: number; contrastInjections: number; contrastUnits: number; roadmaps: number };
}

/** What to drive. Built by the Drive screen from the case and the chosen route. */
export interface WireStartRequest {
  case: LoadedCase;
  entryId: string;
  targetId: string;
  /** Wire preset id (spec §4.3). */
  presetId: WirePresetId;
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
  // v3, optional (chain source):
  tipPose?: WireTipPose;
  devices?: WireDevices;
  contacts?: WireContact[];
  /** Educational contact-risk index, 0..100. Not a clinical force or an injury prediction. */
  riskIndex?: number;
  imaging?: WireImaging;
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
