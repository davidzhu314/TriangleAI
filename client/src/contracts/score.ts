/**
 * Scoring — spec §6. Producer: Vaibhav (client/src/score/). Consumer: Aroovee's Results screen and tooltips.
 *
 * Scores are computed only from an EventLog and the optimizer's output, never by an AI model, and
 * replaying the same log gives identical scores (§6.6). Every number the UI shows carries a FormulaRef
 * for its tooltip.
 */
import type { ConstraintViolation, MeasureKey } from './optimizer';

/** Formula ids for tooltips. The UI maps each to its formula text. */
export type FormulaRef =
  | 'measure.length'
  | 'measure.sharpest_turn'
  | 'measure.total_turning'
  | 'measure.narrowest'
  | 'measure.heavy_crossings'
  | 'measure.proximity'
  | 'measure.est_fluoro'
  | 'measure.sim_peak_force'
  | 'measure.sim_success_rate'
  | 'rank.weighted'
  | 'plan.feasible'
  | 'plan.heavy_cap'
  | 'plan.frontier_cap'
  | 'plan.regret'
  | 'drive.fidelity'
  | 'drive.gentleness'
  | 'drive.radiation'
  | 'drive.errors'
  | 'drive.total'
  | 'result.stars'
  | 'result.fluoro_budget';

// ---------------------------------------------------------------- plan score (§6.1)

/** The first failing check caps the score; 'regret' means all caps passed. */
export type PlanCheck = 'feasible' | 'heavy_crossings' | 'frontier' | 'regret';

export interface PlanScore {
  /** 0..100. */
  score: number;
  /** Which check set the score. */
  decidedBy: PlanCheck;
  /** The cap in force: 0, 40, 80 or 100. */
  cap: number;
  /** Set when decidedBy is 'feasible'. */
  violations: ConstraintViolation[];
  /** Set when decidedBy is 'heavy_crossings': the zone crossed and a safer route. */
  zoneCrossed?: string;
  saferRouteId?: string;
  /** Set when decidedBy is 'frontier'. */
  dominatedByRouteId?: string;
  /** R = S(player) − min S. */
  regret: number;
  /** Regret of the worst feasible route. */
  regretMax: number;
  /** The single measure that contributed most to R. */
  topContributor?: { measure: MeasureKey; edge?: string; value: number };
}

// ---------------------------------------------------------------- drive score (§6.2)

export interface DriveComponent {
  /** 0..100. */
  score: number;
  /** Share of the drive score, 0..1. */
  weight: number;
  formulaRef: FormulaRef;
}

export interface DriveScore {
  /** 0..100, weighted sum of the components. */
  score: number;
  fidelity: DriveComponent & { /** Mean tip distance to the planned centerline, m. */ meanDistanceM: number };
  gentleness: DriveComponent & { peakForceN: number; cumulativeForceNs: number };
  radiation: DriveComponent & { fluoroS: number; estFluoroS: number };
  errors: DriveComponent & { wrongBranches: number; prolapses: number; backOuts: number };
  /** Simulation seconds to the target. Shown, never scored. */
  timeS: number;
}

// ---------------------------------------------------------------- result (§6.3–6.5)

export type Stars = 0 | 1 | 2 | 3;

/** A feedback sentence from a template filled with computed values (§6.4). */
export interface FeedbackLine {
  /** Template id. */
  template: string;
  /** The filled sentence. Every number in it appears in `values`. */
  text: string;
  values: Record<string, number | string>;
  formulaRef: FormulaRef;
}

export interface CaseResult {
  caseId: string;
  routeId: string;
  reachedTarget: boolean;
  plan: PlanScore;
  drive: DriveScore;
  /** After the radiation budget (§6.5). */
  stars: Stars;
  /** Stars before the radiation budget took any away. */
  starsBeforeBudget: Stars;
  /** Fluoro seconds over the case's allowance; 0 when within it or when the case has none. */
  fluoroOverBudgetS: number;
  /** Top lines first. */
  feedback: FeedbackLine[];
}
