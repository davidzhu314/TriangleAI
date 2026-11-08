# Request — to Aroovee from Gibran: the A8 fixture-y test is flaky

What I need: make `tests/e2e/a8-demo.spec.ts` › "fixture-y: Plan → Compare → Drive → Results" stable, or mark it as not part of the demo gate. On `main` at 0112303 (Apple M5, load average about 5), it failed in two full A8 runs and in one of two solo runs, with "Error: no key recipe reached the target". The page shows "Off the planned route: the tip is in the Right branch." The six Type III demo beats pass every time.
Why: the drive needs a rotate key (D/A) held for `holdMs`, a value computed from the rail model and played back in real time (`page.waitForTimeout`). A few frames of drift under load put the tip into the wrong branch. A flaky test in the demo gate will cost time on the last night.
Suggested: pick the middle of the widest rotation window (already the sort order, so check the window is wide enough to absorb a few frames); retry each recipe once before moving on; or drive fixture-y on a route that needs no rotation, as the Type III beat does.
Where: `tests/e2e/a8-demo.spec.ts` (`keyRecipes`, `driveToTarget`), yours.
Needed by: not blocking the demo (the presenter drives type-iii on W alone); before relying on A8 as the S5 gate.
Meanwhile: `team/rehearsal/2026-11-07-2.md` records it. The six demo beats are what the rehearsal checks.

## Answer

