/**
 * Gentleness reference (DECISIONS.md, "Gentleness reference without recorded runs"). §6.2 compares
 * force with the frontier route's recorded values; with no real recorded runs, the reference is the
 * rail autopilot driving that route, at the log's sample rate. Deterministic: the rail model is
 * pure and the autopilot has no randomness.
 */

import type { LoadedCase, WirePresetId } from '../contracts';
import { railAutopilot } from '../wire/rail-autopilot';
import { createRailModel, initialRailState, step } from '../wire/rail';
import { REFERENCE_MAX_S } from './constants';

export interface ForceReference {
  /** Route id the reference drove. */
  routeId: string;
  peakForceN: number;
  /** Σ F·Δt over the samples, N·s. */
  cumulativeForceNs: number;
  /** Whether the autopilot reached the target within REFERENCE_MAX_S. */
  reached: boolean;
}

export interface ReferenceRoute {
  id: string;
  entryId: string;
  targetId: string;
  presetId: WirePresetId;
  edges: readonly string[];
}

/** Drive `route` with the rail autopilot. Samples (initial one included) are summed as the log is. */
export function forceReference(c: LoadedCase, route: ReferenceRoute, sampleHz: number): ForceReference {
  const dt = 1 / sampleHz;
  const model = createRailModel(c, route.entryId, route.targetId, route.presetId, route.edges);
  let state = initialRailState(model);
  let peak = state.forceN;
  let cum = state.forceN * dt;
  const maxSteps = Math.ceil(REFERENCE_MAX_S * sampleHz);
  for (let i = 0; i < maxSteps && !state.atTarget; i++) {
    state = step(model, state, railAutopilot(model, state, dt), dt).state;
    if (state.forceN > peak) peak = state.forceN;
    cum += state.forceN * dt;
  }
  return { routeId: route.id, peakForceN: peak, cumulativeForceNs: cum, reached: state.atTarget };
}
