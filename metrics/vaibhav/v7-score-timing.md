# V7 — scoring timing

Written by `UPDATE_METRICS=1 pnpm exec vitest run client/src/score/score.timing.test.ts`. The same test asserts median scoreCase < 100 ms on every CI run (DECISIONS.md, "Engine timing budgets").

Machine: win32 x64, Node v26.10.0. Main thread, after a warm-up. Date of run: written by the test, 2026-11-07. 20 runs each after 3 warm-up runs. Every run includes the gentleness reference drive (it is not cached). The optimizer result is an input (the Plan screen already has it) and is not timed.

| Golden log | Samples | scoreCase median ms | p95 ms | Max ms | Reference drive alone, median ms |
| --- | --- | --- | --- | --- | --- |
| score-clean-fixture-y | 236 | 2.797 | 4.509 | 4.509 | 0.811 |
| score-wrong-branch-fixture-y | 359 | 2.911 | 5.346 | 5.346 | 0.750 |
| score-prolapse-fixture-y | 493 | 3.738 | 5.270 | 5.270 | 0.830 |
| score-over-budget-fixture-y | 2336 | 12.635 | 22.836 | 22.836 | 1.137 |
| rail-golden-diamond-j | 375 | 2.640 | 3.446 | 3.446 | 0.900 |
