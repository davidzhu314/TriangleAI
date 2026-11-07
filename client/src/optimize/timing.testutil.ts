/**
 * Timing helpers for the engine's timing tests (V2, V3, V7). Tests only.
 *
 * Each timing test asserts its budget on every run, and with UPDATE_METRICS=1 writes a summary table
 * to metrics/vaibhav/. Summaries only, never raw per-run logs.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Timing {
  medianMs: number;
  p95Ms: number;
  maxMs: number;
  n: number;
}

/** Summary of raw durations (ms). */
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

export const machineLine = () =>
  `Machine: ${process.platform} ${process.arch}, Node ${process.version}. Main thread, after a warm-up. Date of run: written by the test, ${new Date().toISOString().slice(0, 10)}.`;

export const shouldWriteMetrics = () => process.env['UPDATE_METRICS'] === '1';

/** Write metrics/vaibhav/<file> from the given lines. */
export function writeMetrics(file: string, lines: readonly string[]): void {
  writeFileSync(join(import.meta.dirname, '../../../metrics/vaibhav', file), lines.join('\n') + '\n');
}
