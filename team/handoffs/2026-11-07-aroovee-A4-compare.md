# Handoff — Aroovee A4: Compare screen

**PR #17 now carries three milestones: A2, A3 and A4.** It was still open when A4 started, so A4 was built on top of it, as Aroovee asked.

What landed:
- **Compare screen** (`client/src/ui/compare/`), answering "Is my route on the frontier?", in a focus layout with no sidebar and no KPI strip:
  - **Finding:** one sentence under the title, from contract fields only. It covers four cases: the frontier route that beats yours and the measures it's better on (from `dominates`); "on the frontier"; feasible but not safe because it crosses a heavy zone (this closes A3's open item); or no safe route, with its reason and suggestion, or "no change of entry or wire gives a safe route". It never says "optimal".
  - **Overlay:** the largest block. Up to four frontier routes in their route colour and line pattern, the selected one heavier, and the player's route on top as the solid trace. The legend's swatches are the lines themselves, with labels in ink.
  - **Weight sliders:** one per measure the cost vectors carry. The simulated two show only when `recordedRunsUsed`. They're labelled illustrative and keyboard operable, and show the engine's normalised shares. `createRanker` is built once and re-ranks on every input.
  - **Routes table:**
    - Contents: "Your route" first, then frontier rows in rank order, with every measure in the A3 units and decimals and a formula tooltip each.
    - Same-cost routes that differ only by preset share one row naming both devices.
    - Unlabelled routes get a neutral name from their path.
    - Selecting a row highlights it in the overlay.
  - **Keep or switch:** "Keep my route", or "Switch to <name>" (one button per device on a merged row). Both save the plan with the weights used. "Start drive" is the one primary and opens a Drive placeholder (`#/case/<key>/drive`) until A5.
  - The player's own warnings appear in words, reusing A3's wording.
- **Model** (`ui/compare/model.ts`): pure functions for grouping and naming, `visibleMeasures`, `startingWeights`, `groupRanks`, `overlaySelection` (top four by rank, stable colour slots) and `finding`.
- **Renderer:**
  - The 2D drawing moved into `render/case-svg.ts`, shared by `render/plan-view.ts` (unchanged behaviour) and the new `render/compare-view.ts` (`CompareView`).
  - The heavy-zone hatch is now set per drawing, so the two views don't share a pattern id.
- **Store:** saved plans live in the tab's session storage, so a refresh on Compare keeps them, and they carry the weights. Plan reads the saved plan, so Plan and Compare stay linked.
- **Shared wording and rows:** A3's `warnings.ts` now exports `violationText`, so Plan and Compare word violations the same way, and any unknown kind (such as `cannot_steer` once it lands) shows as "Blocked". `cost-rows.ts` gains `MEASURE_ROWS` (adding total turning and the two simulated measures) and their formula texts.

How to use: plan a route, then press "Compare routes", or open `/#/case/<key>/compare` once a plan is saved. With no saved plan, Compare says so in words and links to Plan.

Who switches:
- Vaibhav — answer `team/requests/to-vaibhav-from-aroovee-default-weights.md`: should the engine define default weights?
- David — the three.js and physics-index requests are still open. A4 doesn't need either.

Mock replaced: the A3 Compare placeholder.
Contracts version after this handoff: unchanged (1). `cannot_steer` hasn't landed; my approval line on that request is still in place.

Tests:
- `pnpm test`: 542 green, including the mock guard. New: `ui/compare/model.test.ts`, 11 tests covering:
  - the finding for dominated, on the frontier, feasible but not safe, blocked, and no safe route with an entry suggestion, a preset suggestion and none;
  - the overlay cap of four by rank, with stable slots;
  - group ranks;
  - equal starting weights giving equal shares;
  - same-cost routes merged, with both devices named;
  - a neutral name for an unlabelled route;
  - the simulated columns hidden unless `recordedRunsUsed`.
- `pnpm exec playwright test`: 19 green and 1 fixme (the WebGL canvas, waiting on three.js), twice in a row. `tests/e2e/a4-compare.spec.ts` checks, against expected values computed from the engine loaded through Vite:
  - the overlay and table, with values equal to `optimize()` and `routeFor`, and ranks equal to `createRanker`;
  - that a slider move gives the shares and ranks `normaliseWeights` and `createRanker` give;
  - that "Switch to" saves the route and Plan shows it with the same costs;
  - the no-safe-route target in words.
  The A3 test now expects the real Compare screen.
- Taste v2.1.5 `lint.mjs` on my folders: 0 FAIL, 1 WARN (`default-font`, Inter).
- `inspect.mjs --app`, Compare at 1440, 768 and 390: **0 FAIL in light and dark**, on the `VITE_ENGINE=mock` build (three frontier routes) and on the real build. Library, Case brief and Plan are still 0 FAIL.
- Token check: clean, apart from the 640 and 1100 px breakpoints and one `border-radius: 0`.
- Screenshots: `metrics/aroovee/A4/`, at 1440 and 390, light and dark, from the mock build with a frontier row selected.

New dependencies: none.

Decisions logged:
- Compare starts with equal weights.
- The overlay draws at most four routes.
- The plan lives in session storage, with its weights.

Known gaps:
- **Slider reordering isn't visible on fixture-y.** Its clean target's frontier is one merged row, because two presets have identical costs. The test checks that ranks and shares equal the engine's after a move, but you can't watch rows reorder until D6-min's cases land. The mock build has three routes; the screenshots show it.
- **Overlay lines can hide under the player's route.** When frontier routes share the player's path, as on fixture-y, the player's trace covers them; the legend still names them. Distinct paths separate on the Type III case.
- **The 3D overlay waits on three.js;** Compare uses the 2D view.
- **Inspector warning kept:** `ragged-row` at 1440. The weights panel and routes table hold different content, and stretching either would leave the blank band Taste also flags.
- **On a phone, each route lists all its measures** as label-and-value lines, more than two lines per route. Taste's rule moves fields down and never drops them.
- **How the inspector reached Compare:** it can't plan a route first, so each scratch copy of the build got a one-line script that puts a plan in session storage before the app starts. That's the same scratch-copy method as forcing dark mode; the repo build is unchanged.
