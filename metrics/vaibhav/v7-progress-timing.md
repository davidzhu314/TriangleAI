# V7 — progression timing

Written by `UPDATE_METRICS=1 pnpm exec vitest run client/src/score/progress.timing.test.ts`. The same test asserts median < 5 ms per function on every CI run (DECISIONS.md, "Engine timing budgets").

Machine: win32 x64, Node v26.10.0. Main thread, after a warm-up. Date of run: written by the test, 2026-11-07. 200 runs each after 20 warm-up runs. Catalog: 50 generated cases (types I–III, bovine, and 5 outside the ladder). History: 1000 records with unique seq from a seeded generator; 13 cases assigned for grading.

| Function | Median ms | p95 ms | Max ms |
| --- | --- | --- | --- |
| unlockedTiers | 0.073 | 0.136 | 1.474 |
| unlockedCaseIds | 0.080 | 0.131 | 0.723 |
| isUnlocked | 0.078 | 0.196 | 0.531 |
| nextCase | 0.146 | 0.261 | 0.792 |
| adaptiveSuggestion | 0.096 | 0.157 | 0.526 |
| courseGrade | 0.057 | 0.086 | 0.514 |
