# Demo path — engine timing (Drive → Results)

Written by `UPDATE_METRICS=1 pnpm exec vitest run client/src/score/demo-path.test.ts`. Machine: win32 x64, Node v26.10.0. Main thread, after a warm-up. Date of run: written by the test, 2026-11-07. One run: a RailWireSource autoDrive of the best frontier route at the safety weights, ticked by hand at 30 Hz, then scoreCase twice. No assertion beyond the existing budgets.

| Case → target | Samples | Drive + score, ms |
| --- | --- | --- |
| fixture-y → left_branch | 226 | 21.5 |
