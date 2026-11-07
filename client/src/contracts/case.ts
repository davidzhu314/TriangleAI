/**
 * Case package — spec §3.2. Placeholder from D0a: names only, bodies filled in D0b
 * (with case.schema.json). Do not build on the shapes below until CONTRACTS_VERSION is 1.
 *
 * Case files stay in millimetres and RAS axes; LoadedCase is metres and Y-up after the loader.
 */

export const CASE_SCHEMA_ID = 'threadsim.case/1';

/** case.json as stored in the package (mm, RAS). Filled in D0b. */
export interface CaseJson {}

/** centerlines.json as stored in the package (mm, RAS). Filled in D0b. */
export interface CenterlinesJson {}

/** Where a case came from: bundled, imported by the player, or served by the physics process. Filled in D0b. */
export type CaseOrigin = string;

/** A case after load and validation (metres, Y-up). Filled in D0b. */
export interface LoadedCase {}
