/**
 * Optimizer — spec §4.3–4.8. Producer: Vaibhav (client/src/optimize/). Consumer: Aroovee's Plan and Compare screens.
 *
 * Units: lengths in metres (display converts to cm or mm), angles in degrees, forces in newtons,
 * time in seconds. Field names carry their unit.
 */
import type { RiskTier } from './case';

// ---------------------------------------------------------------- presets (§4.3)

export type WirePresetId = 'soft_angled' | 'standard_j' | 'stiff_straight';

export type WireStiffness = 'low' | 'medium' | 'high';

/** Values are illustrative and the UI must label them so. */
export interface WirePreset {
  id: WirePresetId;
  name: string;
  tipAngleDeg: number;
  stiffness: WireStiffness;
  diameterM: number;
  /** Sharpest turn this preset can enter (§4.4). */
  maxTurnDeg: number;
  /** Narrowest vessel diameter this preset can pass (§4.4: device diameter + 1 mm clearance). */
  minVesselDiameterM: number;
  illustrative: true;
}

// ---------------------------------------------------------------- measures (§4.6)

/** One route's measures. The two simulated ones are present only with real recorded runs. */
export interface CostVector {
  /** Sum, metres (shown in cm). */
  lengthM: number;
  /** Max turning angle over a 5 mm window, degrees. */
  sharpestTurnDeg: number;
  /** Sum of turning angles, degrees. */
  totalTurningDeg: number;
  /** Min radius along the route, metres (shown in mm). */
  narrowestRadiusM: number;
  /** Count of heavy risk zones crossed. */
  heavyCrossings: number;
  /** Σ max(0, 1 − clearance / 10 mm) over proximity zones, unitless. */
  proximityPenalty: number;
  /** Length × s per cm + turns × s per turn, seconds. */
  estFluoroS: number;
  /** Arch segment, from recorded runs, newtons. Absent without real runs. */
  simPeakForceN?: number;
  /** Arch segment, from recorded runs, 0..1 (shown in %). Absent without real runs. */
  simSuccessRate?: number;
}

export type MeasureKey = keyof CostVector;

/** For each measure, whether lower is better. */
export const MEASURE_LOWER_IS_BETTER: Readonly<Record<MeasureKey, boolean>> = {
  lengthM: true,
  sharpestTurnDeg: true,
  totalTurningDeg: true,
  narrowestRadiusM: false,
  heavyCrossings: true,
  proximityPenalty: true,
  estFluoroS: true,
  simPeakForceN: true,
  simSuccessRate: false,
};

// ---------------------------------------------------------------- constraints (§4.4)

export type ConstraintViolation =
  | { kind: 'too_narrow'; edge: string; /** 2 × r_min, m. */ diameterM: number; /** Device diameter + clearance, m. */ requiredM: number }
  | { kind: 'turn_too_sharp'; edge: string; turnDeg: number; maxTurnDeg: number }
  | { kind: 'forbidden_zone'; edge: string; zone: string }
  | { kind: 'arch_never_reached'; presetId: WirePresetId; target: string };

// ---------------------------------------------------------------- routes

/** Where a route meets a risk zone. */
export interface ZoneCrossing {
  zone: string;
  tier: RiskTier;
  edge: string;
}

/** A route, or a partial route while the player builds it (measureRoute). */
export interface RouteMeasures {
  cost: CostVector;
  /** Empty when feasible. */
  violations: ConstraintViolation[];
  crossings: ZoneCrossing[];
  /** Edge holding the sharpest turn, for feedback ("the 120° turn at the left subclavian"). */
  sharpestTurnEdge: string | null;
}

export interface Route extends RouteMeasures {
  /** Stable id: `${entryId}|${presetId}|${edges.join(',')}`. */
  id: string;
  entryId: string;
  targetId: string;
  presetId: WirePresetId;
  /** Edge ids, entry to target. */
  edges: string[];
  /** Node ids, entry to target (edges.length + 1). */
  nodes: string[];
  feasible: boolean;
}

/** What a frontier route is best at (§4.7). */
export type RouteLabel =
  | 'shortest'
  | 'gentlest'
  | 'least_radiation'
  | 'widest'
  | 'farthest_from_risk'
  | 'lowest_force'
  | 'most_reliable';

export interface FrontierRoute extends Route {
  /** May be empty when a route is on the frontier without being best at any single measure. */
  labels: RouteLabel[];
}

// ---------------------------------------------------------------- frontier (§4.7)

export interface OptimizeRequest {
  caseId: string;
  targetId: string;
  /** Default: every entry in the case. */
  entryIds?: string[];
  /** Default: every preset. */
  presetIds?: WirePresetId[];
}

export interface Frontier {
  kind: 'frontier';
  caseId: string;
  targetId: string;
  /** Fewest heavy crossings among feasible routes; the frontier is taken among routes with this many. */
  minHeavyCrossings: number;
  /** Non-dominated routes. */
  routes: FrontierRoute[];
  /** Every enumerated route, feasible or not (Plan score needs them for regret and "dominated by"). */
  candidates: Route[];
  /** True only when real recorded runs supplied the simulated measures and the arch constraint. */
  recordedRunsUsed: boolean;
}

/** The change that would give a safe route (§4.7). */
export type RouteSuggestion =
  | { change: 'entry'; entryId: string }
  | { change: 'preset'; presetId: WirePresetId }
  | { change: 'entry_and_preset'; entryId: string; presetId: WirePresetId };

/** "No safe route with this device." */
export interface NoSafeRoute {
  kind: 'no_safe_route';
  caseId: string;
  targetId: string;
  /** Why the best candidates failed. */
  reasons: ConstraintViolation[];
  /** Heavy crossings that blocked otherwise feasible routes. */
  crossings: ZoneCrossing[];
  /** Null when no entry or preset change helps. */
  suggestion: RouteSuggestion | null;
}

export type OptimizeResult = Frontier | NoSafeRoute;

// ---------------------------------------------------------------- ranking (§4.8)

/** Player weights per measure, each 0..1, summing to 1. Measures left out weigh 0. */
export type Weights = Partial<Record<MeasureKey, number>>;

export interface RankedRoute {
  routeId: string;
  /** S(route) = Σ w_k ĉ_k, min–max normalised across candidates; lower is better. */
  s: number;
}

export interface Ranking {
  weights: Weights;
  /** Best first. */
  order: RankedRoute[];
}
