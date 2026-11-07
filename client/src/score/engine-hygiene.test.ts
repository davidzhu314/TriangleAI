/**
 * Engine hygiene for the demo (V7):
 * - the engine reads no clock, no randomness and no browser storage, so the same inputs always give
 *   the same results (§6.6). Timing tests and test utilities are exempt;
 * - every illustrative constant is in ILLUSTRATIVE_CONSTANTS, each pointing at a real DECISIONS.md line.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ILLUSTRATIVE_CONSTANTS } from './illustrative';

const SRC = join(import.meta.dirname, '..');
const REPO = join(SRC, '../..');

/** Engine source files: optimize/, score/, wire/rail*, without tests and test utilities. */
function engineFiles(): string[] {
  const out: string[] = [];
  for (const dir of ['optimize', 'score', 'wire']) {
    for (const f of readdirSync(join(SRC, dir))) {
      if (!f.endsWith('.ts') || f.endsWith('.test.ts') || f.endsWith('.testutil.ts')) continue;
      if (dir === 'wire' && !f.startsWith('rail')) continue;
      out.push(`${dir}/${f}`);
    }
  }
  return out.sort();
}

/** The one allowed clock read: the measure Worker reports how long a request took (spec §11, timing only, never part of a result). */
const ALLOWED: Record<string, RegExp> = { 'optimize/measure-protocol.ts': /performance\.now/ };

describe('engine hygiene', () => {
  const files = engineFiles();

  it('covers the engine folders', () => {
    for (const f of ['optimize/optimizer.ts', 'score/score.ts', 'score/progress.ts', 'wire/rail.ts', 'wire/rail-source.ts']) expect(files).toContain(f);
  });

  it.each(files)('%s reads no clock, randomness or storage', (f) => {
    const allowed = ALLOWED[f];
    const src = readFileSync(join(SRC, f), 'utf8')
      .split('\n')
      .filter((line) => !(allowed && allowed.test(line)))
      .join('\n');
    expect(src).not.toMatch(/\bDate\b/);
    expect(src).not.toMatch(/performance\.now/);
    expect(src).not.toMatch(/Math\.random/);
    expect(src).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });

  it('lists every illustrative constant once, with a real DECISIONS.md line', () => {
    const decisions = readFileSync(join(REPO, 'DECISIONS.md'), 'utf8');
    const ids = ILLUSTRATIVE_CONSTANTS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of ILLUSTRATIVE_CONSTANTS) {
      expect(decisions, c.decision).toContain(`**${c.decision}**`);
      expect(Number.isFinite(c.value)).toBe(true);
    }
    expect(ids).toEqual(expect.arrayContaining(['preset.standard_j.max_turn', 'fluoro.s_per_cm', 'rail.force_spike', 'score.radiation_zero', 'ladder.low_tortuosity_max']));
  });
});
