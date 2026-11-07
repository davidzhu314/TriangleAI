/**
 * Recorded CathSim runs — spec §4.4, §4.6. Producer: David (D4, physics/). Consumer: Vaibhav's optimizer and drive score.
 *
 * Real or absent (DECISIONS.md): with no real runs, the §4.4 arch-only constraint and the two
 * simulated measures are dropped. A mock of this type is a test fixture only and never feeds the app.
 */
import type { WirePresetId } from './optimizer';
import type { PhantomId, PhantomTargetId } from './physics-protocol';

export const RECORDED_RUNS_SCHEMA = 'threadsim.recorded-runs/1';

/** Stats for one phantom × target × preset. */
export interface RecordedRunStats {
  phantom: PhantomId;
  target: PhantomTargetId;
  presetId: WirePresetId;
  /** Number of runs recorded. */
  runs: number;
  /** Runs that reached the target. */
  successes: number;
  /** successes / runs, 0..1. */
  successRate: number;
  /** Median over runs of each run's peak wall contact force, newtons. */
  peakForceN: number;
  /** Median over runs of the time integral of contact force, newton-seconds (drive gentleness, §6.2). */
  cumulativeForceNs: number;
  /** At least one run reached the target. False removes the pair on the arch segment (§4.4). */
  reached: boolean;
}

/** A replay file of wire frames (not meshes) for replay mode. */
export interface RecordedReplayRef {
  phantom: PhantomId;
  target: PhantomTargetId;
  presetId: WirePresetId;
  /** Path under physics/, served by the physics process. */
  file: string;
}

/** physics/recorded-runs.json. */
export interface RecordedRuns {
  schema: typeof RECORDED_RUNS_SCHEMA;
  /** CathSim version or commit the runs came from. */
  cathsim: string;
  /** Simulated seconds per control step (0.012 for CathSim's defaults). */
  stepS: number;
  stats: RecordedRunStats[];
  replays: RecordedReplayRef[];
}
