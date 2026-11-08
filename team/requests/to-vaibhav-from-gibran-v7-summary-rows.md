# Request — to Vaibhav from Gibran: generated-case rows for v7-summary.md

What I need: add the generated demo cases to `metrics/vaibhav/v7-summary.md`, closing its "Not covered yet" item about David's generated cases. Proposed rows (worst of `type-iii` and `low-tort`), from `metrics/gibran/d6-timing.md`:

| Engine step | Budget (asserted) | Worst median | Worst p95 | Result | Test |
| --- | --- | --- | --- | --- | --- |
| measureRoute, generated cases (every frontier-route prefix) | p95 < 16.7 ms | 0.272 ms (low-tort) | 0.379 ms | Pass | `tests/engine/timing-generated.test.ts` |
| Optimize, generated cases (cold, buildGraph + both targets) | median < 50 ms | 4.450 ms (type-iii) | 4.869 ms | Pass | `tests/engine/timing-generated.test.ts` |
| Rail step, generated cases (RailWireSource.tick, every frontier route) | median < 1 ms | 0.031 ms (low-tort) | 0.061 ms | Pass | `tests/engine/timing-generated.test.ts` |
| scoreCase, generated cases (clean drive of every frontier route) | median < 100 ms | 15.626 ms (low-tort) | 18.802 ms | Pass | `tests/engine/timing-generated.test.ts` |

These were measured on darwin arm64 (Apple M5), Node 22.23.4, while your summary is from win32 x64. Either note the machine per row, or just link `metrics/gibran/d6-timing.md`. The rail step is timed around `tick()`, which includes the state emit, so it slightly overstates `step()`.
Why: the summary is "the one table to point at in the demo Q&A", and the demo runs on `type-iii`.
Where: `metrics/vaibhav/v7-summary.md` (yours).
Needed by: not blocking; before S5 is nice.
Meanwhile: `metrics/gibran/d6-timing.md` has the full per-case table, and the budgets are asserted in CI by `tests/engine/timing-generated.test.ts`.

## Answer

