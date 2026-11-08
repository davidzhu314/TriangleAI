# ThreadSim

ThreadSim is a browser decision trainer for endovascular procedures. You plan a wire route through an aortic arch, compare it with a computed frontier, drive it with simplified device mechanics, and see which choice cost you the most.

**Decision trainer with simplified device mechanics. Not a clinical device; no claim of patient benefit.** Wire presets and risk weights are illustrative.

## Run it

Needs Node 22 (see `.nvmrc`) and pnpm 9 (`corepack enable`, or `npm i -g pnpm@9`). Use pnpm only.

```sh
pnpm install                 # install
pnpm dev                     # dev server at http://localhost:5173
pnpm build && pnpm preview   # production build, served at http://localhost:4173
pnpm test                    # typecheck + unit tests (Vitest)
pnpm test:e2e                # end-to-end tests (Playwright, against the production build)
pnpm fixtures                # regenerate generated case files (client/public/cases); pnpm test fails if they are stale
                             # first time: pnpm exec playwright install chromium
```

Physics bridge tests (Python 3.9):

```sh
pip install -r physics/requirements-test.txt
pytest physics
```

Physics setup (CathSim) lives in `physics/README.md` (written in D1). The app runs without it, in rail mode.

## What's in the app

One case is one pass through six screens, each at its own hash route:

| Screen | Route | What it does |
| --- | --- | --- |
| Library | `#/library` | The next case, with its stars, then the other cases; drag-and-drop `case.zip` import showing each validation result |
| Case brief | `#/case/<id>` | Scenario, targets, entry sites, arch type and fluoro budget |
| Plan | `#/case/<id>/plan` | Pick entry, target and wire preset, build the route by branch points, live cost panel |
| Compare | `#/case/<id>/compare` | Frontier routes overlaid, weight sliders, keep or switch |
| Drive | `#/case/<id>/drive` | Front and X-ray views, HUD (vessel, distance, wall force, fluoro), keyboard and gamepad, difficulty ladder |
| Results | `#/case/<id>/results` | The one thing to change, plan and drive scores, stars, replay timeline, next case |

- **Views are 2D for now.** Plan, Compare, Drive and Results draw the case as a flat front view in SVG, until three.js is added.
- **Driving needs `client/src/wire/select.ts`, which isn't on main yet.** Until it lands, Drive shows the planned route and says driving isn't available. The end-to-end tests drive the full app through a test-only harness (`tests/e2e/harness/`) that plugs in the rail wire. The harness is never part of the build.
- **Design system:** `DESIGN.md`, `client/src/styles/tokens.css` and `theme.css`, light and dark (following the OS setting). Every colour and size in the UI is a token. Icons are in `client/src/assets/icons/`.
- **Numbers:** every number on screen comes from the engine (`client/src/optimize`, `client/src/score`) or the case file, with a formula tooltip. A missing value shows as a dash.
- **Mock build:** `VITE_ENGINE=mock pnpm build` runs on the engine mocks and shows a "Mock data" badge.

## Engine (Vaibhav)

The engine is plain TypeScript in `client/src/optimize/`, `client/src/score/` and `client/src/wire/rail*`. No AI model computes any route, measure, score or feedback number.

- **Measures and optimizer:** spec §4 measures, the Pareto frontier with labels, and weighted ranking. They're checked against closed-form synthetic fixtures and an independent NumPy implementation (within 0.1 mm and 0.5°).
- **Rail wire:** a deterministic 30 Hz model with branch entry by tip direction, prolapse, a force proxy and back-out. `optimize/steerability.ts` checks that a planned route can be steered.
- **Scoring:** plan and drive scores, stars, the radiation budget, feedback sentences and replay data, reproducible from the event log.
- **Progression:** the unlock ladder, adaptive suggestions and course grading.
- **Assistant answers:** "best next artery", "my options" and "how am I doing", computed by the engine (`optimize/assist.ts`, `score/live.ts`).
- **Performance:** timing budgets are asserted in CI; the summary is `metrics/vaibhav/v7-summary.md`.

Engine cross-checks (Python 3.12; details in `tests/crosscheck/README.md`):

```sh
pip install -r tests/crosscheck/requirements.txt
pytest tests/crosscheck
```

**Hand gestures and voice commands** (MediaPipe hands, push-to-talk, and an opt-in always-listen mode woken by "Hey Cathy") are built and tested on a draft branch (`lane/vaibhav-input`, PR #22). They're planned for **after the demo**. See `client/src/input/README.md` on that branch.

## Changes: design system and screens (Aroovee)

Each milestone has a handoff in `team/handoffs/` and screenshots in `metrics/aroovee/`. All were built on 2026-11-07 and are in PR #17 until it merges.

- **A0, design system.**
  - `DESIGN.md`: the measured system, the screen inventory and the layout.
  - `client/src/styles/tokens.css` for every colour, size, space, radius, shadow and motion value; `theme.css` for element defaults; `palette.html` showing every token on one page.
  - The Inter font.
  - A dark theme that follows the OS setting, with no in-app toggle.
- **A1, icons and empty states.**
  - 15 icons on one 24-unit grid with a 1.75 stroke: femoral and radial entries, target, the three wire presets, fluoro, contrast puff, push/pull, rotate, the three risk tiers, and the Physics and Planning-only badges.
  - Three empty states: no cases, no safe route, physics offline.
- **A2, shell, Library and Case brief.**
  - The framed shell with hash routes; on a phone, a top bar and a full-screen menu.
  - The "Mock data" badge in mock builds.
  - The Library: the next case with its stars, from V6's progression, then the other cases.
  - `case.zip` drag-and-drop import, showing every validation result with fixes the player can accept.
  - The Case brief, from the case file only.
- **A3, Plan screen.**
  - Entry, target and wire-preset pickers, with presets labelled illustrative.
  - A keyboard list of next branch points, with undo and clear.
  - A 2D front view of the case and the route.
  - A live cost panel: length, sharpest turn, narrowest radius, heavy zones crossed, closeness to risk zones, estimated fluoro. Each has a formula tooltip.
  - Warnings in words as the route grows.
- **A4, Compare screen.**
  - A one-sentence finding (on the frontier, or which route beats yours and on what).
  - Up to four frontier routes overlaid by colour, line pattern and label.
  - Weight sliders, labelled illustrative.
  - A routes table with formula tooltips.
  - Keep my route or switch, then Start drive.
- **A5, Drive screen.**
  - A HUD showing vessel, distance to target, wall force (illustrative) and fluoro against the budget.
  - Keyboard, gamepad (0.15 dead zone) and on-screen controls.
  - Front and X-ray views, with a contrast puff that fades over 1.5 s.
  - The difficulty ladder.
  - Banners: target reached, wall force, off route, fluoro over budget. A fallback notice says in words why the physics wire dropped to rail.
  - Finish or exit saves the drive's event log for Results.
  - The wire comes only through `select.ts` or an injected factory. That one item is still open: `select.ts` isn't on main.
- **A6, Results screen.**
  - The engine's top feedback line, shown as written, with one action beside it (retry the drive, or revise the plan), then the next lines.
  - The plan score, with the check that set it.
  - The drive score: a table of fidelity, gentleness, radiation and errors, with time marked "not scored".
  - Stars, and the star the fluoro allowance took.
  - A replay timeline with a mark per event, and the driven path over the best route.
  - Each attempt recorded once.
  - Next case, Retry drive, Revise plan.
  - Five more icons: star, force spike, wrong branch, prolapse, back-out.
- **Tests and checks.**
  - Playwright end-to-end tests for every screen, in `tests/e2e/`, including a full click-through from Library to Results on fixture-y.
  - Results tests read Vaibhav's golden scoring logs and never hard-code a number.
  - Each screen passed Taste Skill v2.1.5's lint and inspector with 0 FAIL at 1440, 768 and 390 px, in light and dark.
- **Team requests.**
  - Answered: the `cannot_steer` contract, Vaibhav's feedback voice review, hand input (after the demo), and hands, voice and assistant (after the demo).
  - Open with David: `select.ts`, three.js, and the physics case index.
  - Open with Vaibhav: default weights, and the order of the feedback lines.

## Who owns what

David (anatomy, case data, physics; release manager), Vaibhav (optimizer, rail wire, scoring), Aroovee (design system, screens, rendering, AR). Folder ownership and session rules: `CLAUDE.md`. Plan: `PLAN.md`. Spec: `docs/ThreadSim_Build_Specification.md`.

## Credits

Third-party code, data and assets, with licenses: `THIRD_PARTY.md`. Physics mode, where available, is built on CathSim (research use, CC BY-NC-SA 4.0); its code and meshes stay in the separate physics process.
