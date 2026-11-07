/**
 * Scoring constants (spec §6). The weights, penalties, star thresholds and caps are the spec's own.
 * The gentleness and radiation curves and the budget's star cost fill gaps the spec leaves, and are
 * illustrative (DECISIONS.md, "Gentleness and radiation curves", "Stars and radiation budget").
 */

/** §6.2 drive weights. */
export const DRIVE_WEIGHTS = { fidelity: 0.25, gentleness: 0.3, radiation: 0.25, errors: 0.2 } as const;

/** §6.2 path fidelity: mean distance at which the score reaches 0, m. */
export const FIDELITY_ZERO_M = 0.01;

/** §6.2 error penalties, points per event. */
export const ERROR_PENALTY = { wrongBranch: 10, prolapse: 15, backOut: 5 } as const;

/** §6.1 caps by deciding check. */
export const PLAN_CAPS = { feasible: 0, heavy_crossings: 40, frontier: 80, regret: 100 } as const;

/** §6.3 star thresholds: [plan, drive]. */
export const STARS_TWO = { plan: 70, drive: 60 } as const;
export const STARS_THREE = { plan: 85, drive: 85 } as const;

/** Gentleness (illustrative): the score falls to 0 at reference + SPAN × max(reference, floor). */
export const GENTLENESS_SPAN = 2;
export const GENTLENESS_FLOOR_N = 0.1;
export const GENTLENESS_FLOOR_NS = 0.1;

/** Radiation (illustrative): the score falls to 0 at ZERO_FACTOR × the route's estimate. */
export const RADIATION_ZERO_FACTOR = 2;

/** §6.5 radiation budget (illustrative): stars lost when over the allowance; never below 1 if reached. */
export const BUDGET_STAR_COST = 1;

/** The gentleness reference drive stops after this much simulation time, s. */
export const REFERENCE_MAX_S = 300;

/** §6.5 unlock ladder (illustrative): a case with no arch type and tortuosity at or below this is the low-tortuosity tier. */
export const LOW_TORTUOSITY_MAX = 0.3;
