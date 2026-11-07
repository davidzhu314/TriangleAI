/**
 * Files for the generated bundled cases, relative to client/public/cases/. Regenerate with
 * `pnpm fixtures`.
 */
import { writeGlb } from '../lib/glb';
import { stableStringify } from '../lib/stable-json';
import { generateArch, type ArchParams } from './arch';
import { LOW_TORT, TYPE_III } from './cases';

export const GENERATED_CASES: readonly ArchParams[] = [LOW_TORT, TYPE_III];

export function buildGeneratedFiles(): Record<string, string | Uint8Array> {
  const files: Record<string, string | Uint8Array> = {};
  for (const p of GENERATED_CASES) {
    const g = generateArch(p);
    files[`${p.id}/case.json`] = stableStringify(g.caseJson);
    files[`${p.id}/centerlines.json`] = stableStringify(g.centerlines);
    files[`${p.id}/vessels.glb`] = writeGlb(g.meshes, { units: 'mm', axes: 'RAS' });
  }
  return files;
}
