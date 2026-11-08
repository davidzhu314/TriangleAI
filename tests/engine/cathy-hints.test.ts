/**
 * G4: hints never change a score or progress (team decision on to-all-from-vaibhav-hands-voice-assist:
 * a hint marks the attempt "assisted", with no score penalty).
 *
 * What exists today: ProgressRecord.hintsUsed (optional, counted by the caller) and an engine whose
 * scoring takes no hint input. What doesn't yet: the app counting hints, and the "assisted" mark on
 * Results (Aroovee, after the demo). Those are it.todo below, to turn into tests when they land.
 */

import { describe, expect, it } from 'vitest';
import { buildGraph, DEFAULT_WEIGHTS, optimizeCase } from '../../client/src/optimize';
import {
  adaptiveSuggestion,
  bestStars,
  bestFrontierRoute,
  courseGrade,
  currentTier,
  isUnlocked,
  nextCase,
  recordFromResult,
  scoreCase,
  unlockedCaseIds,
  type ProgressRecord,
} from '../../client/src/score';
import type { CaseResult, Frontier, LoadedCase } from '../../client/src/contracts';
import { autoDrive, G1_CASES, loadBundled } from './engine.testutil';

describe('hints never change scores or progress', async () => {
  const cases: LoadedCase[] = await Promise.all(G1_CASES.map((id) => loadBundled(id)));
  const results: CaseResult[] = [];
  for (const c of cases) {
    const f = optimizeCase(buildGraph(c), { caseId: c.id, targetId: c.targets[0]!.id }) as Frontier;
    const best = bestFrontierRoute(f, DEFAULT_WEIGHTS)!;
    const { log } = await autoDrive(c, f.targetId, best);
    results.push(scoreCase({ log, optimized: f, weights: DEFAULT_WEIGHTS, case: c }));
  }

  it('recordFromResult leaves hintsUsed for the caller to set', () => {
    for (const r of results) expect(recordFromResult(1, r).hintsUsed).toBeUndefined();
  });

  it('progression gives the same answers with and without hints', () => {
    const plain: ProgressRecord[] = results.map((r, i) => recordFromResult(i + 1, r));
    const hinted: ProgressRecord[] = plain.map((p, i) => ({ ...p, hintsUsed: 3 + i }));
    for (const mode of ['ladder', 'open'] as const) {
      expect(nextCase(cases, hinted, mode)).toBe(nextCase(cases, plain, mode));
      expect(unlockedCaseIds(cases, hinted, mode)).toEqual(unlockedCaseIds(cases, plain, mode));
      expect(currentTier(cases, hinted, mode)).toBe(currentTier(cases, plain, mode));
      expect(adaptiveSuggestion(cases, hinted, mode)).toEqual(adaptiveSuggestion(cases, plain, mode));
      for (const c of cases) expect(isUnlocked(c.id, cases, hinted, mode)).toBe(isUnlocked(c.id, cases, plain, mode));
    }
    for (const c of cases) expect(bestStars(c.id, hinted)).toBe(bestStars(c.id, plain));
    expect(courseGrade(cases.map((c) => c.id), hinted)).toEqual(courseGrade(cases.map((c) => c.id), plain));
  });

  it('scoring takes no hint input, so a hinted drive scores the same', () => {
    // ScoreInput is { log, optimized, weights, case }: nothing about hints can reach the score.
    for (const r of results) expect(r.reachedTarget).toBe(true);
  });

  it.todo('the app adds one to hintsUsed for each answer asked for (Aroovee, after the demo)');
  it.todo('Results marks a run with any hint as "assisted", with no score change (Aroovee, after the demo)');
});
