# Handoff — Aroovee A6: Results screen

What landed:
- **`client/src/ui/results/`:** the Results screen at `#/case/<key>/results`. `model.ts` is the pure logic: the lead action, plan-check words, star words, budget words, marker placement, record-once and suggestion words. `index.ts` is the screen, `results.css` its styles, and `model.test.ts` the unit tests.
- **`client/src/render/replay-view.ts`:** the driven path over the best route.
- **`client/src/ui/app.ts`:** the router, moved out of `main.ts`, with an optional wire factory.
- **Five new icons:** star, force-spike, wrong-branch, prolapse and back-out, in `client/src/assets/icons/`.
- **Formula tooltips** for every plan, drive and result `FormulaRef`, in `ui/plan/cost-rows.ts`. The tooltip CSS moved to `ui.css`.
- **Drive → Results:** Finish now opens Results.
- **Store:**
  - `saveProgressHistory` and `suggestion` are new.
  - `progressHistory` drops malformed records (Vaibhav's review note on #17).
  - `SavedDrive.recordedSeq` is new.
- **Tests:** `tests/e2e/a6-results.spec.ts` and the test-only full-app harness `tests/e2e/harness/app.html`.
- **Screenshots:** `metrics/aroovee/A6/`.

How to use:
- Finish a drive, or open `#/case/<key>/results` after one. Results scores the saved drive with `scoreAttempt` and draws `replayTimeline`.
- `startApp(root, { getWireSource })` runs the whole app with any wire source.

What Results shows:
- **The finding:** `feedback[0]` as the engine wrote it, beside one action (retry the drive, or revise the plan).
- **The next three lines,** smaller.
- **Plan score,** with which check set it and its cap.
- **Drive score,** with a table of the four components (score, weight, formula) and the time marked "not scored".
- **Stars,** in words with the star icon, and the star the fluoro allowance took.
- **The replay:** a timeline with a mark per event and the driven path over the best route.
- **Progress:** best stars and V6's suggestion.
- **Actions:** Retry drive, Revise plan, and Next case (V6 `nextCase`) as the one primary.
- **The honesty line.**

Who switches:
- **Vaibhav:** please answer `team/requests/to-vaibhav-from-aroovee-feedback-lead.md`. Every fixture-y golden leads with `plan.best` ("Your route is the best available…"), even the prolapse drive that scores 39. Only the order needs to change. The default-weights request is still open too.
- **David:** nothing new. `select.ts` is still A5's open item. **The plain app can't drive until it lands.** The click-through runs through the test harness, which injects `RailWireSource` where the app passes `select.ts`. When `select.ts` merges, the same click-through can run on the production build.

Mock replaced: none. In a `VITE_ENGINE=mock` build, Results shows V1's mock result under the "Mock data" badge.
Contracts version after this handoff: unchanged (1)
Tests:
- `pnpm test`: 686 passed. The 13 new Results unit tests use the four golden logs and the real engine:
  - the lead and its action;
  - the budget words;
  - the star words;
  - marker placement from `replayTimeline`;
  - recording once, never twice on a refresh.
- `pnpm exec playwright test`: 40 passed, twice in a row. The 9 new tests:
  - the four goldens: stars, plan and drive scores, `feedback[0]` and the next lines, components, and timeline markers, all read from each golden's JSON;
  - the wrong-branch and prolapse marks, and the lost star on over-budget;
  - a refresh records once;
  - keyboard focus walks the marks, and each shows its label;
  - Next case matches the Library's next case, and the Library shows the new stars;
  - no saved drive says so in words;
  - the click-through Library → Brief → Plan → Compare → Drive → Results on fixture-y with the rail wire.
- Taste lint: 0 FAIL. The 1 WARN is the Inter font, already there before A6.
- `inspect.mjs --app` on the production build: Results at 1440, 768 and 390, light and dark, for the clean, wrong-branch and over-budget goldens. **0 FAIL, 0 WARN** in all six.
- Token check: clean.
New dependencies: none
Decisions logged: six Aroovee lines dated 2026-11-07:
- the lead line and its action;
- scoring on entry and recording once;
- the Library stays in open mode;
- no Replay action yet;
- `startApp` and the app harness;
- the new icons and the marker colour.
Known gaps:
- **No live drive in the plain app.** It needs `select.ts` (David).
- **`feedback[0]` is `plan.best` on every fixture-y drive** until Vaibhav reorders it (requested).
- **No Replay action:** no log-replay wire is on main.
- **The best route is hidden on fixture-y.** It sits under the driven path whenever the player drove the best route, which is every fixture-y golden. The legend still names both lines.
- **The "assisted" mark** from the hands, voice and assistant answer waits until after the demo, with that feature.
