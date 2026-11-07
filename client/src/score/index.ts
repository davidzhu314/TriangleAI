/**
 * Scoring entry point for the app. Import from here, never from ./mock.
 *
 * With VITE_ENGINE=mock, `scoreAttempt` returns the V1 mock CaseResult (placeholder numbers). In a
 * real build the mock is not bundled. Real scoring lands in V5; until then, a real build rejects
 * with an error saying so.
 */

import type { CaseResult, EventLog, OptimizeResult, Weights } from '../contracts';

export { engineMode, type EngineMode } from '../optimize/engine-mode';

export interface ScoreInput {
  /** The drive's event log (scores come from it alone, plus the plan below). */
  log: EventLog;
  /** What the optimizer returned for this case and target. */
  optimized: OptimizeResult;
  /** The player's weights when they chose the route. */
  weights: Weights;
}

export async function scoreAttempt(_input: ScoreInput): Promise<CaseResult> {
  if (import.meta.env.VITE_ENGINE === 'mock') {
    const { mockCaseResult } = await import('./mock');
    return mockCaseResult();
  }
  throw new Error('Real scoring lands in V5. Build or run with VITE_ENGINE=mock to use the mock.');
}
