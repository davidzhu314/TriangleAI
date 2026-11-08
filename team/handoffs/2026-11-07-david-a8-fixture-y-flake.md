# Handoff — David (for Aroovee): A8 fixture-y flake fix

What landed: `tests/e2e/a8-demo.spec.ts`.
- `driveToTarget(recipes, clock?)`: with a Playwright clock, it pauses page time once the wire has started. It then holds the rotate key for exactly `holdMs` (`clock.runFor`), pushes W in one-second steps of page time until the banner reports the outcome, and resumes the clock.
- The fixture-y test opens its own tab with `page.clock.install()` and drives with that clock.
- The six Type III beats are unchanged: real clock, W alone.

Why:
- The rail ticks on `setInterval`. Under load, intervals fire late, so a hold played back in wall time gives fewer ticks than the model computed, and all recipes miss alike.
- fixture-y has no route drivable on W alone: its left-branch windows are about 11 ticks wide, and the right branch has no safe route.

How to use: `playwright test tests/e2e/a8-demo.spec.ts`. Gibran: the rehearsal checklist's note on this test can go.
Who switches: nobody. Aroovee: the test helper takes an optional clock now.
Mock replaced: none
Contracts version after this handoff: unchanged (1)
Tests:
- fixture-y solo under load average 7–23: 6/6 passed. The old version also passed 3/3 on this machine, so the flake didn't reproduce here; the fix is deterministic by construction.
- Full a8: 7/7.
- Full unit and Playwright counts are in the PR.
New dependencies: none
Decisions logged: DECISIONS.md 2026-11-07 "A8 fixture-y drive on a fake clock"
Known gaps: the Type III drive still holds W in real time. That works because W alone reaches the target, so it has no timing window.
