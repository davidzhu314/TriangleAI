/** Test helper: a bundled case through David's real loader, the same way the app loads it. Tests only. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCase } from '../../case';
import type { LoadedCase } from '../../contracts';

export const CASES_DIR = join(import.meta.dirname, '../../../public/cases');

export async function loadBundled(id: string): Promise<LoadedCase> {
  const bytes = (f: string) => new Uint8Array(readFileSync(join(CASES_DIR, id, f)));
  const r = await loadCase({
    kind: 'files',
    origin: 'bundled',
    files: { 'case.json': bytes('case.json'), 'centerlines.json': bytes('centerlines.json'), 'vessels.glb': bytes('vessels.glb') },
  });
  if (!r.ok) throw new Error(`${id}: ${JSON.stringify(r.results)}`);
  return r.case;
}
