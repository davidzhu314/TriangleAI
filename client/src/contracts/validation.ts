/**
 * Validation results — spec §3.5. Producer: David's loader (client/src/case/). Consumer: Aroovee's import UI and Library.
 *
 * The client validates every package in the browser and never uploads it.
 */
import type { LoadedCase } from './case';

/** One id per row of the §3.5 table. */
export type ValidationCheckId =
  | 'schema'
  | 'units'
  | 'axes'
  | 'graph'
  | 'radii'
  | 'mesh_budget'
  | 'privacy'
  | 'physics';

/**
 * error: the case is rejected (schema).
 * warning: the case loads with something flagged or dropped, or a fix is offered (units, axes,
 *   graph gaps, rejected edges, decimation, planning only).
 * notice: logged silently (privacy strip).
 */
export type ValidationSeverity = 'error' | 'warning' | 'notice';

/** A fix the player can accept. Applying it re-runs validation. */
export type ValidationFix =
  | { kind: 'rescale'; /** Multiply every length by this. */ factor: 1000 | 0.001 }
  | { kind: 'flip_axes'; /** RAS axis to negate. */ axis: 'R' | 'A' | 'S' }
  | { kind: 'decimate'; targetTriangles: number };

export interface ValidationResult {
  check: ValidationCheckId;
  severity: ValidationSeverity;
  /** Plain-language message shown to the player. */
  message: string;
  /** JSON pointer into case.json or centerlines.json for field-level messages, e.g. "/entries/0/node". */
  path?: string;
  /** Ids involved (edges, nodes, targets, fields) so the UI can highlight them. */
  ids?: string[];
  fix?: ValidationFix;
}

/** What loadCase resolves with. */
export type CaseLoadResult =
  | { ok: true; case: LoadedCase }
  | { ok: false; /** At least one error. */ results: ValidationResult[] };

/** §3.5 thresholds. */
export const MESH_TRIANGLE_BUDGET = 100_000;
/** Largest aorta radius must fall in this range (mm) or a rescale is offered. */
export const AORTA_RADIUS_RANGE_MM: readonly [number, number] = [7, 20];
/** Vessel id the units check reads. */
export const AORTA_VESSEL_ID = 'aorta';
