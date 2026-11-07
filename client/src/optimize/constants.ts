/**
 * Engine constants. Units are in the names.
 *
 * ILLUSTRATIVE values (labelled so in the UI, spec §4.3 and §11): the fluoro-time coefficients are
 * teaching values, not clinical estimates. DECISIONS.md, "Estimated fluoro time", records them.
 */

/** Proximity penalty scale (spec §4.6): Σ max(0, 1 − clearance / 10 mm). */
export const PROXIMITY_SCALE_M = 0.01;

/** Estimated fluoro time (spec §4.6), seconds per cm of route length. Illustrative. */
export const FLUORO_S_PER_CM = 1;

/**
 * Estimated fluoro time, seconds per turn, where a turn is 90° of the route's total turning
 * (ΘΣ / 90°). Illustrative.
 */
export const FLUORO_S_PER_TURN = 3;

/** Degrees of total turning that count as one turn in the fluoro estimate. */
export const DEG_PER_TURN = 90;
