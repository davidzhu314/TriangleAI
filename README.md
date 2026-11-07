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

## Who owns what

David (anatomy, case data, physics; release manager), Vaibhav (optimizer, rail wire, scoring), Aroovee (design system, screens, rendering, AR). Folder ownership and session rules: `CLAUDE.md`. Plan: `PLAN.md`. Spec: `docs/ThreadSim_Build_Specification.md`.

## Credits

Third-party code, data and assets, with licenses: `THIRD_PARTY.md`. Physics mode, where available, is built on CathSim (research use, CC BY-NC-SA 4.0); its code and meshes stay in the separate physics process.
