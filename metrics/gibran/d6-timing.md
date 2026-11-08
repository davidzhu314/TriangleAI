# G1 — engine timing on the generated cases

Written by `UPDATE_METRICS=1 pnpm exec vitest run tests/engine/timing-generated.test.ts`. Machine: darwin arm64, Node v22.23.4. Main thread, after a warm-up. Date of run: 2026-11-08.

The V7 budgets (DECISIONS.md, "Engine timing budgets", illustrative), on `type-iii` and `low-tort` loaded through `loadCase`. Each budget uses the statistic its V7 test asserts, and the test asserts it on every CI run. Rail step is timed around `RailWireSource.tick()`, which also emits the state, so it slightly overstates `step()` alone.

| Case | Engine step | Budget (asserted) | Median ms | p95 ms | Max ms | n | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| type-iii | optimize, cold (buildGraph + 2 targets) | median < 50 ms | 4.450 | 4.869 | 4.959 | 50 | Pass |
| type-iii | measureRoute, 40 frontier-route prefixes | p95 < 16.7 ms | 0.212 | 0.370 | 0.511 | 800 | Pass |
| type-iii | rail step (RailWireSource.tick, autopilot, every frontier route) | median < 1 ms | 0.028 | 0.061 | 0.499 | 8610 | Pass |
| type-iii | scoreCase, 10 clean frontier drives at the default weights | median < 100 ms | 8.164 | 16.661 | 17.699 | 100 | Pass |
| low-tort | optimize, cold (buildGraph + 2 targets) | median < 50 ms | 1.194 | 1.300 | 1.309 | 50 | Pass |
| low-tort | measureRoute, 20 frontier-route prefixes | p95 < 16.7 ms | 0.272 | 0.379 | 0.441 | 400 | Pass |
| low-tort | rail step (RailWireSource.tick, autopilot, every frontier route) | median < 1 ms | 0.031 | 0.060 | 0.335 | 4154 | Pass |
| low-tort | scoreCase, 4 clean frontier drives at the default weights | median < 100 ms | 15.626 | 18.802 | 20.205 | 40 | Pass |
