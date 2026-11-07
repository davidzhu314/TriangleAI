/**
 * Event log — spec §5.6. The input to scoring (spec §6).
 *
 * Every wire source (rail, physics, replay) writes this same log. Time is simulation time in
 * seconds (accumulated dt), never wall-clock, so replaying a log gives identical scores (§6.6).
 * Positions and arc lengths are metres in the loaded case's Y-up frame (the units rule in PLAN.md).
 *
 * Producers: rail and physics/replay sources. Consumer: Vaibhav's scoring.
 */
import type { WirePresetId } from './optimizer';

/** A 3D point [x, y, z]. After load: metres, Y-up. Stored case files: mm, RAS (see case.ts). */
export type Vec3 = [number, number, number];

export const EVENT_LOG_SCHEMA = 'threadsim.eventlog/1';

/** Samples are recorded at 30 Hz of simulation time. */
export const EVENT_SAMPLE_HZ = 30;

/** A back_out event fires when s decreases by more than 20 mm (spec §5.6). */
export const BACK_OUT_THRESHOLD_M = 0.02;

/** Which kind of source wrote the log. */
export type WireMode = 'physics' | 'rail' | 'replay';

/** One 30 Hz sample. */
export interface EventSample {
  /** Simulation time, seconds. */
  t: number;
  /** Tip position, metres. */
  tip: Vec3;
  /** Arc-length position of the tip along the planned path from the entry, metres. */
  s: number;
  /** Id of the centerline edge the tip is on. */
  edge: string;
  /** Wall contact force, newtons (a proxy in rail mode, spec §5.3). */
  forceN: number;
  /** Fluoro held on during this sample. */
  fluoro: boolean;
}

interface EventBase {
  /** Simulation time, seconds. */
  t: number;
}

/** The tip entered an edge that is not on the planned path. */
export interface WrongBranchEvent extends EventBase {
  kind: 'wrong_branch';
  /** Edge the tip entered. */
  edge: string;
  /** Edge the plan expected next. */
  expectedEdge: string;
}

/** The wire bowed into the larger vessel (scripted in rail mode, spec §5.3). */
export interface ProlapseEvent extends EventBase {
  kind: 'prolapse';
  edge: string;
}

/** s decreased by more than BACK_OUT_THRESHOLD_M. */
export interface BackOutEvent extends EventBase {
  kind: 'back_out';
  /** s before the pull-back, metres. */
  fromS: number;
  /** s after the pull-back, metres. */
  toS: number;
}

/** Contact force rose above the threshold. The threshold belongs to scoring and is recorded here. */
export interface ForceSpikeEvent extends EventBase {
  kind: 'force_spike';
  forceN: number;
  thresholdN: number;
}

export interface ContrastPuffEvent extends EventBase {
  kind: 'contrast_puff';
}

export interface TargetReachedEvent extends EventBase {
  kind: 'target_reached';
  /** Target id from case.json. */
  target: string;
}

export type WireEvent =
  | WrongBranchEvent
  | ProlapseEvent
  | BackOutEvent
  | ForceSpikeEvent
  | ContrastPuffEvent
  | TargetReachedEvent;

export type WireEventKind = WireEvent['kind'];

export const WIRE_EVENT_KINDS: readonly WireEventKind[] = [
  'wrong_branch',
  'prolapse',
  'back_out',
  'force_spike',
  'contrast_puff',
  'target_reached',
];

/** A complete drive. Scoring reads only this. */
export interface EventLog {
  schema: typeof EVENT_LOG_SCHEMA;
  mode: WireMode;
  caseId: string;
  entryId: string;
  targetId: string;
  presetId: WirePresetId;
  /** Planned path, entry to target, as centerline edge ids. */
  path: string[];
  /** Sample rate the samples were written at; EVENT_SAMPLE_HZ. */
  sampleHz: number;
  /** Ordered by t. */
  samples: EventSample[];
  /** Ordered by t. */
  events: WireEvent[];
}

/** An empty log for a new drive. */
export function createEventLog(
  header: Pick<EventLog, 'mode' | 'caseId' | 'entryId' | 'targetId' | 'presetId' | 'path'>,
): EventLog {
  return {
    schema: EVENT_LOG_SCHEMA,
    ...header,
    path: [...header.path],
    sampleHz: EVENT_SAMPLE_HZ,
    samples: [],
    events: [],
  };
}
