/**
 * G1: progression (spec §6.5) on the real anatomy of the bundled cases, loaded through loadCase.
 * - low-tort is ladder tier 0 and type-iii is tier 2 (from case.anatomy);
 * - on an empty history, ladder mode starts at low-tort and keeps type-iii locked;
 * - open mode (the demo build) unlocks type-iii on a fresh browser.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isUnlocked, ladderTier, nextCase } from '../../client/src/score';
import { CASES_DIR, loadBundled } from './engine.testutil';

describe('progression on the bundled cases', async () => {
  const index = JSON.parse(readFileSync(join(CASES_DIR, 'index.json'), 'utf8')) as { cases: { id: string }[] };
  const all = await Promise.all(index.cases.map((x) => loadBundled(x.id)));
  const byId = new Map(all.map((c) => [c.id, c]));

  it('the Library index includes both generated cases', () => {
    expect(byId.has('low-tort')).toBe(true);
    expect(byId.has('type-iii')).toBe(true);
  });

  it('low-tort is ladder tier 0 and type-iii is tier 2', () => {
    expect(ladderTier(byId.get('low-tort')!)).toBe(0);
    expect(ladderTier(byId.get('type-iii')!)).toBe(2);
  });

  it('ladder mode on an empty history: the next case is low-tort, and type-iii is locked', () => {
    expect(nextCase(all, [], 'ladder')).toBe('low-tort');
    expect(isUnlocked('low-tort', all, [], 'ladder')).toBe(true);
    expect(isUnlocked('type-iii', all, [], 'ladder')).toBe(false);
  });

  it('open mode on an empty history: type-iii is unlocked (the demo build)', () => {
    expect(isUnlocked('type-iii', all, [], 'open')).toBe(true);
  });
});
