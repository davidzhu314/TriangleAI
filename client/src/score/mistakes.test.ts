import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EventLog } from '../contracts';
import { loadFixtureY } from '../optimize/fixture-y.testutil';
import { MISTAKE_KINDS, mistakeMarkers } from './replay';

const LOGS = join(import.meta.dirname, '../../../tests/fixtures/logs');
const golden = (name: string) => (JSON.parse(readFileSync(join(LOGS, `${name}.json`), 'utf8')) as { log: EventLog }).log;
const c = loadFixtureY();

describe('mistake markers for the route overview', () => {
  it('lists every wrong branch, prolapse, back-out and force spike, in time order, with a plain line', () => {
    const log = golden('score-prolapse-fixture-y');
    const m = mistakeMarkers(log, c);
    const expected = log.events.filter((e) => MISTAKE_KINDS.includes(e.kind)).length;
    expect(m).toHaveLength(expected);
    expect(m.length).toBeGreaterThan(0);
    expect(m.map((x) => x.t)).toEqual([...m.map((x) => x.t)].sort((a, b) => a - b));
    for (const x of m) {
      expect(MISTAKE_KINDS).toContain(x.kind);
      expect(x.label.length).toBeGreaterThan(0);
      expect(x.tip.every(Number.isFinite)).toBe(true);
    }
    expect(m.map((x) => x.kind)).toEqual(expect.arrayContaining(['wrong_branch', 'prolapse']));
  });

  it('a clean drive has none, and a partial log gives only what happened so far', () => {
    expect(mistakeMarkers(golden('score-clean-fixture-y'), c)).toEqual([]);
    const log = golden('score-wrong-branch-fixture-y');
    const first = log.events.find((e) => MISTAKE_KINDS.includes(e.kind))!;
    const partial = { ...log, samples: log.samples.filter((s) => s.t <= first.t), events: log.events.filter((e) => e.t <= first.t) };
    expect(mistakeMarkers(partial, c)).toHaveLength(log.events.filter((e) => MISTAKE_KINDS.includes(e.kind) && e.t <= first.t).length);
  });
});
