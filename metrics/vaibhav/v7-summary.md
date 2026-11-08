# V7 — engine timing summary

The one table to point at in the demo Q&A. Every engine timing against its budget (DECISIONS.md, "Engine timing budgets", illustrative). Each budget is asserted on every CI run by the test named in its row.

Run 2026-11-07 on win32 x64, Node v26.10.0, a laptop, on the main thread after a warm-up. These are worst cases across the cases in each detail file, which has the per-case rows: `v2-measure-route-timing.md`, `v3-optimizer-timing.md`, `v7-rail-step-timing.md`, `v7-score-timing.md` and `v7-progress-timing.md`.

| Engine step | Budget (asserted) | Worst median | Worst p95 | Result | Test |
| --- | --- | --- | --- | --- | --- |
| measureRoute (Plan screen, per click) | < 16.7 ms (one frame) | 0.829 ms (1 m, 10 edges) | 1.528 ms | Pass | `optimize/measure-route.timing.test.ts` |
| Re-rank on a slider move, 1000-route frontier | p95 < 16 ms | 0.830 ms | 1.264 ms | Pass | `optimize/rank.test.ts` |
| Optimize, typical case (cold) | median < 50 ms | 2.941 ms (random graph) | 5.151 ms | Pass | `optimize/rank.test.ts` |
| Optimize, 84-edge grid (Yen k = 10) | median < 500 ms | 15.526 ms | 20.180 ms | Pass | `optimize/rank.test.ts` |
| Rail step(), per frame | median < 1 ms | 0.002 ms (fixture-y) | 0.006 ms | Pass | `wire/rail.timing.test.ts` |
| scoreCase, end to end per golden log | median < 100 ms | 12.635 ms (over-budget log, 2336 samples) | 22.836 ms | Pass | `score/score.timing.test.ts` |
| Gentleness reference drive alone | logged only | 1.137 ms | — | — | `score/score.timing.test.ts` |
| Progression function, 50 cases × 1000 records | median < 5 ms | 0.146 ms (nextCase) | 0.261 ms | Pass | `score/progress.timing.test.ts` |
| measureRoute, generated cases (every frontier-route prefix) ¹ | p95 < 16.7 ms | 0.272 ms (low-tort) | 0.379 ms | Pass | `tests/engine/timing-generated.test.ts` |
| Optimize, generated cases (cold, buildGraph + both targets) ¹ | median < 50 ms | 4.450 ms (type-iii) | 4.869 ms | Pass | `tests/engine/timing-generated.test.ts` |
| Rail step, generated cases (`RailWireSource.tick`, every frontier route) ¹ ² | median < 1 ms | 0.031 ms (low-tort) | 0.061 ms | Pass | `tests/engine/timing-generated.test.ts` |
| scoreCase, generated cases (clean drive of every frontier route) ¹ | median < 100 ms | 15.626 ms (low-tort) | 18.802 ms | Pass | `tests/engine/timing-generated.test.ts` |

No optimisation was needed in V7: every budget passes with a wide margin, so the gentleness reference is not cached (DECISIONS.md, "Gentleness reference cache: not needed").

¹ The generated demo cases, `type-iii` and `low-tort`: Gibran's G1 measurements, on darwin arm64 (Apple M5), Node v22.23.4, 2026-11-08. The other rows are from the win32 x64 laptop above. Per-case detail: `metrics/gibran/d6-timing.md`. These rows close the earlier gap for David's generated cases.
² Timed around `RailWireSource.tick()`, which also emits the wire state, so it slightly overstates `step()` alone.

**Not covered yet:**
- **Physics latency and frame time** are measured on the physics and rendering lanes (`metrics/david/`, `metrics/aroovee/`), not here.
