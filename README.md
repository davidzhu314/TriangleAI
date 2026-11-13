# Cathy

Cathy (formerly ThreadSim) is a browser decision trainer for endovascular procedures. You plan a wire route through an aortic arch, compare it with a computed frontier, drive it with simplified device mechanics, and see which choice cost you the most.

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

Physics setup (CathSim) and the D5 physics process (`python -m server` in `physics/`, on 127.0.0.1:8765) are in `physics/README.md`. The app runs without it, in rail mode.

## What's in the app

One case is one pass through six screens, each at its own hash route, plus Settings:

| Screen | Route | What it does |
| --- | --- | --- |
| Library | `#/library` | A grid of case cards (each case's own vessel drawing, synopsis, difficulty, stars, "Left off at …"), filters by difficulty and arch type, "+ Add a case" (name, synopsis and the `case.zip` import with its validation results), "Download case (.zip)" |
| Case brief | `#/case/<id>` | A vessel map of the case (risk zones, entry sites and targets named) beside its facts: scenario, targets, entry sites, arch, fluoro budget, risk zones, vessels, source, your progress |
| Plan | `#/case/<id>/plan` | Pick entry, target and wire preset, build the route by branch points, live cost panel, Cathy's box |
| Compare | `#/case/<id>/compare` | Frontier routes overlaid, weight sliders, keep or switch |
| Drive | `#/case/<id>/drive` | Front and X-ray views, Rail / Physics (beta) switch, HUD (vessel, distance, wall force, fluoro), route overview with mistake dots, keyboard, gamepad, hands and voice, Cathy's box |
| Results | `#/case/<id>/results` | The one thing to change, plan and drive scores, stars, replay timeline, next case |
| Access check | `#/case/<id>/access` | Can a valve sheath (14, 16 or 18 Fr, illustrative) go in through the leg? Each femoral side's narrowest diameter, spare, sharpest bend and a diameter profile; then the subclavian and carotid routes, with the heart's apex and the cava listed as not measured |
| Settings | `#/settings` | Hands and Voice switches, Light / Dark / System theme, the gesture and voice command lists |

- **Cases.** The Library lists the bundled cases from `client/public/cases/index.json`:
  - the generated ladder: `low-tort`, `type-i-plaque`, `type-ii`, `type-ii-tortuous`, `type-iii`, `bovine`;
  - three planning-only cases exported from real CT angiograms' arteries with 3D Slicer and SlicerVMTK: `ts-s1404-cta`, `ts-s1336-cta` and `ts-s0727-cta` (TotalSegmentator dataset subjects s1404, s1336 and s0727, CC BY 4.0). How to reproduce them is in `slicer/README.md`;
  - `fixture-y`.
- **Views.** Plan, Compare and Drive open in 3D (three.js 0.187.0), with the flat SVG front view one click away and as the fallback without WebGL. Results' replay stays 2D.
- **Driving.** Drive gets its wire from `client/src/wire/select.ts` (D5). Every bundled case drives on the rail wire.
  - A CathSim phantom served by the physics process drives on live physics. If the socket fails or stalls for 2 s, it falls back to rail with a notice.
  - Phantom cards appear in the Library only once its probe points at the physics process: `PHYSICS_CASES_URL` in `client/src/ui/physics-probe.ts` is still `null`.
  - There are no recorded physics runs, so replay mode is not offered.
- **Design system:** `DESIGN.md`, `client/src/styles/tokens.css` and `theme.css`: the Oxblood & Navy palette (oxblood for arteries and the accent, steel blue for veins and links, purple for the trainee's route) in DM Sans, light and dark (following the OS, or forced in Settings). Every colour and size in the UI is a token. Icons are in `client/src/assets/icons/`.
- **Anatomy in 3D:** an optional anatomy layer behind the case (the BodyParts3D reference body, placed per case), and on the three real CT cases the same patient's bones, heart and major veins from `context.glb` ("Body" and "Veins" toggles).
- **Hands, voice and Cathy:** MediaPipe hand gestures (drive with a gun pose, point and pinch to pick, a fist to turn the view), "Hey Cathy, …" voice commands, and Cathy's box of questions. Cathy's answers come from the engine; an LLM layer (Claude Haiku 5.5, through a server function) is designed and approved but not switched on.
- **Numbers:** every number on screen comes from the engine (`client/src/optimize`, `client/src/score`) or the case file, with a formula tooltip. A missing value shows as a dash.
- **Mock build:** `VITE_ENGINE=mock pnpm build` runs on the engine mocks and shows a "Mock data" badge.

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

### Hand gestures and voice

**Status (2026-11-08):** these went into the app before the demo after all, on `integration/hands-voice` (PR #73), and the screens use them. The description below is the original first version; what changed since is under "Changes since 7 November, by teammate" further down.

- **Gestures (MediaPipe hands):**
  - a gun pose (index and middle as the barrel, thumb up, ring and pinky folded): straighten to push, half-curl to hold, curl to pull, twist to rotate;
  - point and pinch to select a branch, once per pinch.
  - Tuned on a real webcam clip, which is kept as a replay test: the poses hold through aiming and 90° twists, and 8 pinches give 8 selects.
- **Voice:**
  - push-to-talk (hold V), cut off 0.7 s after release;
  - an optional wake word, "Hey Cathy";
  - an opt-in always-listen mode that only acts on "Hey Cathy, …", off by default, with a live-mic notice. Chrome streams the audio to Google while it's on.
- **Status:** David and Aroovee approved all three features for after the demo, including always-listen (off by default, with a live-mic notice). A hint marks the attempt "assisted", with no extra score penalty. The `CLAUDE.md` ownership row for `client/src/input/` waits until #22 merges.
- **Docs:** the full guide, including the local webcam lab, is `client/src/input/README.md` on that branch.

### Open items

- **Steering in the optimizer:** a `cannot_steer` constraint, so the optimizer never offers a route the rail can't steer. Needs a contract change (`team/requests/to-all-from-vaibhav-contract-steerability.md`).
- **The §4.4 arch constraint and the two simulated measures:** need real recorded runs. D4 recorded none, because no driver reached a target, so they stay dropped (`DECISIONS.md`).
- **Ladder tier 4 (whole-body planning):** needs a marker in the case format.
- **Hand gestures and voice:** approved by David and Aroovee for after the demo; PR #22 is still a draft.

## Changes: design system and screens (Aroovee)

Each milestone has a handoff in `team/handoffs/` and screenshots in `metrics/aroovee/`. All were built on 2026-11-07. A2–A6 merged in PR #17, and A8 in PR #30.

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
  - The wire comes only through `select.ts` (on main since D5) or an injected factory.
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
  - Answered by David: `select.ts`, three.js (0.187.0, pinned), and the physics case index (`http://127.0.0.1:8765/cases/index.json`).
  - Open with Vaibhav: default weights, and the order of the feedback lines.

## Changes since 7 November, by teammate

Everything below happened on 2026-11-08 and is on `integration/hands-voice` (PR #73) unless it names its own PR. The earlier changelogs above are kept as they were.

**Where things stand:**
- `main` was frozen for the demo. #73 holds the hands-and-voice work and everything built on it; merging it needs David's OK.
- Built after the cut-off, as draft PRs for after the demo: #94 (wall contact review on Results), #95 (Drive's tip twist and angle controls), #78 and #80 (veins), #72 (default weights), #74 (the chain simulation for main).

### David (anatomy, case data, physics; release manager)

- **Physics (beta), a chain simulation of the wire and catheter**, in the browser.
  - The device is a chain of short links: follow-the-leader feed, a shaped tip, wall sliding, a contact-load proxy, and torsion with stick-slip lag.
  - It reports a tip pose, both devices and an educational contact-risk index (contracts v3).
  - The arch cases are drivable, proven by a scripted driver that uses only push, pull and roll.
  - Pushing a turned tip into the wall loads it, and `logSoFar()` lets Cathy answer mid-drive.
  - `?wire=chain` forces it on, for testing.
- **Contracts:** v2 adds `cannot_steer` to the constraint violations; v3 adds the chain fields as optional additions.
- **Real CT cases:**
  - Two more planning-only cases, `ts-s1336-cta` and `ts-s0727-cta`, with weighted mesh decimation.
  - Each real CT case has a `context.glb` of the same patient's bones and heart, and then the major veins (PR #80 holds the vein sweep).
- **Anatomy layer:** the unmodified BodyParts3D reference body ships for the demo, under David's licence decision, and is placed per case using Gibran's visual alignment.
- **Cathy's box** on Plan and Drive: her questions as buttons, a typed-question field and her latest answer. Every answer is the engine's template line, with no AI key needed.
- **Settings screen** (`#/settings`): Hands and Voice switches, a Light / Dark / System theme, and the command lists.
- **Drive view:** each device at its own width, a rounded wire tip instead of a ball, and the catheter drawn as a translucent sleeve.
- **Hands-and-voice integration:** the pinned MediaPipe dependency (`@mediapipe/tasks-vision` 1.2.2) and its hand model, ownership rows, and the option-A decision and merge rules for #73.
- **Release decisions:**
  - the S5 milestone reached, and the merge freeze;
  - rail mode leads the demo, and AR is not presented;
  - CC BY-SA licensing answered;
  - the Cathy LLM approved under conditions: the key only in Vercel, a grounding check on every line, the template line as fallback, and not in the demo.

### Vaibhav (engine: optimizer, rail wire, scoring; hands and voice input)

- **Hands:**
  - Both hands at once, each with its own gesture machine: one hand drives while the other turns the view.
  - The view-turning pose is now a fist, thumb tucked ("grab and drag").
  - The webcam self-view moved to the page's bottom-right corner, and Cathy's text stays in the view.
- **Voice:**
  - Always listening, acting only on "Hey Cathy, …".
  - Commands added tonight:
    - undo; reset view (including a bare "reset");
    - hide or show labels (with Chrome's "Hyde" mis-hearings);
    - zoom into a named artery;
    - a fluoro toggle that switches itself off after 10 s and at the target.
- **Drive:**
  - The Rail / Physics (beta) switch.
  - A smaller route overview: click it to see the drive's mistakes as red dots, each with its replay line.
  - Cathy's box placed under the overview.
  - The controls card lists every gesture and "Hey Cathy" command.
- **Cathy's directions name vessels, not edges** (PR #97).
  - "Keep going along the Aorta. The next branch is the Brachiocephalic trunk."
  - "You've gone past the opening of the Brachiocephalic trunk. Pull back until the tip is at the opening, then rotate toward it."
  - "You're on the plan. The Right common carotid is ahead." now leads near the target.
- **`nextBranchWindow`:** the range of tip twist that enters the next planned branch, for Drive's twist dial.
- **Mid-drive answers:** the rail source's `logSoFar()` lets Cathy answer during the drive.
- **Case sweep:** optimize, steer, rail-drive and score every case, with timing budgets, including grids up to 264 edges and steering timed separately.
- **Purity test:** the screens may import the input folder; nothing else may.

### Aroovee (design system, screens, rendering, AR)

- **The look:**
  - The product is called **Cathy** (was ThreadSim) everywhere a trainee reads it. Storage keys and the case format keep `threadsim`.
  - The Oxblood & Navy palette, with a true neutral dark theme.
  - The trainee's route is purple, so it never reads as an artery (oxblood) or a vein (blue).
  - DM Sans replaces Inter everywhere.
- **Library:**
  - A grid of case cards: each with its own vessel drawing, synopsis, difficulty, mode, stars, and "Left off at Plan / Results" with a link back.
  - Filters by difficulty and arch type.
  - "+ Add a case": name, synopsis and the import.
  - "Download case (.zip)".
- **Case brief:**
  - A vessel map: risk zones, entry sites and targets named.
  - The facts beside it: risk zones by kind, vessel count, source (with the dataset citation behind a toggle), your progress.
  - "What happens next".
- **Plan:**
  - The 3D view's controls in one quiet toolbar.
  - Compact route setup ("Turns up to 110°").
  - A tighter cost list.
- **3D views:**
  - The anatomy layer: arteries and veins, labels, opacity.
  - The body context and veins toggles.
  - Turning the case on three axes, by mouse or hand (two hands roll it).
  - A Reset view button on every 3D view.
- **Hands and voice on the screens:**
  - The camera with a self-view.
  - On Drive, the hand pushes and pulls the wire, and the wire stops within 0.4 s if the camera stalls.
  - On Plan, a pinch picks a branch.
  - "Hey Cathy" for best next artery, options, how am I doing, undo, reset view, hide or show names.
  - The live-mic notice is a quiet line with a recording dot.
- **Results:** the best route always offers "Retry the drive", even on a score like 99.99999999999997.
- **Tests:**
  - New end-to-end tests:
    - Drive going off route, in rail and Physics;
    - hand push and pull;
    - three-axis turning;
    - the Library grid and the Add-a-case dialog;
    - the body context and veins.
  - The design inspector passes with 0 FAIL on the new screens, in light and dark.
- **After-the-demo PRs:**
  - **#94:** Results' wall contact review: every contact over the force threshold as a numbered mark on the replay, with where, when, how hard and a technique tip.
  - **#95:** Drive's tip twist dial and degrees, Shift for a slow twist, collapsible cards, setting an exact angle (type it, or nudge with `[` and `]`), a hand angle mode, and the angle labelled on the catheter head.
  - **#78:** the "Veins" toggle.
  - **#72:** default weights.

### Gibran (engine verification, data and demo QA)

- **Cathy as a hybrid (G5, PR #76):**
  - The engine supplies every fact (`cathyFacts`).
  - A grounding check rejects any line whose numbers or names aren't in those facts.
  - The LLM layer only understands and phrases. It's mocked in tests with recorded responses, and Cathy falls back to the template line on any error, timeout or mismatch.
- **"Am I on the right path?"** (`assist_check`) on Plan and Drive, from the engine only: warns before a wrong branch, says "pull back", or confirms you're on the plan.
- **The Cathy server design:** the drafted `api/cathy.ts` for David. The key stays in Vercel's environment; the model is now Claude Haiku 5.5 (`DECISIONS.md`).
- **The realistic vascular asset:** BodyParts3D 4.3 (CC BY-SA 2.1 JP) staged in `assets/vascular/`, with its licence answer and per-case visual alignment and misalignment checks.
- **Test updates:** with his OK, his grounding tests now expect Cathy's vessel-named directions.

## Who owns what

David (anatomy, case data, physics; release manager), Vaibhav (optimizer, rail wire, scoring; hand and voice input in `client/src/input/`), Aroovee (design system, screens, rendering, AR), Gibran (Teammate 4: engine verification, data and demo QA, including the NumPy cross-checks in `tests/crosscheck/`). Folder ownership and session rules: `CLAUDE.md`. Plan: `PLAN.md`. Spec: `docs/ThreadSim_Build_Specification.md`.

## Credits

Third-party code, data and assets, with licenses: `THIRD_PARTY.md`. Physics mode, where available, is built on CathSim (research use, CC BY-NC-SA 4.0); its code and meshes stay in the separate physics process. The `ts-s1404-cta`, `ts-s1336-cta` and `ts-s0727-cta` cases are derived from the TotalSegmentator dataset (University Hospital Basel, CC BY 4.0; Wasserthal et al., Radiology: AI 2023).
