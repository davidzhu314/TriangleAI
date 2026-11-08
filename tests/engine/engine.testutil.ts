/**
 * Shared helpers for Gibran's engine checks (G1). Tests only.
 *
 * Cases load through David's real loadCase from client/public/cases/, the same path the app uses.
 * Timing helpers live here (not in client/src/optimize/timing.testutil.ts) because that one writes to
 * metrics/vaibhav/; these write to metrics/gibran/.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCase } from '../../client/src/case';
import type { EventLog, FrontierRoute, LoadedCase } from '../../client/src/contracts';
import { RailWireSource } from '../../client/src/wire/rail-source';

export const REPO = join(import.meta.dirname, '../..');
export const CASES_DIR = join(REPO, 'client/public/cases');
export const ENGINE_FIXTURES = join(REPO, 'tests/fixtures/engine');

/** The two generated cases G1 checks: the §7.4 demo case and the ladder start. */
export const G1_CASES = ['type-iii', 'low-tort'] as const;

/** Spec §4.9 tolerances. Never loosen without a DECISIONS.md line. */
export const MM = 0.1;
export const DEG = 0.5;

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

/** 5 simulated minutes at 30 Hz: far longer than any template drive. */
export const MAX_TICKS = 9000;

/**
 * Drive `route` to `targetId` with RailWireSource's autopilot on a manual clock, fluoro held,
 * until the tip reaches the target (or MAX_TICKS), then stop() and return the EventLog.
 */
export async function autoDrive(c: LoadedCase, targetId: string, route: FrontierRoute): Promise<{ log: EventLog; reached: boolean; ticks: number }> {
  const src = new RailWireSource({ clock: 'manual', autoDrive: true });
  let reached = false;
  src.onState((s) => (reached = s.atTarget));
  await src.start({ case: c, entryId: route.entryId, targetId, presetId: route.presetId, path: route.edges });
  src.control({ push: 0, rotate: 0, fluoro: true, contrastPuff: false });
  let ticks = 0;
  while (ticks < MAX_TICKS && !reached) {
    src.tick();
    ticks++;
  }
  return { log: await src.stop(), reached, ticks };
}

export const readJson =<T>(...p: string[]): T => JSON.parse(readFileSync(join(...p), 'utf8')) as T;

export interface Timing {
  medianMs: number;
  p95Ms: number;
  maxMs: number;
  n: number;
}

export function summarize(durations: readonly number[]): Timing {
  const t = [...durations].sort((a, b) => a - b);
  const n = t.length;
  return { medianMs: t[Math.floor(n / 2)]!, p95Ms: t[Math.min(n - 1, Math.floor(n * 0.95))]!, maxMs: t[n - 1]!, n };
}

/** Time `fn` `runs` times after `warm` warm-up calls. */
export function time(fn: () => void, runs: number, warm = 10): Timing {
  for (let i = 0; i < warm; i++) fn();
  const t: number[] = [];
  for (let i = 0; i < runs; i++) {
    const a = performance.now();
    fn();
    t.push(performance.now() - a);
  }
  return summarize(t);
}

export const fmt = (x: number, d = 3) => x.toFixed(d);

export const shouldWriteMetrics = () => process.env['UPDATE_METRICS'] === '1';
export const shouldWriteFixtures = () => process.env['UPDATE_FIXTURES'] === '1';

export const machineLine = () =>
  `Machine: ${process.platform} ${process.arch}, Node ${process.version}. Main thread, after a warm-up. Date of run: ${new Date().toISOString().slice(0, 10)}.`;

/** Write metrics/gibran/<file> from the given lines. */
export function writeMetrics(file: string, lines: readonly string[]): void {
  writeFileSync(join(REPO, 'metrics/gibran', file), lines.join('\n') + '\n');
}
