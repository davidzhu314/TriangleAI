/** Test helper: fixture-y from disk as a LoadedCase (via the temporary mock builder). Tests only. */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CaseJson, CenterlinesJson, LoadedCase } from '../contracts';
import { buildMockLoadedCase } from './mock-case';

export const FIXTURE_Y_DIR = join(import.meta.dirname, '../../public/cases/fixture-y');

export function readFixtureY(): { caseJson: CaseJson; centerlines: CenterlinesJson } {
  const read = <T>(f: string): T => JSON.parse(readFileSync(join(FIXTURE_Y_DIR, f), 'utf8')) as T;
  return { caseJson: read<CaseJson>('case.json'), centerlines: read<CenterlinesJson>('centerlines.json') };
}

export function loadFixtureY(): LoadedCase {
  const { caseJson, centerlines } = readFixtureY();
  const glb = readFileSync(join(FIXTURE_Y_DIR, 'vessels.glb'));
  return buildMockLoadedCase(caseJson, centerlines, {
    glb: glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength),
  });
}
