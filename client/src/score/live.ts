/**
 * Assistant answers during a drive ("how am I doing", "where next") and the spoken form of the
 * planning answers, computed by the engine only (CLAUDE.md, spec §11: no AI model computes any
 * number). Every line comes from a template in FEEDBACK_TEMPLATES, so every number in it is in its
 * `values`.
 *
 * "How am I doing" reuses V5's scoreCase and buildFeedback on the drive so far; it never repeats the
 * scoring maths. Pure: no clock, no randomness.
 */

import type { FeedbackLine, LoadedCase } from '../contracts';
import type { PlanAssist } from '../optimize/assist';
import { Names } from './feedback';
import { scoreCase, type ScoreInput } from './score';
import { feedbackLine } from './templates';

export interface DriveAssist {
  /** The planned edge after the tip's current one; null at the end of the plan or off plan. */
  nextEdge: string | null;
  /** The tip is on an edge not in the plan: pull back toward `backToEdge`. */
  offPlan: { edge: string; backToEdge: string } | null;
  /** Most important first, at most MAX_ASSIST_LINES. */
  lines: FeedbackLine[];
}

export const MAX_ASSIST_LINES = 3;

const BUDGET = new Set(['result.over_budget', 'result.over_budget_kept']);

/** Answers on the drive so far: `input.log` is the partial log. */
export function driveAssist(input: ScoreInput): DriveAssist {
  const { log } = input;
  const n = new Names(input.case);
  const last = log.samples.at(-1);
  const edge = last?.edge ?? log.path[0] ?? null;
  const at = edge === null ? -1 : log.path.indexOf(edge);

  let nextEdge: string | null = null;
  let offPlan: DriveAssist['offPlan'] = null;
  if (at >= 0) nextEdge = log.path[at + 1] ?? null;
  else if (edge !== null) {
    const wrong = [...log.events].reverse().find((e) => e.kind === 'wrong_branch');
    const lastOnPlan = [...log.samples].reverse().find((s) => log.path.includes(s.edge))?.edge;
    offPlan = { edge, backToEdge: (wrong?.kind === 'wrong_branch' ? wrong.expectedEdge : undefined) ?? lastOnPlan ?? log.path[0]! };
  }

  const lines: FeedbackLine[] = [];
  if (offPlan) {
    lines.push(feedbackLine('assist.pull_back', { wrong_vessel: n.vesselOfEdge(offPlan.edge), vessel: n.vesselOfEdge(offPlan.backToEdge) }, 'drive.errors'));
  } else if (nextEdge) {
    lines.push(feedbackLine('assist.next_branch', { vessel: n.vesselOfEdge(nextEdge) }, 'rank.weighted'));
  }

  const result = scoreCase(input);
  for (const l of result.feedback) {
    if (l.template === 'drive.not_reached') continue; // the drive isn't over
    if (BUDGET.has(l.template) && !(result.fluoroOverBudgetS > 0)) continue;
    lines.push(l);
  }
  if (!offPlan && !nextEdge && result.reachedTarget) lines.unshift(feedbackLine('assist.at_target', { target: n.target(log.targetId) }, 'result.stars'));
  return { nextEdge, offPlan, lines: lines.slice(0, MAX_ASSIST_LINES) };
}

/** The spoken answer to "best next artery" or "what are my options" for a planAssist result. */
export function planAssistLine(assist: PlanAssist, c: LoadedCase, targetId: string, ask: 'best' | 'options'): FeedbackLine {
  const n = new Names(c);
  const vesselOf = (edge: string) => n.vesselOfEdge(edge);
  switch (assist.reason) {
    case 'no_safe_route':
      return feedbackLine('assist.no_safe_route', {}, 'plan.feasible');
    case 'complete':
      return feedbackLine('assist.complete', { target: n.target(targetId) }, 'rank.weighted');
    case 'no_continuation':
      return feedbackLine('assist.no_continuation', { target: n.target(targetId) }, 'rank.weighted');
    case 'cannot_steer':
      return feedbackLine('assist.cannot_steer', {}, 'plan.feasible');
  }
  // only options the wire can steer are spoken (all of them when steering wasn't checked)
  const spoken = assist.options.filter((o) => o.steerable !== false);
  const vessels = [...new Set(spoken.map((o) => vesselOf(o.edge)))].join(', ');
  if (assist.reason === 'off_frontier') return feedbackLine('assist.off_frontier', { vessels }, 'rank.weighted');
  if (ask === 'options') return feedbackLine('assist.options', { n: spoken.length, vessels }, 'rank.weighted');
  const best = assist.best!;
  const label = best.labels.map((l) => l.replace(/_/g, ' ')).join(', ');
  return label
    ? feedbackLine('assist.best_route', { vessel: vesselOf(best.edge), label }, 'rank.weighted')
    : feedbackLine('assist.best_route_plain', { vessel: vesselOf(best.edge) }, 'rank.weighted');
}
