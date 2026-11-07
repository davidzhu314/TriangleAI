/**
 * Spec §4.2 measures on plain arrays (millimetres), ported from tests/crosscheck/numpy_measures.py.
 * Deterministic geometry only; no AI model computes any of these numbers.
 *
 * Contract types come in V2. LoadedCase is in metres, so either convert to mm before calling or
 * pass windowMm = 0.005 and read the results in metres. The degree outputs don't depend on units.
 */

export * from './polyline';
export * from './turning';
export * from './zones';
export * from './route';
