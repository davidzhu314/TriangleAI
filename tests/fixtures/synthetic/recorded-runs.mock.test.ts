import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RECORDED_RUNS_TEST_FIXTURE as RR } from './recorded-runs.mock';

const REPO = join(import.meta.dirname, '../../..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs|json|html)$/.test(name)) out.push(p);
  }
  return out;
}

describe('recorded-runs test fixture', () => {
  it('is internally consistent', () => {
    for (const s of RR.stats) {
      expect(s.successes).toBeLessThanOrEqual(s.runs);
      expect(s.successRate).toBeCloseTo(s.successes / s.runs, 12);
      expect(s.reached).toBe(s.successes > 0);
    }
    expect(RR.stats.some((s) => !s.reached)).toBe(true);
  });

  it('is never imported by the app', () => {
    const offenders = walk(join(REPO, 'client')).filter((f) =>
      readFileSync(f, 'utf8').includes('recorded-runs.mock'),
    );
    expect(offenders.map((f) => relative(REPO, f))).toEqual([]);
  });
});
