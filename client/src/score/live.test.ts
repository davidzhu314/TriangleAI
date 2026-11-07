import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EventLog, FeedbackLine, Frontier, Weights } from '../contracts';
import { planAssist } from '../optimize/assist';
import { loadFixtureY } from '../optimize/fixture-y.testutil';
import { buildGraph } from '../optimize/graph';
import { loadSynthetic } from '../optimize/graphs.testutil';
import { optimizeCase } from '../optimize/optimizer';
import { driveAssist, MAX_ASSIST_LINES, planAssistLine } from './live';
import type { ScoreInput } from './score';
import { FEEDBACK_TEMPLATES, fillTemplate, type TemplateId } from './templates';

const LOGS = join(import.meta.dirname, '../../../tests/fixtures/logs');
const c = loadFixtureY();
const optimized = optimizeCase(buildGraph(c), { caseId: c.id, targetId: 'left_branch' });

function golden(name: string): { log: EventLog; weights: Weights } {
  return JSON.parse(readFileSync(join(LOGS, `${name}.json`), 'utf8')) as { log: EventLog; weights: Weights };
}

/** The log as it stood after `k` samples. */
function cut(log: EventLog, k: number): EventLog {
  const samples = log.samples.slice(0, k);
  const t = samples.at(-1)?.t ?? 0;
  return { ...log, samples, events: log.events.filter((e) => e.t <= t) };
}

const numbersIn = (s: string) => s.match(/\d+(\.\d+)?/g) ?? [];
function expectGrounded(l: FeedbackLine) {
  expect(l.text).toBe(fillTemplate(FEEDBACK_TEMPLATES[l.template as TemplateId], l.values));
  const allowed = new Set(Object.values(l.values).flatMap((v) => (typeof v === 'number' ? [String(v)] : numbersIn(v))));
  for (const n of numbersIn(l.text)) expect(allowed, l.text).toContain(n);
}

describe('driveAssist', () => {
  const clean = golden('score-clean-fixture-y');
  const input = (log: EventLog): ScoreInput => ({ log, optimized, weights: clean.weights, case: c });

  it('on the clean drive, cut at several times, nextEdge follows the plan', () => {
    for (const k of [1, 40, 120, 200, clean.log.samples.length]) {
      const log = cut(clean.log, k);
      const a = driveAssist(input(log));
      const at = log.path.indexOf(log.samples.at(-1)!.edge);
      expect(a.offPlan).toBeNull();
      expect(a.nextEdge).toBe(log.path[at + 1] ?? null);
      if (a.nextEdge) expect(a.lines[0]).toMatchObject({ template: 'assist.next_branch', text: 'Next, head into the Left branch.' });
    }
  });

  it('at the target, the first line says so', () => {
    const a = driveAssist(input(clean.log));
    expect(a.nextEdge).toBeNull();
    expect(a.lines[0]!.template).toBe('assist.at_target');
  });

  it('on the wrong-branch drive, offPlan points back at the event’s expected edge', () => {
    const wrong = golden('score-wrong-branch-fixture-y');
    const ev = wrong.log.events.find((e) => e.kind === 'wrong_branch')!;
    const k = wrong.log.samples.findIndex((s) => s.t > ev.t + 0.2);
    const a = driveAssist({ log: cut(wrong.log, k), optimized, weights: wrong.weights, case: c });
    expect(a.offPlan).toEqual({ edge: 'e_right', backToEdge: ev.kind === 'wrong_branch' ? ev.expectedEdge : '' });
    expect(a.nextEdge).toBeNull();
    expect(a.lines[0]).toMatchObject({ template: 'assist.pull_back', text: "You're in the Right branch. Pull back toward the Left branch." });
  });

  it('never says "not reached" mid-drive, keeps at most three lines, grounds every number, and is deterministic', () => {
    for (const name of ['score-clean-fixture-y', 'score-wrong-branch-fixture-y', 'score-prolapse-fixture-y', 'score-over-budget-fixture-y']) {
      const g = golden(name);
      for (const k of [1, Math.floor(g.log.samples.length / 2), g.log.samples.length]) {
        const i: ScoreInput = { log: cut(g.log, k), optimized, weights: g.weights, case: c };
        const a = driveAssist(i);
        expect(a.lines.length).toBeLessThanOrEqual(MAX_ASSIST_LINES);
        expect(a.lines.map((l) => l.template)).not.toContain('drive.not_reached');
        a.lines.forEach(expectGrounded);
        expect(JSON.stringify(driveAssist(structuredClone(i)))).toBe(JSON.stringify(a));
      }
    }
  });
});

describe('planAssistLine', () => {
  const d = loadSynthetic('diamond');
  const f = optimizeCase(buildGraph(d), { caseId: d.id, targetId: 'top' }) as Frontier;
  const ask = (routeSoFar: string[], weights: Weights = { lengthM: 1 }) => planAssist({ optimized: f, weights, entryId: 'in', presetId: 'soft_angled', routeSoFar });

  it('speaks the best branch with its labels, the options, and each reason, all grounded', () => {
    const best = planAssistLine(ask(['e0'], { narrowestRadiusM: 1 }), d, 'top', 'best');
    expect(best.template).toBe('assist.best_route');
    const options = planAssistLine(ask(['e0']), d, 'top', 'options');
    expect(options).toMatchObject({ template: 'assist.options', values: { n: 2 } });
    expect(planAssistLine(ask(['e0', 'e3', 'e4']), d, 'top', 'best').template).toBe('assist.complete');
    expect(planAssistLine(ask(['e4']), d, 'top', 'best').template).toBe('assist.no_continuation');
    const y = optimizeCase(buildGraph(c), { caseId: c.id, targetId: 'right_branch' });
    const none = planAssistLine(planAssist({ optimized: y, weights: {}, entryId: 'fem_r', presetId: 'soft_angled', routeSoFar: [] }), c, 'right_branch', 'best');
    expect(none).toMatchObject({ template: 'assist.no_safe_route', text: 'No safe way on from here with this wire.' });
    [best, options, none].forEach(expectGrounded);
  });
});
