# Handoff — Gibran G1: engine checks on the generated cases

What landed:
- **`tests/crosscheck/dump_numpy.py`:** `type-iii` and `low-tort` in `CASES`, with `"routes": "auto"`, which lists every simple path from every entry to every target (ids `<entry>-to-<target>`). `numpy-cases.json` is regenerated. fixture-y is unchanged, and so is `numpy-synthetic.json`.
- **`tests/engine/crosscheck-generated.test.ts`:** the TypeScript (loadCase → buildGraph → measureRoute) against NumPy on every edge and route of both cases, within 0.1 mm and 0.5°. It also checks that every frontier route the optimizer offers is among the routes NumPy measured.
- **`tests/engine/rail-acceptance.test.ts`:** every frontier route, on every target of both cases, is steerable (`steerableAt`). The rail autopilot (`RailWireSource`, `autoDrive`) reaches the target with no wrong branch and no prolapse. That's 14 routes, all clean.
- **`tests/engine/timing-generated.test.ts`:** the V7 budgets on both cases, with the statistic each V7 test asserts: optimize median < 50 ms, measureRoute p95 < 16.7 ms, rail step median < 1 ms, scoreCase median < 100 ms. All pass with wide margins. The table is in `metrics/gibran/d6-timing.md`.
- **`tests/engine/progression-generated.test.ts`:** on the real bundled cases, low-tort is tier 0 and type-iii is tier 2. Ladder mode on an empty history gives low-tort next, with type-iii locked. Open mode unlocks type-iii.
- **`tests/engine/golden-demo.test.ts`:** the plan and drive are in `tests/fixtures/engine/demo-type-iii-rcca.json`, and the expected `CaseResult` is in `demo-type-iii-rcca.result.json`. The plan is type-iii → rcca along the best frontier route at the starting weights (`defaultWeights(routes)`), which is `rad_r · soft_angled · e_r_arm, e_rcca`. The test checks that the same route is still picked, that driving it again gives the same log byte for byte, and that scoring the committed log gives the committed result byte for byte. The drive has 644 samples, ends in `target_reached`, and earns 3 stars.
- **`tests/engine/known-issues.test.ts`:** two bugs found on the golden drive, as `it.fails` tests, so CI stays green until they're fixed.
- **`tests/engine/engine.testutil.ts`:** shared helpers: loading cases, the autopilot drive, timing, and `writeMetrics` to `metrics/gibran/`.
- **`tests/crosscheck/README.md`:** the new owner, and how the bundled cases are covered.

How to use:
- `pnpm exec vitest run tests/engine` runs every G1 check.
- `UPDATE_METRICS=1 pnpm exec vitest run tests/engine/timing-generated.test.ts` rewrites `metrics/gibran/d6-timing.md`.
- `UPDATE_FIXTURES=1 pnpm exec vitest run tests/engine/golden-demo.test.ts` regenerates the golden demo files, after a deliberate engine or case change.

Who switches:
- **Vaibhav:**
  - fix the plan score on the best route (`team/requests/to-vaibhav-from-gibran-best-route-plan-score.md`);
  - consider the v7-summary rows (`to-vaibhav-from-gibran-v7-summary-rows.md`).
- **Aroovee:** `leadAction` offers "Revise the plan" beside `plan.best` (`to-aroovee-from-gibran-results-revise-on-best.md`). This shows in the demo's Results beat on the best route.
- **Anyone using `type-iii` → `rcca` in the demo:** the golden log is a known-good Results input.

Mock replaced: none
Contracts version after this handoff: unchanged (1)
Tests:
- `pnpm test`: 844 passed, 2 expected fail (the known issues), 4 opt-in skipped.
- `pytest tests/crosscheck`: 164 passed, including the staleness check on `numpy-cases.json`.

New dependencies: none
Decisions logged: none. No tolerance or budget changed.
Known gaps:
- **Frontier size for the demo:** type-iii → rcca has 6 frontier routes: 3 entries (rad_r, rad_l, fem_l) × 2 presets (soft angled, standard J). The demo says "three routes". That's true per entry, but the Compare table lists six rows. This is a rehearsal (G2) note for Aroovee, not a bug.
- **Physics:** not covered. G1 is rail only, and physics phantoms aren't in `G1_CASES`.
- **Other generated cases:** type-i-plaque, type-ii, type-ii-tortuous and bovine (D6) aren't in G1's scope. They can join `G1_CASES` later.
