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

The engine is plain TypeScript in `client/src/optimize/`, `client/src/score/` and `client/src/wire/rail*`, with Python cross-checks in `tests/crosscheck/`. **No AI model computes any route, measure, score or feedback number.** Every number comes from code, and every illustrative constant is logged in `DECISIONS.md`.

### What's built

| Milestone | What it delivers | Main files | PR |
| --- | --- | --- | --- |
| **V0** | Synthetic test shapes with closed-form answers (straight, 90° arc, helix, Y-branch, junction, diamond, …), and a NumPy version of the spec §4.2 measures | `tests/fixtures/synthetic/`, `tests/crosscheck/` | #1 |
| **V2-prep** | Measures in TypeScript, and route-level turning that spans branch points | `optimize/measures/` | #1 |
| **V1** | Mocks in contract shape, so screens could start early, behind a build guard (`VITE_ENGINE=mock`) | `optimize/mock.ts`, `score/mock.ts`, `wire/mock-source.ts` | #6 |
| **V2** | Route graph, per-edge and per-route measures, in a Web Worker | `optimize/graph.ts`, `measure-route.ts`, `measure.worker.ts` | #9 |
| **V3** | Optimizer: three illustrative wire presets, route search (DFS, or Yen's k = 10 on big graphs), constraints (too narrow, turn too sharp, forbidden zone), the Pareto frontier with labels, "no safe route" suggestions, weighted re-ranking | `optimize/optimizer.ts`, `frontier.ts`, `rank.ts`, `presets.ts` | #11 |
| **V4** | Rail wire: a pure 30 Hz step with branch entry by tip direction (25° rule), prolapse, a force proxy with force spikes, back-out, fluoro and contrast; an autopilot; a byte-identical replay | `wire/rail.ts`, `rail-source.ts`, `rail-autopilot.ts` | #14 |
| **V5** | Scoring: the plan score (feasible / heavy-crossing / frontier caps, then regret), the drive score (fidelity, gentleness, radiation, errors), stars, the radiation budget, feedback sentences, reproducible from the event log | `score/plan.ts`, `drive.ts`, `stars.ts`, `feedback.ts`, `templates.ts`, `score.ts` | #15 |
| **V6** | Progression: an unlock ladder from case anatomy, adaptive suggestions, course grading (plus the no-safe-route plan-score fix) | `score/progress.ts` | #16 |
| **V7** | Performance budgets asserted in CI, a voice-review guard on the feedback wording, an engine purity test, and the `ILLUSTRATIVE_CONSTANTS` table for UI labels | `metrics/vaibhav/`, `score/templates.test.ts`, `score/illustrative.ts` | #18 |
| **Steering** | `steerableAt` checks that a planned route can be steered, sharing its maths with the rail wire; also the D6-min drivability check | `optimize/steerability.ts` | #19 |
| **Post-lane** | Aroovee's feedback wording, an end-to-end demo-path test, and replay timeline data for the Replay screen | `score/demo-path.test.ts`, `score/replay.ts` | #20 |
| **Assistant answers** | "Best next artery", "my options" and "how am I doing", from the engine; hints are counted in `ProgressRecord.hintsUsed` | `optimize/assist.ts`, `score/live.ts` | #21 |
| **Hand gestures and voice** | MediaPipe gestures, push-to-talk, "Hey Cathy" and always-listen (see below) | `client/src/input/` | #22 (draft) |

### What the screens import

Screens import the engine only from these entry points, never from mocks or inner modules:

- **`client/src/optimize`:**
  - `optimize(request, loadedCase)` and `measureRoute(…)`;
  - `createMeasureWorker()`, which runs off the main thread;
  - `createRanker(frontier)`, `rankRoutes(…)` and `WIRE_PRESETS`;
  - `planAssist(…)` and `steerableAt(…)`.
- **`client/src/score`:**
  - `scoreAttempt({ log, optimized, weights, case })`;
  - `replayTimeline(…)`, `driveAssist(…)` and `planAssistLine(…)`;
  - progression: `nextCase`, `bestStars`, `ladderTier`, `isUnlocked`, `adaptiveSuggestion`, `courseGrade` and `recordFromResult`;
  - `ILLUSTRATIVE_CONSTANTS` and `FEEDBACK_TEMPLATES`.
- **The rail wire:** reached only through David's `wire/select.ts` (`RailWireSource`).

A `VITE_ENGINE=mock` build serves the V1 mocks instead. A real build contains no mock code, which a build test checks.

### Key rules

The full reasoning is in `DECISIONS.md`.

- **Illustrative values.** The wire presets (max turn 110/80/40°), the estimated fluoro time (1 s per cm + 3 s per 90° of turning), the rail constants, the gentleness and radiation curves, and the ladder's tortuosity cut-off are all illustrative. Label them so in the UI, using `ILLUSTRATIVE_CONSTANTS`.
- **Rail branch entry.** The tip enters a branch within 25° of where it points; otherwise it continues the straightest way.
- **Plan score.** 0 if infeasible, capped at 40 for a heavy-zone crossing, capped at 80 if off the frontier; otherwise it comes from regret at the player's own weights.
- **Stars.** Reaching the target earns 1, plan ≥ 70 and drive ≥ 60 earn 2, and both ≥ 85 earn 3. Going over the case's fluoro allowance costs a star, but never takes a finished drive below 1.
- **Progression.** Finishing any case on a tier opens the next. Stars never gate progress. The demo build uses `'open'` mode.

### Tests and checks

```sh
pnpm test                                    # typecheck + all unit tests (includes timing budgets)
pip install -r tests/crosscheck/requirements.txt
pytest tests/crosscheck                      # NumPy cross-checks (Python 3.12)
```

Regenerate on purpose, and say so in the PR:

```sh
UPDATE_FIXTURES=1 pnpm exec vitest run client/src/wire/rail-golden.test.ts    # rail golden replay log
UPDATE_FIXTURES=1 pnpm exec vitest run client/src/score/score-golden.test.ts  # golden scoring results
UPDATE_METRICS=1 pnpm exec vitest run client/src/wire/rail.timing.test.ts client/src/score/score.timing.test.ts client/src/score/progress.timing.test.ts
D6_DIR=client/public/cases pnpm exec vitest run client/src/optimize/d6min-drivability.test.ts   # steering on generated cases
```

What the tests guard:

- **Measures:** closed-form synthetic fixtures, and TypeScript against NumPy within 0.1 mm and 0.5°.
- **Rail:** every frontier route reaches its target, and the golden drive replays byte for byte.
- **Scoring:** every cap rule, drive component, star rule and feedback template, with golden logs that replay to identical results.
- **Demo path:** `score/demo-path.test.ts` runs Plan → Compare → Drive → Results → progression on real case files, including type-iii.
- **Hygiene:** the engine reads no clock, randomness or storage, and the feedback wording keeps its placeholders, has no digits and avoids the never-say list.

### Fixtures and metrics

- `tests/fixtures/synthetic/` holds the synthetic shapes with closed-form answers (`generate.py` regenerates them).
- `tests/fixtures/logs/` holds the golden event logs with their expected results.
- `metrics/vaibhav/`:
  - **`v7-summary.md`:** every engine timing against its budget, for the demo Q&A;
  - **`v2-…`, `v3-…`, `v7-…`:** per-area timing detail;
  - **`d6min-drivability.md`:** steering on the generated cases;
  - **`demo-path-timing.md`:** the end-to-end demo-path timing.

### Hand gestures and voice (draft PR #22, after the demo)

These live on the branch `lane/vaibhav-input`. They're tested, CI is green, and nothing in the app imports them yet.

- **Gestures (MediaPipe hands):**
  - a gun pose (index and middle as the barrel, thumb up, ring and pinky folded): straighten to push, half-curl to hold, curl to pull, twist to rotate;
  - point and pinch to select a branch, once per pinch.
  - Tuned on a real webcam clip, which is kept as a replay test: the poses hold through aiming and 90° twists, and 8 pinches give 8 selects.
- **Voice:**
  - push-to-talk (hold V), cut off 0.7 s after release;
  - an optional wake word, "Hey Cathy";
  - an opt-in always-listen mode that only acts on "Hey Cathy, …", off by default, with a live-mic notice. Chrome streams the audio to Google while it's on.
- **Status:** Aroovee approved all three features for after the demo, including always-listen, and decided that a hint marks the attempt "assisted". David's answer and the `CLAUDE.md` ownership row for `client/src/input/` are pending.
- **Docs:** the full guide, including the local webcam lab, is `client/src/input/README.md` on that branch.

### Open items

- **Steering in the optimizer:** a `cannot_steer` constraint, so the optimizer never offers a route the rail can't steer. Needs a contract change (`team/requests/to-all-from-vaibhav-contract-steerability.md`).
- **The §4.4 arch constraint and the two simulated measures:** need real recorded runs (D4).
- **Ladder tier 4 (whole-body planning):** needs a marker in the case format.
- **Hand gestures and voice:** merge after the demo, once David answers.

## Who owns what

David (anatomy, case data, physics; release manager), Vaibhav (optimizer, rail wire, scoring), Aroovee (design system, screens, rendering, AR). Folder ownership and session rules: `CLAUDE.md`. Plan: `PLAN.md`. Spec: `docs/ThreadSim_Build_Specification.md`.

## Credits

Third-party code, data and assets, with licenses: `THIRD_PARTY.md`. Physics mode, where available, is built on CathSim (research use, CC BY-NC-SA 4.0); its code and meshes stay in the separate physics process.
