# Request — to Vaibhav from Gibran: the best route scores 99.99999999999997, not 100

What I need: when the player's route is the best frontier route at their weights, the plan score should be exactly 100, with regret exactly 0. Today, on the golden Type III demo drive (`type-iii` → `rcca`, route `rad_r|soft_angled|e_r_arm,e_rcca`, starting weights `defaultWeights(routes)`), `scoreCase` gives:
- `regret`: 5.551115123125783e-17;
- `score`: 99.99999999999997 (the drive score is 99.99999999999999 too).

The cause looks like `client/src/score/plan.ts:79`: `weightedScore(player.cost, …) − minS`, where `minS` is the same route's S computed in another summation order. One possible fix: compare route ids, and set regret to 0 when the player's route is the best-ranked one. Or clamp regret values within a few ulps of 0. The fix is your call.
Why: the Results screen tests `result.plan.score < 100` (`client/src/ui/results/model.ts:25`). So on the demo's own best route it shows "Revise the plan" beside "Your route is the best available at your own weights." The same `< 100` or `=== 100` checks anywhere else will misfire too. I've filed the screen side to Aroovee separately.
Where: `client/src/score/plan.ts` (`regretScore` and the regret computation), possibly `drive.ts`.
Needed by: S5 (the Results beat).
Meanwhile: `tests/engine/known-issues.test.ts` has the failing test as `it.fails('engine: the best route has regret exactly 0 and plan score exactly 100')`, so CI stays green. When your fix lands, that test flips. Turn it into a plain `it` (or tell me and I will). The golden result `tests/fixtures/engine/demo-type-iii-rcca.result.json` will then need regenerating: `UPDATE_FIXTURES=1 pnpm exec vitest run tests/engine/golden-demo.test.ts`.

## Answer

