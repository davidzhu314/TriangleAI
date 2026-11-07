/**
 * Progression timing (V7): every function on a generated catalog of 50 cases (tiers 0–3 plus cases
 * outside the ladder) and a history of 1000 records. Budget: median < 5 ms each (DECISIONS.md,
 * "Engine timing budgets"); the Library and Results screens call these on render.
 *
 * UPDATE_METRICS=1 writes metrics/vaibhav/v7-progress-timing.md.
 */

import { describe, expect, it } from 'vitest';
import type { Stars } from '../contracts';
import { rng } from '../optimize/graphs.testutil';
import { fmt, machineLine, shouldWriteMetrics, time, writeMetrics } from '../optimize/timing.testutil';
import { adaptiveSuggestion, courseGrade, isUnlocked, nextCase, unlockedCaseIds, unlockedTiers, type CaseMeta, type ProgressRecord } from './progress';

export const PROGRESS_BUDGET_MS = 5;

function catalog(): CaseMeta[] {
  const arch = ['I', 'II', 'III'] as const;
  return Array.from({ length: 50 }, (_, i): CaseMeta => {
    const id = `case-${String(i).padStart(2, '0')}`;
    if (i % 10 === 9) return { id }; // outside the ladder
    if (i % 10 === 8) return { id, anatomy: { arch_type: 'II', bovine: true } };
    return { id, anatomy: { arch_type: arch[i % 3]! } };
  });
}

function history(cases: CaseMeta[]): ProgressRecord[] {
  const r = rng(7);
  return Array.from({ length: 1000 }, (_, i) => {
    const reached = r() < 0.7;
    return {
      seq: i + 1,
      caseId: cases[Math.floor(r() * cases.length)]!.id,
      reachedTarget: reached,
      stars: (reached ? 1 + Math.floor(r() * 3) : 0) as Stars,
      fluoroOverBudgetS: r() < 0.2 ? r() * 30 : 0,
    };
  });
}

describe('progression timing (50 cases × 1000 records)', () => {
  const cases = catalog();
  const h = history(cases);
  const assigned = cases.filter((_, i) => i % 4 === 0).map((c) => c.id);
  const rows: string[] = [];

  const subjects: [string, () => unknown][] = [
    ['unlockedTiers', () => unlockedTiers(cases, h, 'ladder')],
    ['unlockedCaseIds', () => unlockedCaseIds(cases, h, 'ladder')],
    ['isUnlocked', () => isUnlocked('case-47', cases, h, 'ladder')],
    ['nextCase', () => nextCase(cases, h, 'ladder')],
    ['adaptiveSuggestion', () => adaptiveSuggestion(cases, h, 'ladder')],
    ['courseGrade', () => courseGrade(assigned, h)],
  ];

  it.each(subjects)('%s: median < 5 ms', (name, fn) => {
    const t = time(fn, 200, 20);
    rows.push(`| ${name} | ${fmt(t.medianMs)} | ${fmt(t.p95Ms)} | ${fmt(t.maxMs)} |`);
    expect(t.medianMs).toBeLessThan(PROGRESS_BUDGET_MS);
  });

  it('writes the metrics summary when asked', () => {
    if (!shouldWriteMetrics()) return;
    writeMetrics('v7-progress-timing.md', [
      '# V7 — progression timing',
      '',
      'Written by `UPDATE_METRICS=1 pnpm exec vitest run client/src/score/progress.timing.test.ts`. The same test asserts median < 5 ms per function on every CI run (DECISIONS.md, "Engine timing budgets").',
      '',
      `${machineLine()} 200 runs each after 20 warm-up runs. Catalog: 50 generated cases (types I–III, bovine, and 5 outside the ladder). History: 1000 records with unique seq from a seeded generator; 13 cases assigned for grading.`,
      '',
      '| Function | Median ms | p95 ms | Max ms |',
      '| --- | --- | --- | --- |',
      ...rows,
    ]);
  });
});
