/**
 * client/public/cases/index.json: the one list of bundled cases the Library shows, in ladder
 * order (spec §6.5). Every case builder writes only its own folder; this file owns the index.
 */
import type { BundledCaseIndex } from '../client/src/contracts/case';
import { stableStringify } from './lib/stable-json';

export const BUNDLED_CASE_IDS = ['low-tort', 'type-iii', 'fixture-y'] as const;

export function buildCatalog(): string {
  const index: BundledCaseIndex = { cases: BUNDLED_CASE_IDS.map((id) => ({ id, path: `${id}/` })) };
  return stableStringify(index);
}
