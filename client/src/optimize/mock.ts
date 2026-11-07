/**
 * V1 MOCK optimizer, for fixture-y only. Aroovee builds the Plan and Compare screens on it until V3.
 *
 * - `left_branch` returns a fixed three-route Frontier. fixture-y has a single path to the left
 *   branch, so the three routes are the three presets over the same edges. Their cost vectors are
 *   PLACEHOLDER VALUES chosen to give the UI three distinct, mutually non-dominated routes, one per
 *   label. They are not measurements, and V3 replaces them with the real optimizer.
 * - `right_branch` returns NoSafeRoute. This one matches fixture-y's geometry: the only path
 *   crosses the heavy zone `plaque_r` on `e_right`, and no entry or preset change avoids it.
 *
 * No recorded runs feed this mock: `recordedRunsUsed` is false and the two simulated measures are
 * absent (DECISIONS.md, "Recorded runs are real or absent").
 */

import type { CostVector, FrontierRoute, OptimizeRequest, OptimizeResult, Route, RouteLabel, WirePresetId } from '../contracts';

export const MOCK_CASE_ID = 'fixture-y';

const ENTRY = 'fem_r';
const LEFT_EDGES = ['e_aorta', 'e_left'];
const LEFT_NODES = ['n_entry', 'n_split', 'n_left'];

/** Placeholder cost vectors (see the header). Lengths in metres, angles in degrees, time in seconds. */
const PLACEHOLDER_COSTS: Record<WirePresetId, CostVector> = {
  standard_j: {
    lengthM: 0.15,
    sharpestTurnDeg: 45,
    totalTurningDeg: 45,
    narrowestRadiusM: 0.0035,
    heavyCrossings: 0,
    proximityPenalty: 0,
    estFluoroS: 31,
  },
  soft_angled: {
    lengthM: 0.158,
    sharpestTurnDeg: 38,
    totalTurningDeg: 40,
    narrowestRadiusM: 0.0035,
    heavyCrossings: 0,
    proximityPenalty: 0,
    estFluoroS: 33,
  },
  stiff_straight: {
    lengthM: 0.153,
    sharpestTurnDeg: 47,
    totalTurningDeg: 46,
    narrowestRadiusM: 0.0035,
    heavyCrossings: 0,
    proximityPenalty: 0,
    estFluoroS: 28,
  },
};

const LABELS: Record<WirePresetId, RouteLabel[]> = {
  standard_j: ['shortest'],
  soft_angled: ['gentlest'],
  stiff_straight: ['least_radiation'],
};

const PRESET_ORDER: WirePresetId[] = ['standard_j', 'soft_angled', 'stiff_straight'];

export function mockRouteId(presetId: WirePresetId, edges: readonly string[] = LEFT_EDGES, entryId = ENTRY): string {
  return `${entryId}|${presetId}|${edges.join(',')}`;
}

function leftRoute(presetId: WirePresetId): Route {
  return {
    id: mockRouteId(presetId),
    entryId: ENTRY,
    targetId: 'left_branch',
    presetId,
    edges: [...LEFT_EDGES],
    nodes: [...LEFT_NODES],
    feasible: true,
    cost: { ...PLACEHOLDER_COSTS[presetId] },
    violations: [],
    crossings: [],
    // the sharpest turn is the takeoff into the left branch
    sharpestTurnEdge: 'e_left',
  };
}

/** Synchronous mock result. Returns fresh objects on every call, so callers may mutate them. */
export function mockOptimizeSync(request: OptimizeRequest): OptimizeResult {
  if (request.caseId !== MOCK_CASE_ID) {
    // the marker literal must stay in a string the bundle keeps (build guard test)
    throw new Error(`[THREADSIM_MOCK_OPTIMIZER] mock optimizer only knows ${MOCK_CASE_ID}, got ${request.caseId}`);
  }
  const presets = PRESET_ORDER.filter((p) => !request.presetIds || request.presetIds.includes(p));
  const entryOk = !request.entryIds || request.entryIds.includes(ENTRY);

  if (request.targetId === 'left_branch' && entryOk && presets.length > 0) {
    const routes: FrontierRoute[] = presets.map((p) => ({ ...leftRoute(p), labels: [...LABELS[p]] }));
    return {
      kind: 'frontier',
      caseId: MOCK_CASE_ID,
      targetId: 'left_branch',
      minHeavyCrossings: 0,
      routes,
      candidates: presets.map(leftRoute),
      recordedRunsUsed: false,
    };
  }
  if (request.targetId === 'right_branch') {
    return {
      kind: 'no_safe_route',
      caseId: MOCK_CASE_ID,
      targetId: 'right_branch',
      reasons: [],
      crossings: [{ zone: 'plaque_r', tier: 'heavy', edge: 'e_right' }],
      suggestion: null,
    };
  }
  throw new Error(`[THREADSIM_MOCK_OPTIMIZER] mock optimizer has no answer for target ${request.targetId} with these entries and presets`);
}

/** Async like the real Worker-backed optimizer will be (V3). */
export async function mockOptimize(request: OptimizeRequest): Promise<OptimizeResult> {
  return mockOptimizeSync(request);
}
