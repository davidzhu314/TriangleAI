# Handoff — Gibran G2: demo rehearsal 1

What landed:
- **`team/rehearsal/checklist.md`:** `team/DEMO.md` beat by beat, with what to click, what should appear and what to check, plus the fallback line. Presenter workarounds from this run are included.
- **`team/rehearsal/2026-11-07.md`:** run 1 on the production build in rail mode.
- **`team/requests/to-aroovee-from-gibran-rehearsal-1.md`:** five issues, most important first.

How to use: before any rehearsal, follow `team/rehearsal/checklist.md`, and record the run as `team/rehearsal/<date>.md`.
Who switches:
- **Aroovee:** decide how the Compare beat ends. As scripted (risk slider to maximum, then switch to the right radial route), the drive scores plan 0 of 100, 1 star, and "Revise the plan". Also decide whether Drive stops counting fluoro at the target. Then refresh two DEMO.md fact lines: the Slicer fixture exists since #34, and the feedback-order request was answered in #32.
- **Presenter:** skip the tutorial, scroll to the weights, release Space at the target, and click "Finish drive".

Mock replaced: none
Contracts version after this handoff: unchanged (1)
Tests:
- `pnpm exec playwright test tests/e2e/a8-demo.spec.ts`: 7 of 7 green on this build (47 s).
- `pnpm test`: green on main after #44.

New dependencies: none
Decisions logged: none
Known gaps:
- **Beat times:** the beats were driven by Claude Code in the browser, so the timings aren't a presenter's. A human-timed run is still needed.
- **Physics:** not rehearsed, because no physics process was running on this machine.
- **Manual import:** not done by hand, because the built-in browser can't pick a local file. A8 covers the import.
- **DECISIONS.md:** two lines are duplicated by the union merge, for David to tidy.
