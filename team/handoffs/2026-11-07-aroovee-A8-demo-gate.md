# Handoff — Aroovee A8: demo and gate

What landed:
- **`tests/e2e/a8-demo.spec.ts`:** `team/DEMO.md` beat by beat, in rail mode, on one shared page.
  - **Problem:** the Library opens.
  - **Plan:** on Type III, the right femoral route is built on the keyboard path, and the sharp-turn warning and live costs show.
  - **Compare:** three frontier rows; the "Closeness to risk zones" slider reorders them, and the presenter switches to the new first route.
  - **Drive:** rail on Type III, X-ray only, fluoro held, a contrast puff, the target reached.
  - **Results:** the lead line, scores and replay markers.
  - **Scale:** a generated `case.zip` imports.
  - **Then the same Plan → Results path on fixture-y.**
  - Every expected value comes from the engine in the test (`routeFor`, `optimize`, the Compare model, `scoreAttempt`, `replayTimeline`).
  - No "Never say" phrase appears on any screen.
- **Guided tutorial** (`client/src/ui/tutorial/`):
  - Plan → Compare → Drive on the lowest-tier case (`low-tort`), as small anchored notes with no modal and no dimming.
  - It advances only on real actions, is skippable, and is remembered per browser. The Case brief can reopen it.
  - Unit tests in `tutorial/model.test.ts`; Playwright in `tests/e2e/a8-tutorial.spec.ts`.
  - Hooked into `ui/app.ts` and `ui/brief.ts`.
- **`team/DEMO.md`:** one fact line per beat in the fallback column. No beat changed.
- **`metrics/aroovee/A8/`:**
  - `gate.md`: the inspector table.
  - `perf.md`: load times and chunk sizes.
  - `demo-backup.vtt`: captions for the video.
  - **The video, `demo-backup.webm`** (1440 × 900, light, rail, 2:48.6), is local only. It's 13 MB and not in git (see Known gaps).

How to use:
- `pnpm exec playwright test tests/e2e/a8-demo.spec.ts` runs the demo test.
- `A8_VIDEO=1 pnpm exec playwright test tests/e2e/a8-demo.spec.ts` records the video at demo pace into `test-results/a8-video/`.
- Clear `localStorage` `threadsim.tutorial.v1` to see the tutorial again on a fresh browser, or press "Show the guided tutorial" on the low-tort brief.

Who switches:
- **David:**
  - `select.ts` is the one S5 item left (see the checklist). When it lands, `a8-demo.spec.ts` switches to the production build by itself, and the presenter drives with the keys. Expect to tune that driving path then.
  - Also open with you: three.js and the physics case index.
  - `perf.md` suggests the Library read only `case.json` at first, for slow networks. That would change how `ui/store.ts` uses your loader, so it's your call.
- **Vaibhav:** the feedback-order request is still open. Until it's answered, the Results beat leads with `plan.best`, as `DEMO.md` now says. Default weights is open too.

Mock replaced: none
Contracts version after this handoff: unchanged (1)
Tests:
- `pnpm test`: 694 passed, 8 of them new for the tutorial.
- `pnpm build` is green, with no harness code in `dist/`.
- `a8-demo.spec.ts`: 7 passed, three runs in a row with `--retries=0`.
- Full Playwright: 49 passed with `--retries=0`, including 2 new tutorial tests.
- Taste lint: 0 FAIL. The 1 WARN is the Inter font, from A0.
- Inspector: 0 FAIL on every 2D screen in light and dark. The three warnings kept are explained in `gate.md`.
- Token check: clean.
New dependencies: none. The test reuses `tools/lib/zip.ts` (David's) read-only to build the `case.zip`.
Decisions logged:
- The demo test runs in the harness until `select.ts` lands.
- The demo route on Type III.
- The guided tutorial.
- The backup video stays out of git.

## S5 checklist

| Item | Status | Owner |
| --- | --- | --- |
| Playwright runs `team/DEMO.md` green in rail on Type III and fixture-y | **Met** in the test harness: 7/7, three times in a row | Aroovee |
| …against the production build (spec Phase 8) | **Not met:** the plain app can't drive until `client/src/wire/select.ts` lands; the test switches by itself when it does | David |
| Zero Taste inspector FAILs on every 2D screen at 1440, 768 and 390 px | **Met:** 0 FAIL on all seven screen states, light and dark | Aroovee |
| Initial load under 5 s on a laptop | **Met:** 0.27 s, or 2.8 s with the CPU 4× slower on 10 Mbps. On Fast 3G it's 13.9 s, because of the case meshes. | Aroovee, plus David for the loading fix |
| Backup demo video | **Met:** 2:48.6, 1440 × 900, rail, captions committed. The video itself is local only. | Aroovee |
| Guided tutorial on the low-tortuosity arch | **Met** | Aroovee |
| V7 (engine timing) | Met on main | Vaibhav |
| D7 / A7 (AR) | Not started (A7 is a stretch goal and wasn't in this session) | David / Aroovee |

Known gaps:
- **No production-build demo run** until `select.ts` lands. The Drive beat also leads with rail, not physics: physics needs `select.ts` and the CathSim process.
- **The Results beat leads with `plan.best`** until Vaibhav reorders the feedback.
- **The Scale beat imports a generated zip.** D3c (Slicer) is blocked.
- **The video isn't in the repo.** It's at `metrics/aroovee/A8/demo-backup.webm` on Aroovee's laptop, excluded from git through `.git/info/exclude`. Share it outside git, or re-record it with the command above.
- **On a slow network the Library takes 13.9 s.** See `perf.md`.
