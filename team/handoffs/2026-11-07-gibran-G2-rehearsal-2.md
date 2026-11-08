# Handoff — Gibran G2 rehearsal 2, and the G4 steering check

What landed:
- **`team/rehearsal/checklist.md`:** updated to the fixed build. Slider back to equal before switching, entry-named rows, no scrolling, fluoro stops at the target, and the Slicer `case.zip` for Scale.
- **`team/rehearsal/2026-11-07-2.md`:** run 2 on the production build in rail mode. All 5 rehearsal-1 issues are fixed. Results shows plan 100 of 100, drive 100, 3 stars and "Retry the drive". Fluoro stays at 21.4 s after the target with Space held.
- **`tests/engine/cathy-grounding.test.ts`:** with `graph` (#51), across every bundled case, target, entry, wire and prefix (319 plan states):
  - `best` is always steerable;
  - each option's `steerable` matches `steerableAt`;
  - `cannot_steer` says "try another wire or entry" with no numbers;
  - every target with a frontier has at least one steerable route.
- **`metrics/gibran/cathy-qa.md`:** refreshed. It lists the 4 CT-case wire/entry pairs where Cathy now says "try another wire or entry".
- **`team/requests/to-aroovee-from-gibran-a8-fixture-y-flaky.md`:** the A8 fixture-y test is timing-flaky. Low priority; the six demo beats pass.

How to use: rehearse with `team/rehearsal/checklist.md`. Run `pnpm exec vitest run tests/engine/cathy-grounding.test.ts`.
Who switches:
- **Callers of `planAssist`:** pass `graph`, or "best" can still name an unsteerable route (ts-s1404-cta → lcca).
- **A human:** do the timed run on the demo laptop.

Mock replaced: none
Contracts version after this handoff: unchanged (1)
Tests:
- `pnpm test`: green.
- A8: the six demo beats pass; the fixture-y test is flaky (see the request).

New dependencies: none
Decisions logged: none
Known gaps: human beat timing; a physics rehearsal; the manual drag-and-drop import (A8 covers it).
