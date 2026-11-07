# Handoff — Vaibhav V7: performance and voice pass

What landed:
- **Timing tests.** Each one asserts its budget on every CI run, and with `UPDATE_METRICS=1` writes a summary to `metrics/vaibhav/`.
  - `wire/rail.timing.test.ts` → `v7-rail-step-timing.md`
  - `score/score.timing.test.ts` → `v7-score-timing.md`
  - `score/progress.timing.test.ts` → `v7-progress-timing.md`
  - The V2 and V3 metrics are refreshed.
  - Shared helpers live in `optimize/timing.testutil.ts`.
- **`metrics/vaibhav/v7-summary.md`:** the one table for the demo Q&A, with every engine timing against its budget.
- **Voice guard:** `score/templates.test.ts`. Every template keeps its frozen set of placeholders, has no digit and contains no never-say phrase, and `feedback.ts` uses every template and no unknown one.
- **Voice review request:** `team/requests/to-aroovee-from-vaibhav-feedback-voice.md`.
- **Engine hygiene:** `score/engine-hygiene.test.ts`. It checks that the engine source (`optimize/`, `score/`, `wire/rail*`) reads no clock, randomness or browser storage. The one exception is the measure Worker's elapsed-time report, which is timing metadata and never part of a result. The same test checks that every illustrative constant is listed against a real DECISIONS.md line.
- **`ILLUSTRATIVE_CONSTANTS`** in `score/illustrative.ts`, exported from `score/index.ts`. Each row has an id, a plain-words label, the value, its unit and its DECISIONS.md line. The values are read from the constants themselves, never copied.
- **Deferred item done:** `optimize/mock-case.ts` is gone.
  - Fixture-y tests now load through David's `loadCase`.
  - The synthetic fixtures have no `vessels.glb`, so `loadCase` can't load them. They use a small test-only builder, `optimize/case-builder.testutil.ts`.

## Where each budget stands (from v7-summary.md, 2026-11-07, win32 x64, Node v26)

| Engine step | Budget | Worst median | Result |
| --- | --- | --- | --- |
| measureRoute | < 16.7 ms | 0.83 ms | Pass |
| Re-rank, 1000 routes | p95 < 16 ms | p95 1.26 ms | Pass |
| Optimize, typical (cold) | median < 50 ms | 2.94 ms | Pass |
| Optimize, 84-edge grid | median < 500 ms | 15.5 ms | Pass |
| Rail step(), per frame | median < 1 ms | 0.002 ms | Pass |
| scoreCase per golden log | median < 100 ms | 12.6 ms | Pass |
| Gentleness reference drive | logged only | 1.1 ms | — |
| Progression, 50 cases × 1000 records | median < 5 ms | 0.15 ms | Pass |

**No optimisation was needed.** Every budget passes with a wide margin, so the reference cache from the plan wasn't built (DECISIONS.md, "Gentleness reference cache: not needed"). No engine code changed in V7. Proof that results are unchanged: the golden scoring logs and the V4 rail golden all replay byte for byte, with fixture-y now loaded through `loadCase`.

Who switches:
- **Aroovee:**
  - **Voice review.** The request lists all 23 templates, their placeholders and units, and real examples copied from the golden results. Change words only; I apply your wording in its own commit and the guard tests check it. It hasn't been answered yet, so the wording lands as a follow-up commit.
  - **Illustrative labels.** Label these on-screen numbers as illustrative; `ILLUSTRATIVE_CONSTANTS` gives a tooltip label for each:
    - the wire presets' tip angle, maximum turn and minimum vessel width;
    - estimated fluoro time, everywhere it shows;
    - the force numbers and the force-spike threshold on the Drive HUD and Results;
    - the gentleness and radiation scores;
    - the stars lost to the fluoro allowance;
    - the player's risk weights, which are illustrative by spec.
- **David:** D6-min isn't on main yet, so its cases aren't in V7. Once they land in `client/public/cases/`, they need adding by hand to:
  - the rail acceptance and timing lists, and `SYNTHETIC` in `rail.timing.test.ts`;
  - the optimizer and score timing tests;
  - the NumPy cross-checks;
  - the progression tests, replacing the made-up anatomy.

  That's my follow-up. They need the `anatomy` fields from the V6 handoff to land on the right ladder tiers.

Mock replaced: `optimize/mock-case.ts` (deleted; nothing in the app used it).
Contracts version after this handoff: unchanged (1)
Tests: `pnpm test` gives 497 green, twice in a row, timing tests included. `python -m pytest tests/crosscheck -q` gives 164 green. The production build is clean, with no mock markers, and the build-guard test confirms the real optimizer, rail wire and scorer are bundled.
New dependencies: none
Decisions logged: "Engine timing budgets (illustrative)"; "Gentleness reference cache" and "Gentleness reference cache: not needed"; "Feedback voice review rule".
Known gaps:
- **D6-min cases** are not yet in the timings, cross-checks, rail acceptance or progression tests (see David above).
- **The feedback voice review** is still open.
- **The steerability constraint:** the optimizer doesn't check whether a preset's tip can point into a branch. This needs a contract request for a new violation kind.
- **The §4.4 arch constraint and the two simulated measures** wait for real recorded runs (D4).
- **Ladder tier 4 (whole-body planning)** needs a marker in the case format.
- **Physics latency and frame time** are measured in the physics and rendering lanes, not here.
