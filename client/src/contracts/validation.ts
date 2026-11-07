/**
 * Validation results — spec §3.5. Placeholder from D0a: names only, bodies filled in D0b.
 */

/** Which §3.5 check produced a result. Filled in D0b. */
export type ValidationCheckId = string;

/** Filled in D0b. */
export type ValidationSeverity = string;

/** An offered fix (rescale, flip axes, decimate). Filled in D0b. */
export interface ValidationFix {}

/** One check's outcome: id, severity, message, offered fix. Filled in D0b. */
export interface ValidationResult {}
