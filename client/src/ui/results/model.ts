/**
 * The Results screen's decisions, kept pure so they are unit-tested without a DOM. Every number comes from the
 * CaseResult or the ReplayTimeline; the engine's feedback text is shown as it is, never rewritten.
 */
import type { CaseResult, FeedbackLine, PlanScore, Stars, WireEvent } from '../../contracts';
import { recordFromResult, type LadderTier, type ProgressRecord, type ReplayTimeline, type Suggestion } from '../../score';
import type { SavedDrive } from '../store';

/** A number as the screen prints it: fixed decimals, and a value that rounds to zero prints as zero. */
export function fmt(v: number, decimals: number): string {
  const rounded = Number(v.toFixed(decimals));
  return (rounded === 0 ? 0 : rounded).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export type LeadAction = 'retry' | 'revise';

/**
 * The one action feedback[0] drives: revise the plan when the line is about the plan and the plan's deciding
 * check took points off; otherwise retry the drive (a drive line, a budget line, or a plan line saying the plan
 * was already the best at your weights).
 *
 * Decided on the line and on the score as the screen prints it, never on a float: "Your route is the best
 * available" (plan.best) always retries, and a score that prints as 100 of 100 never asks for a revision
 * (team/requests/done/to-aroovee-from-gibran-results-revise-on-best.md).
 */
export function leadAction(result: CaseResult): LeadAction {
  const lead = result.feedback[0];
  if (!lead) return 'retry';
  if (lead.template === 'plan.best') return 'retry';
  const shown = Number(result.plan.score.toFixed(0)); // what fmt(score, 0) prints beside it
  return lead.formulaRef.startsWith('plan.') && shown < 100 ? 'revise' : 'retry';
}

export const ACTION_LABEL: Record<LeadAction, string> = { retry: 'Retry the drive', revise: 'Revise the plan' };

/** feedback[0] is the finding; the next two or three lines follow, smaller. */
export function splitFeedback(feedback: readonly FeedbackLine[], more = 3): { lead: FeedbackLine | null; rest: FeedbackLine[] } {
  return { lead: feedback[0] ?? null, rest: feedback.slice(1, 1 + more) };
}

const CHECK_WORDS: Record<PlanScore['decidedBy'], string> = {
  feasible: 'Set by the first check: the route breaks a hard constraint',
  heavy_crossings: 'Set by the second check: the route crosses more heavy risk zones than it needs to',
  frontier: 'Set by the third check: another route beats yours on every measure',
  regret: 'Set by regret at your own weights, after every cap passed',
};

/** Which check set the plan score, with its cap in words. The cap is the contract's number. */
export function planWords(plan: PlanScore): string {
  return `${CHECK_WORDS[plan.decidedBy]}. Cap ${plan.cap}.`;
}

export function starWords(stars: Stars): string {
  return `${stars} of 3 stars`;
}

/**
 * The radiation budget in words: which star it took and by how many seconds over, or that the 1-star floor kept
 * the star. Null when fluoro stayed within the allowance.
 */
export function budgetWords(result: Pick<CaseResult, 'stars' | 'starsBeforeBudget' | 'fluoroOverBudgetS'>): string | null {
  if (result.fluoroOverBudgetS <= 0) return null;
  const over = fmt(result.fluoroOverBudgetS, 1);
  if (result.stars < result.starsBeforeBudget) {
    const lost = result.starsBeforeBudget - result.stars;
    const which = lost === 1 ? `star ${result.starsBeforeBudget}` : `stars ${result.stars + 1} to ${result.starsBeforeBudget}`;
    return `The fluoro allowance took ${which}: fluoro went ${over} s over it. You earned ${result.starsBeforeBudget} before the budget.`;
  }
  return `Fluoro went ${over} s over the allowance; the budget never takes the last star.`;
}

export interface PlacedMarker {
  t: number;
  /** 0..100, share of the timeline's duration. */
  pct: number;
  kind: WireEvent['kind'];
  label: string;
}

/** Marker positions along the time axis, in the engine's order. A zero-length drive puts every marker at 0. */
export function placeMarkers(timeline: Pick<ReplayTimeline, 'durationS' | 'markers'>): PlacedMarker[] {
  const d = timeline.durationS;
  return timeline.markers.map((m) => ({
    t: m.t,
    pct: d > 0 ? Math.min(100, Math.max(0, (m.t / d) * 100)) : 0,
    kind: m.kind,
    label: m.label,
  }));
}

export const MARKER_NAME: Record<WireEvent['kind'], string> = {
  force_spike: 'Force spike',
  wrong_branch: 'Wrong branch',
  prolapse: 'Prolapse',
  back_out: 'Back-out',
  contrast_puff: 'Contrast puff',
  target_reached: 'Target reached',
};

/**
 * Record a scored attempt in the progress history once. A drive already recorded (refresh, back and forward)
 * returns the history unchanged. seq is a counter kept next to the history, never a clock time (V6).
 */
export function recordOnce(
  history: readonly ProgressRecord[],
  drive: SavedDrive,
  result: CaseResult,
): { history: ProgressRecord[]; drive: SavedDrive; recorded: boolean } {
  if (drive.recordedSeq !== undefined && history.some((r) => r.seq === drive.recordedSeq)) {
    return { history: [...history], drive, recorded: false };
  }
  const seq = history.reduce((m, r) => Math.max(m, r.seq), 0) + 1;
  return { history: [...history, recordFromResult(seq, result)], drive: { ...drive, recordedSeq: seq }, recorded: true };
}

const TIER_NAME: Record<LadderTier, string> = {
  0: 'low-tortuosity arch',
  1: 'type II arch',
  2: 'type III arch',
  3: 'bovine variant',
  4: 'whole-body planning',
};

/** V6's adaptive suggestion in words (spec §6.5); null when V6 offers none. */
export function suggestionWords(s: Suggestion, titleOf: (caseId: string) => string): string | null {
  if (!s) return null;
  if (s.kind === 'next_tier') return `Two 3-star results on this tier: try the ${TIER_NAME[s.tier]} cases next.`;
  return `Two 1-star results on this tier: try the guided case, ${titleOf(s.caseId)}, before going on.`;
}
