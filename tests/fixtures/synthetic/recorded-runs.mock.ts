/**
 * TEST FIXTURE ONLY. A recorded-runs file in contract shape, so later tests of the §4.4 arch
 * constraint and the simulated measures have something to read. It must never feed the app
 * (DECISIONS.md, "Recorded runs are real or absent"); `recorded-runs.mock.test.ts` fails if
 * anything under client/ imports it.
 *
 * These are not CathSim results. The values are deliberately round placeholders (10 runs, rates
 * 0.5 and 0, forces 1 N) that exercise the code paths: one pair that reached the target and one
 * that never did (`reached: false`).
 */

import { RECORDED_RUNS_SCHEMA, type RecordedRuns } from '../../../client/src/contracts';

export const RECORDED_RUNS_TEST_FIXTURE: RecordedRuns = {
  schema: RECORDED_RUNS_SCHEMA,
  cathsim: 'none: synthetic test fixture, not CathSim output',
  stepS: 0.012,
  stats: [
    {
      phantom: 'phantom3',
      target: 'bca',
      presetId: 'standard_j',
      runs: 10,
      successes: 5,
      successRate: 0.5,
      peakForceN: 1,
      cumulativeForceNs: 1,
      reached: true,
    },
    {
      phantom: 'phantom3',
      target: 'bca',
      presetId: 'stiff_straight',
      runs: 10,
      successes: 0,
      successRate: 0,
      peakForceN: 1,
      cumulativeForceNs: 1,
      reached: false,
    },
  ],
  replays: [],
};
