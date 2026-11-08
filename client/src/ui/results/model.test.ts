/**
 * Results logic on Vaibhav's golden scoring logs (tests/fixtures/logs/score-*-fixture-y.json) and the real engine.
 * Expected values are read from the committed golden results, never typed in here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCase } from '../../case';
import type { CaseResult, EventLog, FeedbackLine, LoadedCase, Weights } from '../../contracts';
import { optimize } from '../../optimize';
import { replayTimeline, scoreAttempt, type ProgressRecord } from '../../score';
import type { SavedDrive } from '../store';
import { budgetWords, fmt, leadAction, placeMarkers, recordOnce, splitFeedback, starWords } from './model';

interface Golden {
  weights: Weights;
  log: EventLog;
  result: CaseResult;
}
const golden = (name: string): Golden => JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'logs', `score-${name}-fixture-y.json`), 'utf8')) as Golden;
const NAMES = ['clean', 'wrong-branch', 'prolapse', 'over-budget'] as const;

let c: LoadedCase;
beforeAll(async () => {
  const dir = join(process.cwd(), 'client', 'public', 'cases', 'fixture-y');
  const files = Object.fromEntries(['case.json', 'centerlines.json', 'vessels.glb'].map((n) => [n, new Uint8Array(readFileSync(join(dir, n)))]));
  const r = await loadCase({ kind: 'files', origin: 'bundled', files });
  if (!r.ok) throw new Error('fixture-y did not load');
  c = r.case;
});

async function inputFor(g: Golden) {
  const optimized = await optimize({ caseId: c.id, targetId: g.log.targetId }, c);
  return { log: g.log, optimized, weights: g.weights, case: c };
}

describe('the finding', () => {
  it.each(NAMES)('%s: the screen scores the log as the golden says, and leads with feedback[0]', async (name) => {
    const g = golden(name);
    const result = await scoreAttempt(await inputFor(g));
    expect(result).toEqual(g.result);
    const { lead, rest } = splitFeedback(result.feedback);
    expect(lead).toEqual(g.result.feedback[0]);
    expect(rest).toEqual(g.result.feedback.slice(1, 4));
  });

  it('a plan line that set the score sends you back to the plan; anything else retries the drive', () => {
    const g = golden('clean').result;
    // Every golden plan scored its best, so its plan line drives a retry.
    for (const n of NAMES) expect(leadAction(golden(n).result)).toBe('retry');
    const capped: CaseResult = { ...g, plan: { ...g.plan, score: 40, decidedBy: 'heavy_crossings', cap: 40 }, feedback: [{ template: 'plan.heavy_crossing', text: 'x', values: {}, formulaRef: 'plan.heavy_cap' }] };
    expect(leadAction(capped)).toBe('revise');
    const notReached: CaseResult = { ...capped, feedback: [{ template: 'drive.not_reached', text: 'x', values: {}, formulaRef: 'drive.fidelity' }, ...capped.feedback] };
    expect(leadAction(notReached)).toBe('retry');
    expect(leadAction({ ...g, feedback: [] })).toBe('retry');
  });

  it('the best route always retries: on the plan.best line, and on a score that prints as 100 of 100', () => {
    const g = golden('clean').result;
    const best: FeedbackLine = { template: 'plan.best', text: 'x', values: {}, formulaRef: 'plan.regret' };
    // The floating-point leftover Gibran found (before #41): praise must never sit beside "Revise the plan".
    expect(leadAction({ ...g, plan: { ...g.plan, score: 99.99999999999997, decidedBy: 'regret' }, feedback: [best] })).toBe('retry');
    // plan.best wins even if a later engine change took points off.
    expect(leadAction({ ...g, plan: { ...g.plan, score: 92, decidedBy: 'regret' }, feedback: [best] })).toBe('retry');
    // Another plan line on a score that prints as 100: no revision beside "100 of 100".
    const regret: FeedbackLine = { template: 'plan.regret', text: 'x', values: {}, formulaRef: 'plan.regret' };
    expect(leadAction({ ...g, plan: { ...g.plan, score: 99.6, decidedBy: 'regret' }, feedback: [regret] })).toBe('retry');
    // One that prints as 99 still sends you back to the plan.
    expect(leadAction({ ...g, plan: { ...g.plan, score: 99.4, decidedBy: 'regret' }, feedback: [regret] })).toBe('revise');
  });
});

describe('stars and the radiation budget', () => {
  it('star words', () => {
    expect(([0, 1, 2, 3] as const).map((s) => starWords(s))).toEqual(['0 of 3 stars', '1 of 3 stars', '2 of 3 stars', '3 of 3 stars']);
  });

  it('over budget: names the star the allowance took and the seconds over, from the result', () => {
    const r = golden('over-budget').result;
    expect(r.stars).toBeLessThan(r.starsBeforeBudget);
    expect(budgetWords(r)).toBe(`The fluoro allowance took star ${r.starsBeforeBudget}: fluoro went ${fmt(r.fluoroOverBudgetS, 1)} s over it. You earned ${r.starsBeforeBudget} before the budget.`);
  });

  it('within the allowance there is nothing to say; over it at the floor, the star is kept', () => {
    expect(budgetWords(golden('clean').result)).toBeNull();
    expect(budgetWords({ stars: 1, starsBeforeBudget: 1, fluoroOverBudgetS: 4 })).toBe(`Fluoro went ${fmt(4, 1)} s over the allowance; the budget never takes the last star.`);
    expect(budgetWords({ stars: 1, starsBeforeBudget: 3, fluoroOverBudgetS: 2 })).toContain('stars 2 to 3');
  });
});

describe('the replay timeline', () => {
  it.each(['wrong-branch', 'prolapse'] as const)('%s: one mark per engine marker, placed at t / duration', async (name) => {
    const g = golden(name);
    const t = replayTimeline(await inputFor(g));
    const placed = placeMarkers(t);
    expect(placed.map((m) => m.kind)).toEqual(t.markers.map((m) => m.kind));
    expect(placed.map((m) => m.label)).toEqual(t.markers.map((m) => m.label));
    for (const [i, m] of placed.entries()) expect(m.pct).toBeCloseTo((t.markers[i]!.t / t.durationS) * 100, 9);
    expect(placed.map((m) => m.kind)).toContain('wrong_branch');
    if (name === 'prolapse') expect(placed.map((m) => m.kind)).toEqual(expect.arrayContaining(['prolapse', 'force_spike']));
    expect(placed.every((m, i) => i === 0 || m.pct >= placed[i - 1]!.pct)).toBe(true);
  });

  it('a zero-length drive puts marks at the start, and marks past the end stay on the axis', () => {
    const m = { t: 3, kind: 'contrast_puff' as const, tip: [0, 0, 0] as [number, number, number], label: 'x', values: {} };
    expect(placeMarkers({ durationS: 0, markers: [m] })[0]!.pct).toBe(0);
    expect(placeMarkers({ durationS: 2, markers: [m] })[0]!.pct).toBe(100);
  });
});

describe('progress', () => {
  const drive = (): SavedDrive => ({ plan: { entryId: 'fem_r', targetId: 'left_branch', presetId: 'soft_angled', edges: ['e_aorta', 'e_left'] }, log: golden('clean').log });

  it('records a scored attempt once, and never again on a refresh', () => {
    const result = golden('clean').result;
    const first = recordOnce([], drive(), result);
    expect(first.recorded).toBe(true);
    expect(first.history).toHaveLength(1);
    expect(first.history[0]).toMatchObject({ seq: 1, caseId: result.caseId, stars: result.stars, reachedTarget: result.reachedTarget, fluoroOverBudgetS: result.fluoroOverBudgetS });
    const refresh = recordOnce(first.history, first.drive, result);
    expect(refresh.recorded).toBe(false);
    expect(refresh.history).toEqual(first.history);
  });

  it('a new drive gets the next seq after the stored ones', () => {
    const history: ProgressRecord[] = [{ seq: 4, caseId: 'other', reachedTarget: true, stars: 2, fluoroOverBudgetS: 0 }];
    const r = recordOnce(history, drive(), golden('over-budget').result);
    expect(r.history.map((x) => x.seq)).toEqual([4, 5]);
    expect(r.drive.recordedSeq).toBe(5);
  });
});
