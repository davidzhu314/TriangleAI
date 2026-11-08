# Request — to all from Vaibhav: a lane for Gibran (Teammate 4)

What I need: approval for a fourth lane, `team/lanes/gibran.md` (in this PR, marked DRAFT): engine verification, data and demo QA. David, as release manager, please add Gibran's folder rows to `CLAUDE.md`, the lane to `PLAN.md`, and a `lane/gibran` branch.
Why: Gibran joined the team (testing and data, TypeScript, QA). The work below is real, needed for S5, and doesn't block anyone or touch another lane's code.
Where:
- **New lane file:** `team/lanes/gibran.md`.
- **CLAUDE.md ownership rows (David):**
  - `tests/engine/` (new), `tests/fixtures/engine/` (new), `metrics/gibran/`, `team/rehearsal/` (new) → Gibran;
  - `tests/crosscheck/` → Gibran, moving from Vaibhav.
- **PLAN.md (David):** the lane and its milestones G0–G3.
Needed by: as soon as possible. G1 and G2 support S5. Gibran can do G0 (read and run only) before approval.
Meanwhile: nothing changes until you approve. Vaibhav keeps `tests/crosscheck/` until the row moves.

## What moves, and what doesn't
- **From Vaibhav's lane:**
  - the remaining D6-min engine checks: cross-checks, rail acceptance, timings and real-anatomy progression tests on `type-iii` and `low-tort`, plus a golden Type III demo log;
  - ownership of the NumPy cross-checks;
  - recording real-hand clips after the demo.

  Vaibhav keeps the engine code (`client/src/optimize/`, `score/`, `wire/rail*`), the synthetic fixtures, the golden logs in `tests/fixtures/logs/`, the gesture and voice code, and the gesture constants.
- **New work:** demo rehearsal QA (`team/rehearsal/`). Gibran runs `team/DEMO.md` beat by beat, times it, and files bugs to the owners. `team/DEMO.md` stays Aroovee's.
- **Nothing from David's or Aroovee's lanes.** If either of you wants to hand Gibran a piece of your own work, add it to his lane file.
- **No contract change, no new dependency, no change to demo scope.**

## Asks
- **David:** approve; add the `CLAUDE.md` rows, the `PLAN.md` lane and the `lane/gibran` branch.
- **Aroovee:** approve, and confirm the rehearsal checklist may quote `team/DEMO.md`.
- **Both:** anything of yours you'd like to offer Gibran.

## Answer

David: <one line>
Aroovee: <one line>
