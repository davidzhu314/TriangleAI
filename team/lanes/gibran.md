# Teammate 4 — Gibran: engine verification, data and demo QA

> **Approved** by David and Aroovee (`team/requests/to-all-from-vaibhav-gibran-lane.md`). The ownership rows are in `CLAUDE.md`, the lane is in `PLAN.md`, and the branch is `lane/gibran`.

Gibran makes sure the engine is right on the cases the demo actually uses, and that the demo works when it counts. He checks the engine against the generated Type III and low-tortuosity cases in TypeScript and NumPy, keeps the timing evidence current, records the golden demo drive, and runs the demo rehearsals. The work is testing, data and TypeScript, with no UI and no engine code: when a check finds a bug, it goes to the owner as a request.

**Read first:** `CLAUDE.md`, `PLAN.md`, `DECISIONS.md`, `team/DEMO.md`, this file, and `docs/ThreadSim_Build_Specification.md` sections 4, 5.3, 5.6, 6, 7.4 and 11. Then the "Engine (Vaibhav)" section of `README.md` and `tests/crosscheck/README.md`.

**You own:**
- `tests/engine/`: new TypeScript integration tests of the engine on real case files, picked up by Vitest's existing `tests/**/*.test.ts` pattern;
- `tests/fixtures/engine/`: new fixtures for those tests (golden demo logs and their expected results);
- `tests/crosscheck/`: the NumPy cross-checks, transferred from Vaibhav;
- `metrics/gibran/`: timing and verification summaries;
- `team/rehearsal/`: new demo rehearsal checklists and results.

**You consume:**
- the engine's public entry points (`client/src/optimize`, `client/src/score`, and `RailWireSource` from `client/src/wire/rail-source.ts`, for tests only);
- David's `loadCase` (`client/src/case`) and the bundled cases in `client/public/cases/`.

**Never:**
- edit `client/src/` (engine, UI, contracts or wire): a bug you find goes to its owner as a request with a failing test attached;
- loosen a tolerance (0.1 mm, 0.5°) or a timing budget without a `DECISIONS.md` line;
- compute any number with an AI model;
- edit `package.json` (file a request);
- change `team/DEMO.md`: it stays Aroovee's. The rehearsal checklist may quote it, but beat changes and fact lines go through Aroovee or a to-all request.

**Where bugs go:**
- **Engine** (`client/src/optimize/`, `score/`, `wire/rail*`): `team/requests/to-vaibhav-from-gibran-<slug>.md`.
- **Screens, or the demo test** (`tests/e2e/a8-demo.spec.ts`): `team/requests/to-aroovee-from-gibran-<slug>.md`.
- **Cases, physics or the physics wire:** `team/requests/to-david-from-gibran-<slug>.md`.

Attach a failing test where you can.

## Milestones

1. **G0 — Onboarding** (read and run only).
    - Run everything on a fresh checkout of `main`: `pnpm test`, `pytest tests/crosscheck`, `pnpm build`, and `pnpm dev`.
    - Read the demo-path test (`client/src/score/demo-path.test.ts`): it runs Plan → Compare → Drive → Results on real case files.
    - Write `team/status/gibran.md` from the other status files.
    - Done when: everything is green on your machine, and your status file is on `main`.
2. **G1 — Engine checks on the generated cases.** Required for S5 confidence.
    - **Cross-checks:** add `type-iii` and `low-tort` (loaded from `client/public/cases/`) to the NumPy cross-checks. Per-edge and route measures must match TypeScript within 0.1 mm and 0.5°.
    - **Rail acceptance (`tests/engine/`):** the rail autopilot reaches every target along every frontier route of both cases, with no wrong branch and no prolapse. `steerableAt` must accept every one of those routes.
    - **Timings (`tests/engine/`):** optimize (median < 50 ms), measureRoute (< 16.7 ms), rail step (< 1 ms) and scoreCase (< 100 ms) on both cases. Write `metrics/gibran/d6-timing.md`, and propose the new rows for `metrics/vaibhav/v7-summary.md` to Vaibhav.
    - **Progression:** a test with the real anatomy shows low-tort is ladder tier 0 and type-iii is tier 2. `nextCase` on an empty history is low-tort in ladder mode, and type-iii is open in `'open'` mode.
    - **Golden demo log:** record a rail autopilot drive of the Type III demo route (the best frontier route to rcca) in `tests/fixtures/engine/`, with its expected `CaseResult`. Add a test that replays it byte for byte, so the demo's Results beat always has a known-good log.
    - Done when: all of the above pass in CI, and `metrics/gibran/d6-timing.md` is committed.
3. **G2 — Demo rehearsal QA.** Supports S5.
    - Turn `team/DEMO.md` into `team/rehearsal/checklist.md`, beat by beat, with what to click, what should appear, and the fallback line.
    - Run it on rail (the Type III case), and on physics if David's server is up. Time each beat against its slot, and note anything that's slow, confusing or wrong.
    - Write each run to `team/rehearsal/<date>.md`. File every bug to its owner as `team/requests/to-<owner>-from-gibran-<slug>.md`.
    - Done when: one full rehearsal is recorded, and every bug is filed.
4. **G3 — Real-hand clip library** (after the demo, once Vaibhav's hands-and-voice PR #22 merges).
    - Record clips in Vaibhav's local hand lab (`scratch/hand-lab/`, see `client/src/input/README.md`):
      - left hand dominant;
      - near and far from the camera;
      - poor light;
      - every gesture;
      - false-positive tries, such as an open hand, a fist or a thumbs-up.
    - Hand clean clips to Vaibhav as fixtures, each with the expected status sequence and select count. Vaibhav owns `tests/fixtures/hands/` and the gesture constants.
    - Done when: at least 5 clips are delivered, with notes on any gesture that misbehaves.

## Starter prompt for Gibran's Claude Code

```text
I'm Gibran, Teammate 4 on ThreadSim: engine verification, data and demo QA.
Read CLAUDE.md, PLAN.md, DECISIONS.md, team/DEMO.md, team/lanes/gibran.md, the README's "Engine (Vaibhav)" section,
tests/crosscheck/README.md, and docs/ThreadSim_Build_Specification.md (sections 4, 5.3, 5.6, 6, 7.4, 11).
Start with G0 (read and run only); my lane is approved and my CLAUDE.md rows are on main.
Work only in my folders: tests/engine/, tests/fixtures/engine/, tests/crosscheck/, metrics/gibran/, team/rehearsal/.
Never edit client/src/, package.json or team/DEMO.md; a bug goes to its owner as a request with a failing test.
Never loosen a tolerance or budget without a DECISIONS.md line. No AI model computes any number.
When a milestone is done: tests green, PR from lane/gibran, team/handoffs file, team/status/gibran.md, then stop and wait for me.
Do one milestone per session unless I say "continue". Handle team/requests/to-gibran-*.md and to-all-*.md first every session.
```
