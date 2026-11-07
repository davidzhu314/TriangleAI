/**
 * Test helper: fixture-y from client/public/cases/ through David's real loader, `loadCase` (D2).
 * Loaded once per test file; each call returns a fresh deep copy. Tests only.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCase } from '../case';
import type { CaseJson, CenterlinesJson, LoadedCase } from '../contracts';

export const FIXTURE_Y_DIR = join(import.meta.dirname, '../../public/cases/fixture-y');

export function readFixtureY(): { caseJson: CaseJson; centerlines: CenterlinesJson } {
  const read = <T>(f: string): T => JSON.parse(readFileSync(join(FIXTURE_Y_DIR, f), 'utf8')) as T;
  return { caseJson: read<CaseJson>('case.json'), centerlines: read<CenterlinesJson>('centerlines.json') };
}

const bytes = (f: string) => new Uint8Array(readFileSync(join(FIXTURE_Y_DIR, f)));
const result = await loadCase({
  kind: 'files',
  origin: 'bundled',
  files: { 'case.json': bytes('case.json'), 'centerlines.json': bytes('centerlines.json'), 'vessels.glb': bytes('vessels.glb') },
});
if (!result.ok) throw new Error(`fixture-y did not load: ${JSON.stringify(result.results)}`);
const FIXTURE_Y: LoadedCase = result.case;

export function loadFixtureY(): LoadedCase {
  return structuredClone(FIXTURE_Y);
}
