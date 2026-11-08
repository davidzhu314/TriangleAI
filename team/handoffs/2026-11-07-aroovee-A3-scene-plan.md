# Handoff — Aroovee A3: Plan screen (3D scene waiting on three.js)

What landed:
- **Plan screen** (`client/src/ui/plan/`): a builder canvas with no global sidebar.
  - **Palette panel:** entry with its icon and label, target (unreachable ones greyed), and wire, where the three `WIRE_PRESETS` carry their icons, are labelled illustrative, and show the sharpest turn each can enter.
  - **Keyboard path:** a list of next branch points, named from case data, plus "Undo last step" and "Clear route".
  - **View:** a well holding the case view.
  - **Cost panel:** the screen's largest readout, with the first warning on top.
  - **Primary:** "Compare routes" in the top bar, enabled only when the route reaches the target. It saves the plan in `ui/store.ts` (`savePlan`, `savedPlan`) and opens `#/case/<key>/compare`, a placeholder until A4.
- **Route state** (`ui/plan/route-state.ts`): pure functions over the engine's `RouteGraph`.
  - The route only grows along an edge touching its end, never revisits a node, and completes on the chosen target.
  - It's measured with `routeFor` on every change, after `buildGraph` once per case.
  - No case ids are hard-coded.
- **Cost rows** (`ui/plan/cost-rows.ts`): length (cm, 1 dp), sharpest turn (°, whole), narrowest radius (mm, 1 dp), heavy risk zones crossed, closeness to risk zones (points, 2 dp), and estimated fluoro (s, 1 dp, illustrative).
  - Every value comes from the cost vector. A missing value is a dash; a real zero prints as zero.
  - Units and decimals match the Results feedback.
  - Each row has a formula tooltip keyed by its `FormulaRef`, restating the spec's own definition.
- **Warnings** (`ui/plan/warnings.ts`): blocking violations first (`forbidden_zone`, `turn_too_sharp`, `too_narrow`), then heavy crossings, then proximity.
  - Each names the vessel or zone from case data and uses its risk icon and pale colour pair.
  - The screen says "Feasible" only when `routeFor` does, and never says "optimal".
- **Renderer interface** (`client/src/render/plan-view.ts`, `render.css`): `PlanView` with `update` and `dispose`.
  - It's implemented today as a 2D front view in SVG: vessel bands from the case radii, risk zones by tier mark, entry and target markers, clickable branch-point handles and the teal route trace.
  - Everything is styled by tokens, and it's disposed on every redraw and on leaving the route.
- **Shell:** a `layout: 'focus'` option (no sidebar) and a `primary` slot in the top bar.
- **Disabled primary button:** a neutral surface with body text, so it stays readable.
- **Requests:** Vaibhav's voice review answered and moved to `done/`. three.js requested from David. Vaibhav's `cannot_steer` contract request approved (Aroovee line). Plan's warnings already show any violation kind they don't know yet as a "Blocked" line.

How to use: open `/#/case/<key>/plan` from the Case brief. Screens reach the view only through `createPlanView(case, onPick)`.

Who switches:
- David — answer `team/requests/to-david-from-aroovee-threejs.md`: `three` 0.187.0 (MIT) at runtime and `@types/three` 0.187.0 as a dev dependency. Fill in the `THIRD_PARTY.md` row.
- Vaibhav — apply the voice answer in `team/requests/done/to-aroovee-from-vaibhav-feedback-voice.md`.

Mock replaced: the A2 Plan placeholder.
Contracts version after this handoff: unchanged (1)

Tests:
- `pnpm test`: 531 green after merging PR #19, including the mock guard. New unit tests:
  - `ui/plan/route-state.test.ts`: adjacency only, no revisits, completes at the target, undo and clear, entry change clears, and evaluation equals `routeFor`, including when the preset changes. It runs on fixture-y through `loadCase`.
  - `ui/plan/cost-rows.test.ts`: units, decimals, dash versus zero (negative zero included), and a tooltip on every row.
- `pnpm build` green; the real build has no "Mock data" string.
- `pnpm exec playwright test`: 15 passed, 1 fixme. `tests/e2e/a3-plan.spec.ts` covers:
  - a keyboard route to the clean target, with the panel equal to `routeFor`, computed in the test from the engine loaded through Vite, never typed in;
  - the heavy target's warning shown first;
  - "Compare routes" enabled only when complete;
  - the Compare placeholder;
  - the view drawing the case and the route trace.
- Taste v2.1.5 `lint.mjs` on my folders: 0 FAIL, 1 WARN (`default-font`, Inter). The tooltip and bottom-sheet shadows carry `taste-skill-ignore`: both float, which `DESIGN.md` allows.
- `inspect.mjs --app`, Plan at 1440, 768 and 390: **0 FAIL in light and dark.** Library and Case brief still 0 FAIL.
- Token check: no raw hex, lengths, radii or shadows in `ui/` or `render/`, apart from the 640 and 1100 px breakpoints.
- Screenshots of Plan with a built route toward the heavy target: `metrics/aroovee/A3/`, at 1440 and 390, light and dark.

New dependencies: none added. three.js is requested, not installed.

Decisions logged:
- Plan uses the app's 48 px top bar.
- The narrowest point shows as a radius.
- Plan's view is 2D until three.js lands.
- Cost-panel tooltips restate the spec.

Known gaps:
- **The 3D scene is the open item.** Not yet built: translucent mesh with `toWorld`, OrbitControls with limits and no damping under reduced motion, the 60 fps check, and the WebGL canvas test (marked `test.fixme`). All of it waits on three.js.
- **Scene tokens:** they hold in the 2D view in both themes, but haven't been seen on a real translucent mesh.
- **Inspector warning kept:** Plan's `ragged-row` at 1440. The palette and cost panel hold different content, and stretching one would leave the blank band Taste also flags.
- **The verdict says "Feasible" on a route that crosses a heavy zone,** because `routeFor` does. A heavy crossing isn't a §4.4 constraint, so the heavy-zone warning sits above the verdict.
- **The plan resets when you leave Plan** without pressing "Compare routes". Only "Compare routes" saves it, for the session.
- **Local test flake:** in this OneDrive folder, Playwright's build sometimes fails on a locked file in `node_modules` (Windows os error 32 or EBUSY). A rerun passes, and CI on Linux isn't affected. Moving the repo out of OneDrive, or excluding `node_modules` from sync, should end it.
