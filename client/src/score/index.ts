/**
 * Scoring entry point for the app. Import from here, never from ./mock or the modules below.
 *
 * In a real build `scoreAttempt` runs the V5 scoring engine (./score): plan and drive scores, stars
 * and feedback, computed from the event log and the optimizer's output. With VITE_ENGINE=mock it
 * returns the V1 mock CaseResult (placeholder numbers), and the mock is not bundled otherwise.
 */

import type { CaseResult } from '../contracts';
import { scoreCase, type ScoreInput } from './score';

export { engineMode, type EngineMode } from '../optimize/engine-mode';
export { scoreCase, referenceFor, type ScoreInput } from './score';
export { FEEDBACK_TEMPLATES, fillTemplate, type TemplateId } from './templates';
export { applyFluoroBudget, starsFor } from './stars';
export type { ForceReference } from './reference';
export { LOW_TORTUOSITY_MAX } from './constants';
export {
  adaptiveSuggestion,
  bestStars,
  completedCaseIds,
  courseGrade,
  currentTier,
  isUnlocked,
  LADDER_TIERS,
  ladderTier,
  nextCase,
  recordFromResult,
  unlockedCaseIds,
  unlockedTiers,
  type CaseMeta,
  type CourseGrade,
  type LadderMode,
  type LadderTier,
  type ProgressRecord,
  type Suggestion,
} from './progress';

export async function scoreAttempt(input: ScoreInput): Promise<CaseResult> {
  if (import.meta.env.VITE_ENGINE === 'mock') {
    const { mockCaseResult } = await import('./mock');
    return mockCaseResult();
  }
  return scoreCase(input);
}
