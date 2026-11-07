# Handoff — Vaibhav V5: plan and drive scores

What landed: the real scoring engine in `client/src/score/` (spec §6.1–6.4, §6.6).
- `plan.ts`: the four capped checks (feasible → 0, heavy crossings → 40, off the frontier → 80, then regret), with regret from V3's normalised S, and the top contributor.
- `drive.ts`: path fidelity, gentleness, radiation and errors, with the §6.2 weights. Time is shown, never scored.
- `reference.ts`: the gentleness reference, the rail autopilot driving the best-ranked frontier route.
- `stars.ts`: the §6.3 star rule and the §6.5 radiation budget, as pure functions V6 can reuse.
- `templates.ts` and `feedback.ts`: 22 feedback templates, ordered most important first.
- `score.ts`: `scoreCase`, pure and deterministic. `index.ts`: `scoreAttempt` now runs it; the mock stays behind `VITE_ENGINE=mock`.
- `route-of-log.ts`: finds the player's route among the candidates, or measures it with the optimizer's new `routeFor`.
- Golden logs with their expected results in `tests/fixtures/logs/`: `score-clean-fixture-y`, `score-wrong-branch-fixture-y`, `score-prolapse-fixture-y`, `score-over-budget-fixture-y`, and `rail-golden-diamond-j.result.json` for the V4 log.
- NumPy fidelity cross-check: `tests/crosscheck/test_score_fidelity.py`.

How to use:
```ts
import { scoreAttempt } from '../score';
const result = await scoreAttempt({ log, optimized, weights, case: loadedCase });
// result.stars, result.plan.score, result.drive.score; result.feedback[0] is the line that matters most
```
`ScoreInput` gained `case: LoadedCase` (it lives in `score/index.ts`, not in the contracts). Pass the same case the drive used: fidelity needs its centerlines, feedback needs vessel and target names, and the budget needs `fluoroBudgetS`.

Who switches:
- **Aroovee:** the Results screen and its tooltips can go real on `scoreAttempt`.
  - **Every `formulaRef` the result uses:** `plan.feasible`, `plan.heavy_cap`, `plan.frontier_cap`, `plan.regret`, `drive.fidelity`, `drive.gentleness`, `drive.radiation`, `drive.errors`, `result.stars`, `result.fluoro_budget`. `drive.total` and `rank.weighted` are in the contract for the totals and the ranking.
  - **Template ids**, by group:
    - Plan: `plan.too_narrow`, `plan.turn_too_sharp`, `plan.forbidden_zone`, `plan.arch_never_reached`, `plan.no_safe_route`, `plan.heavy_crossing_shorter`, `plan.heavy_crossing`, `plan.dominated`, `plan.top_contributor_turn`, `plan.top_contributor`, `plan.best`.
    - Drive: `drive.not_reached`, `drive.fidelity_drift`, `drive.gentleness`, `drive.force_spike`, `drive.radiation_within`, `drive.radiation_over`, `drive.wrong_branch`, `drive.prolapse`, `drive.back_out`.
    - Result: `result.over_budget`, `result.over_budget_kept`.
  - **Feedback order:**
    1. Not reaching the target.
    2. The plan's deciding check.
    3. A star lost to the budget.
    4. Drive components from lowest score up; a component adds lines only when it shows below 100.
    5. Neutral radiation and budget notes.
  - **What to show:** `feedback[0]` is the one to show on the demo's Results step. Show `line.text` as it is; every number in it is in `line.values`.
- **David:** nothing to do. When `select.ts` hands Aroovee a log, scoring needs only the same `LoadedCase` and the optimizer result for that target.

Mock replaced: `score/mock.ts` in real builds. It stays for `VITE_ENGINE=mock`, and the build guard now checks that the real scorer is bundled.
Contracts version after this handoff: unchanged (1)
Tests: `pnpm test` gives 389 green, 60 of them new.
- Golden replay: each log scored twice and against its committed result, byte for byte.
- Plan checks: one test for each cap rule, including how a cap combines with regret, Rmax = 0 and "no safe route".
- Drive components at their edges: fidelity at 0, 5 and ≥ 10 mm; gentleness at and over the reference, and its floor; radiation at, 1.5× and 2× the estimate, and with a 0 s estimate; the errors floor; force and fluoro totals; time.
- Stars: every star rule at its thresholds, and the budget rule, including its 1-star floor.
- Templates: every template has no number of its own and fills only from its values; each constraint kind and plan check has its own line.
- Whole attempts: target not reached, no safe route, a route the optimizer didn't enumerate, mismatched case or target, and `scoreAttempt` in a real build.

`python -m pytest tests/crosscheck -q` gives 164 green. NumPy fidelity matches TypeScript within 0.1 mm on all five goldens.
New dependencies: none
Decisions logged: "Gentleness reference without recorded runs"; "Gentleness and radiation curves (illustrative)"; "Plan score as implemented"; "Stars and radiation budget as implemented".
Known gaps:
- **Gentleness under physics.** The reference is a rail-proxy force. A physics-mode drive is compared with rail-proxy numbers until real recorded runs exist (D4).
- **Regret on fixture-y.** Both safe fixture-y routes follow the same path, so at the golden weights R = Rmax = 0 and the plan score is 100. The regret arithmetic is tested on hand-made frontiers. The D6-min cases will exercise it on real anatomy.
- **The `plan.top_contributor` line** shows the measure in display units: cm, mm, degrees, s, N, %, or "penalty points" for proximity. Aroovee may prefer different wording; the template ids are stable.
- **Golden file size.** The over-budget golden is about 210 KB, mostly 70 s of idle samples.
- **A small V3 refactor.** The optimizer's route assembly is now a shared function, `assembleRoute`, with an exported `routeFor`. Behaviour is unchanged and every V3 test passes.
