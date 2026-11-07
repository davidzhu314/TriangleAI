/**
 * Progression rules (spec §6.5): the unlock ladder, adaptive difficulty and course grading.
 * The radiation budget is V5's `applyFluoroBudget` (./stars); it costs stars, never progress, so
 * nothing here reads stars to gate a case.
 *
 * Pure: no clock, no randomness, no storage, and inputs are never mutated. The caller supplies the
 * history, ordered by its own integer `seq` (DECISIONS.md, "Progress history and course grading").
 * Outputs are sorted, so shuffling the inputs never changes them.
 */

import type { CaseAnatomy, CaseDifficulty, CaseResult, Stars } from '../contracts';
import { LOW_TORTUOSITY_MAX } from './constants';

export interface ProgressRecord {
  /** Caller-assigned order, unique integer. Never a clock time. */
  seq: number;
  caseId: string;
  reachedTarget: boolean;
  /** After the radiation budget (CaseResult.stars). */
  stars: Stars;
  fluoroOverBudgetS: number;
}

/** The fields of LoadedCase the ladder reads; a LoadedCase satisfies it. */
export interface CaseMeta {
  id: string;
  anatomy?: CaseAnatomy;
  difficulty?: CaseDifficulty;
  planningOnly?: boolean;
}

export type LadderTier = 0 | 1 | 2 | 3 | 4;
export type LadderMode = 'ladder' | 'open';

export type Suggestion = { kind: 'next_tier'; tier: LadderTier; caseIds: string[] } | { kind: 'guided'; caseId: string } | null;

export interface CourseGrade {
  assigned: number;
  completed: number;
  /** 0..1; 1 when nothing is assigned. */
  fraction: number;
  perCase: Record<string, { completed: boolean; attempts: number }>;
}

export const LADDER_TIERS: readonly LadderTier[] = [0, 1, 2, 3, 4];

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A Results screen's CaseResult as a history record. */
export function recordFromResult(seq: number, r: CaseResult): ProgressRecord {
  return { seq, caseId: r.caseId, reachedTarget: r.reachedTarget, stars: r.stars, fluoroOverBudgetS: r.fluoroOverBudgetS };
}

/**
 * The §6.5 ladder tier: low-tortuosity → type II → type III → bovine → whole-body planning.
 * Bovine wins over arch type, and arch type over tortuosity. Null: outside the ladder (always open).
 * Tier 4 has no marker in the case format yet, so no case maps to it.
 */
export function ladderTier(meta: CaseMeta): LadderTier | null {
  const a = meta.anatomy;
  if (!a) return null;
  if (a.bovine === true) return 3;
  if (a.arch_type === 'I') return 0;
  if (a.arch_type === 'II') return 1;
  if (a.arch_type === 'III') return 2;
  if (a.tortuosity !== undefined && a.tortuosity <= LOW_TORTUOSITY_MAX) return 0;
  return null;
}

// ---------------------------------------------------------------- validation

function checkHistory(history: readonly ProgressRecord[]): void {
  const seen = new Set<number>();
  for (const r of history) {
    if (!Number.isInteger(r.seq)) throw new RangeError(`progress: seq must be an integer, got ${r.seq}`);
    if (seen.has(r.seq)) throw new RangeError(`progress: seq ${r.seq} appears twice`);
    seen.add(r.seq);
  }
}

function checkCases(cases: readonly CaseMeta[]): void {
  const seen = new Set<string>();
  for (const c of cases) {
    if (seen.has(c.id)) throw new RangeError(`progress: case ${c.id} appears twice`);
    seen.add(c.id);
  }
}

/** History sorted by seq (a copy). */
function ordered(history: readonly ProgressRecord[]): ProgressRecord[] {
  checkHistory(history);
  return [...history].sort((a, b) => a.seq - b.seq);
}

/** Case ids per tier, each sorted. */
function tiersOf(cases: readonly CaseMeta[]): Map<LadderTier, string[]> {
  checkCases(cases);
  const out = new Map<LadderTier, string[]>(LADDER_TIERS.map((t) => [t, []]));
  for (const c of cases) {
    const t = ladderTier(c);
    if (t !== null) out.get(t)!.push(c.id);
  }
  for (const ids of out.values()) ids.sort(byId);
  return out;
}

// ---------------------------------------------------------------- library

/** Case ids with at least one record that reached the target, sorted. */
export function completedCaseIds(history: readonly ProgressRecord[]): string[] {
  checkHistory(history);
  return [...new Set(history.filter((r) => r.reachedTarget).map((r) => r.caseId))].sort(byId);
}

/** Best stars over the case's records; 0 if none. */
export function bestStars(caseId: string, history: readonly ProgressRecord[]): Stars {
  checkHistory(history);
  let best = 0;
  for (const r of history) if (r.caseId === caseId && r.stars > best) best = r.stars;
  return best as Stars;
}

/**
 * Open tiers that have cases, ascending. Tier 0 is always open; tier n+1 opens when tier n is open
 * and is empty or has a completed case. 'open' mode opens every tier.
 */
export function unlockedTiers(cases: readonly CaseMeta[], history: readonly ProgressRecord[], mode: LadderMode): LadderTier[] {
  const tiers = tiersOf(cases);
  const done = new Set(completedCaseIds(history));
  const out: LadderTier[] = [];
  let open = true;
  for (const t of LADDER_TIERS) {
    const ids = tiers.get(t)!;
    const isOpen: boolean = mode === 'open' || open;
    if (isOpen && ids.length > 0) out.push(t);
    open = isOpen && (ids.length === 0 || ids.some((id) => done.has(id)));
  }
  return out;
}

/** Unlocked case ids, sorted by (tier, id), with cases outside the ladder last. */
export function unlockedCaseIds(cases: readonly CaseMeta[], history: readonly ProgressRecord[], mode: LadderMode): string[] {
  const tiers = tiersOf(cases);
  const ids: string[] = [];
  for (const t of unlockedTiers(cases, history, mode)) ids.push(...tiers.get(t)!);
  ids.push(...cases.filter((c) => ladderTier(c) === null).map((c) => c.id).sort(byId));
  return ids;
}

export function isUnlocked(caseId: string, cases: readonly CaseMeta[], history: readonly ProgressRecord[], mode: LadderMode): boolean {
  return unlockedCaseIds(cases, history, mode).includes(caseId);
}

/** Highest unlocked tier that has cases; null when no ladder case exists. */
export function currentTier(cases: readonly CaseMeta[], history: readonly ProgressRecord[], mode: LadderMode): LadderTier | null {
  return unlockedTiers(cases, history, mode).at(-1) ?? null;
}

/** The Library's "next case": the first unlocked case (tier, then id) not yet completed; null when all are done. */
export function nextCase(cases: readonly CaseMeta[], history: readonly ProgressRecord[], mode: LadderMode): string | null {
  const done = new Set(completedCaseIds(history));
  return unlockedCaseIds(cases, history, mode).find((id) => !done.has(id)) ?? null;
}

// ---------------------------------------------------------------- adaptive difficulty

/**
 * After two 3★ results on the player's tier, offer the next tier; after two 1★, suggest guided mode.
 * The player's tier is the tier of their most recent ladder record (DECISIONS.md, "Adaptive
 * difficulty"). 0★ counts as neither. The 3★ rule is checked first.
 */
export function adaptiveSuggestion(cases: readonly CaseMeta[], history: readonly ProgressRecord[], mode: LadderMode): Suggestion {
  const tiers = tiersOf(cases);
  const tierOf = new Map<string, LadderTier>();
  for (const [t, ids] of tiers) for (const id of ids) tierOf.set(id, t);
  const ladder = ordered(history).filter((r) => tierOf.has(r.caseId));
  const last = ladder.at(-1);
  if (!last) return null;
  const tier = tierOf.get(last.caseId)!;
  const recent = ladder.filter((r) => tierOf.get(r.caseId) === tier).slice(-2);
  if (recent.length < 2) return null;

  if (recent.every((r) => r.stars === 3)) {
    const next = LADDER_TIERS.find((t) => t > tier && tiers.get(t)!.length > 0);
    if (next === undefined) return null;
    // with two finishes on this tier the next one is open in ladder mode; check rather than assume
    if (!unlockedTiers(cases, history, mode).includes(next)) return null;
    return { kind: 'next_tier', tier: next, caseIds: [...tiers.get(next)!] };
  }
  if (recent.every((r) => r.stars === 1)) {
    const lowest = LADDER_TIERS.find((t) => tiers.get(t)!.length > 0)!;
    return { kind: 'guided', caseId: tiers.get(lowest)![0]! };
  }
  return null;
}

// ---------------------------------------------------------------- course grading

/** Completion and effort only (§6.5): never stars or scores. */
export function courseGrade(assignedIds: readonly string[], history: readonly ProgressRecord[]): CourseGrade {
  checkHistory(history);
  const assigned = [...new Set(assignedIds)].sort(byId);
  const perCase: CourseGrade['perCase'] = {};
  for (const id of assigned) perCase[id] = { completed: false, attempts: 0 };
  for (const r of history) {
    const p = perCase[r.caseId];
    if (!p) continue;
    p.attempts++;
    if (r.reachedTarget) p.completed = true;
  }
  const completed = assigned.filter((id) => perCase[id]!.completed).length;
  return { assigned: assigned.length, completed, fraction: assigned.length === 0 ? 1 : completed / assigned.length, perCase };
}
