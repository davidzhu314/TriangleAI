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
import { planMarkLine, type PlanMark } from './plan-marks';
import { feedbackLine } from './templates';
import { warningLine, type DriveWarning } from './warn';

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

  const result = scoreCase(input);
  const vesselId = (id: string) => input.case.edges.find((e) => e.id === id)?.vessel ?? id;
  const lines: FeedbackLine[] = [];
  if (offPlan) {
    // Off the plan in a vessel the plan also uses (the ascending aorta past the brachiocephalic opening): the
    // trainee went past the opening, not into a wrong branch. Saying "you're in the Aorta" would sound on route.
    const offVessel = vesselId(offPlan.edge);
    const pastOpening = log.path.some((e) => vesselId(e) === offVessel) && vesselId(offPlan.backToEdge) !== offVessel;
    lines.push(
      pastOpening
        ? feedbackLine('assist.past_opening', { vessel: n.vesselOfEdge(offPlan.backToEdge) }, 'drive.errors')
        : feedbackLine('assist.pull_back', { wrong_vessel: n.vesselOfEdge(offPlan.edge), vessel: n.vesselOfEdge(offPlan.backToEdge) }, 'drive.errors'),
    );
  } else if (nextEdge && edge !== null) {
    // Directions name vessels, not edges: when the next edge is more of the same vessel, point at the next branch.
    const here = vesselId(edge);
    if (vesselId(nextEdge) !== here) lines.push(feedbackLine('assist.next_branch', { vessel: n.vesselOfEdge(nextEdge) }, 'rank.weighted'));
    else {
      const branch = log.path.slice(at + 1).find((e) => vesselId(e) !== here);
      lines.push(
        branch
          ? feedbackLine('assist.keep_going', { vessel: n.vesselOfEdge(edge), next: n.vesselOfEdge(branch) }, 'rank.weighted')
          : feedbackLine('assist.keep_going_target', { vessel: n.vesselOfEdge(edge), target: n.target(log.targetId) }, 'rank.weighted'),
      );
    }
  } else if (at >= 0 && !result.reachedTarget) {
    // On the last planned edge, before the target: say where the drive is going before any other line.
    lines.push(feedbackLine('assist.target_ahead', { target: n.target(log.targetId) }, 'rank.weighted'));
  }

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

/**
 * "Am I on the right path" (assist_check, G5) during a drive: the wrong-branch warning when one is active
 * (driveWarning), else driveAssist's "pull back" line when off the plan, else where the plan goes next.
 * Deterministic: it works with the LLM switched off.
 */
export function driveCheckLine(input: ScoreInput, warning: DriveWarning | null): FeedbackLine {
  if (warning) return warningLine(warning, input.case);
  const a = driveAssist(input);
  const n = new Names(input.case);
  if (a.offPlan) return a.lines[0]!; // assist.pull_back or assist.past_opening
  // more of the same vessel, or the last stretch: the direction line already says it in vessels
  const first = a.lines[0]?.template;
  if (first === 'assist.keep_going' || first === 'assist.keep_going_target' || first === 'assist.target_ahead') return a.lines[0]!;
  if (a.nextEdge) return feedbackLine('assist.on_plan', { vessel: n.vesselOfEdge(a.nextEdge) }, 'rank.weighted');
  if (a.lines[0]?.template === 'assist.at_target') return a.lines[0];
  return feedbackLine('assist.on_plan_last', { target: n.target(input.log.targetId) }, 'rank.weighted');
}

/** "Is this right" while planning: the first plan mark (planMarks) if any, else the best way on (planAssistLine). */
export function planCheckLine(marks: readonly PlanMark[], assist: PlanAssist, c: LoadedCase, targetId: string): FeedbackLine {
  if (marks.length > 0) return planMarkLine(marks[0]!, c);
  return planAssistLine(assist, c, targetId, 'best');
}

/** The line for a question the engine has no answer for (and the LLM fallback when there is no template). */
export function noAnswerLine(): FeedbackLine {
  return feedbackLine('assist.no_answer', {}, 'rank.weighted');
}
