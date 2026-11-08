/**
 * The anatomical reference model's visual alignment in the client (team/requests/to-all-from-gibran-contract-visual-alignment.md):
 * the bundled values are exactly Gibran's reviewed fixtures, the matrix is his, and the config places, hides or leaves
 * a model as the request says.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RAS_MM_TO_YUP_M } from '../contracts';
import { alignmentMatrix as referenceMatrix, apply } from '../../../tests/engine/vascular-alignment.testutil';
import { alignedAnatomy, alignmentFor, alignmentMatrix, PLACEHOLDER_ANATOMY, type AnatomyConfig } from './anatomy-config';

const FIXTURES = join(process.cwd(), 'tests', 'fixtures', 'engine', 'vascular-alignment');
const BUNDLED = join(process.cwd(), 'client', 'src', 'render', 'anatomy-alignment');
const MODEL: AnatomyConfig = { url: '/anatomy/vascular.glb', fit: 'none', toWorld: RAS_MM_TO_YUP_M, placeholder: false };

describe('anatomy alignment', () => {
  it('bundles exactly the reviewed alignments, one per aligned case', () => {
    const names = readdirSync(FIXTURES).filter((f) => f.endsWith('.json')).sort();
    expect(readdirSync(BUNDLED).filter((f) => f.endsWith('.json')).sort()).toEqual(names);
    for (const f of names) expect(readFileSync(join(BUNDLED, f), 'utf8'), f).toBe(readFileSync(join(FIXTURES, f), 'utf8'));
  });

  it("uses Gibran's matrix: model RAS mm → case RAS mm, with no mirror", () => {
    const a = alignmentFor('low-tort')!;
    expect(alignmentMatrix(a)).toEqual(referenceMatrix(a));
  });

  it('places the reference body on an aligned case: RAS_MM_TO_YUP_M after the alignment, with a note saying what it is', () => {
    const cfg = alignedAnatomy(MODEL, 'low-tort');
    const a = alignmentFor('low-tort')!;
    const p: [number, number, number] = [12, -40, 900];
    const viaConfig = apply(cfg.toWorld!, p);
    const byHand = apply(RAS_MM_TO_YUP_M, apply(alignmentMatrix(a), p));
    viaConfig.forEach((v, i) => expect(v).toBeCloseTo(byHand[i]!, 12));
    expect(cfg.unavailable).toBeUndefined();
    expect(cfg.note).toMatch(/Reference body .* Not this patient's anatomy\. About 67% /);
  });

  it('does not show it on a case with no alignment, and says why', () => {
    const cfg = alignedAnatomy(MODEL, 'fixture-y');
    expect(cfg.unavailable).toMatch(/No alignment for this case/);
  });

  it('leaves the placeholder, a case body context and a model already in metres Y-up as they were', () => {
    expect(alignedAnatomy(PLACEHOLDER_ANATOMY, 'low-tort')).toBe(PLACEHOLDER_ANATOMY);
    const context: AnatomyConfig = { url: 'blob:x', fit: 'none', toWorld: RAS_MM_TO_YUP_M, placeholder: false, context: true };
    expect(alignedAnatomy(context, 'low-tort')).toBe(context);
    const yup: AnatomyConfig = { ...MODEL, toWorld: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] };
    expect(alignedAnatomy(yup, 'low-tort')).toBe(yup);
  });
});
