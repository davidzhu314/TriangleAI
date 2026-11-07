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

## Who owns what

David (anatomy, case data, physics; release manager), Vaibhav (optimizer, rail wire, scoring), Aroovee (design system, screens, rendering, AR). Folder ownership and session rules: `CLAUDE.md`. Plan: `PLAN.md`. Spec: `docs/ThreadSim_Build_Specification.md`.

## Credits

Third-party code, data and assets, with licenses: `THIRD_PARTY.md`. Physics mode, where available, is built on CathSim (research use, CC BY-NC-SA 4.0); its code and meshes stay in the separate physics process.
