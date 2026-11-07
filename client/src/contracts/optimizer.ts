/**
 * Optimizer — spec §4.3–4.8. Placeholder from D0a: names only, bodies filled in D0b.
 */

/** Wire preset (spec §4.3); values are illustrative. Filled in D0b. */
export interface WirePreset {}

/** One candidate route. Filled in D0b. */
export interface Route {}

/** The §4.6 measures; the two simulated ones are present only with real recorded runs. Filled in D0b. */
export interface CostVector {}

/** What a frontier route is best at (spec §4.7). Filled in D0b. */
export type RouteLabel = string;

/** The non-dominated set (spec §4.7). Filled in D0b. */
export interface Frontier {}

/** Player weights for display ranking (spec §4.8). Filled in D0b. */
export interface Weights {}

/** "No safe route with this device" plus a suggestion (spec §4.7). Filled in D0b. */
export interface NoSafeRoute {}
