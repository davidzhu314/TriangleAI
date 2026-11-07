# A6 — Results screen: progress report

**Status:** Done. Every acceptance check passes.
**Date:** 2026-11-07
**Branch / PR:** `lane/aroovee` → davidzhu314/TriangleAI#17. The PR holds A2 to A6. It is open, CI is green (client, crosscheck, physics-bridge), and it is not merged to main yet.
**Needed for:** S4 (scores work).

## What the Results screen does

The screen answers one question: "What one thing should I change?"

| Area | What's there |
| --- | --- |
| Finding | The engine's top feedback line (`feedback[0]`), shown as written, at lead size, with its formula tooltip. Beside it is one button: "Revise the plan" when it's a plan line and the plan lost points, otherwise "Retry the drive". The next three lines follow, smaller. |
| Plan score | The score out of 100, which check set it, and its cap, in words. |
| Drive score | A table of its four parts: path fidelity, gentleness, radiation and errors. Each has what was measured, its score, its weight and a formula tooltip. Time is shown as "not scored". Gentleness and radiation are labelled illustrative. |
| Stars | In words ("2 of 3 stars") with a new star icon. When the fluoro allowance took a star, it says which one and by how many seconds over. |
| Replay | A time axis across the drive, with one mark per event: force spike, wrong branch, prolapse, back-out, contrast puff, target reached. Each mark has an icon and a label, and you can tab through them. Below it, a small view of the driven path over the best route at your weights. |
| Progress | Each scored drive is recorded once, and a refresh never records it again. It shows your best stars for the case, and the adaptive suggestion in words when there is one. |
| Actions | "Next case" (the case the Library offers next) as the one main button. "Retry drive" and "Revise plan" sit beside it. |
| Honesty line | The exact text, at the bottom. |
| No saved drive | The screen says so in words and links to Drive and Plan. It never shows a made-up result. |

Every number on the screen comes from the engine: the scoring result, the replay timeline or the case. None is typed into the UI.

## Also built for A6

- **Five new icons** on the A1 grid: star, force spike, wrong branch, prolapse and back-out. Two rounds of lint and render, 0 issues.
- **Drive's Finish button** now opens Results.
- **App routing** moved into `ui/app.ts`, so a test copy of the app can plug in a real wire source.
- **Progress history:** malformed saved records are now skipped when it's read. Vaibhav suggested this in his review of #17.

## How it was tested

| Check | Result |
| --- | --- |
| `pnpm test` (includes the mock guard) | 686 passing, 13 of them new for Results |
| `pnpm build` | Green; no test code in the build |
| Playwright, full suite, run twice | 40 passing both times, 9 of them new for Results |
| Taste lint | 0 FAIL. The 1 WARN is the Inter font, already there before A6. |
| Inspector, Results at 1440 / 768 / 390, light and dark | 0 FAIL, 0 WARN on the clean, wrong-branch and over-budget results |
| Token check | Clean |

The new Playwright tests use Vaibhav's four golden drives (clean, wrong branch, prolapse, over budget). They check that the screen shows exactly what each golden result says. They also cover:
- the wrong-branch and prolapse marks, and the lost star;
- recording once on refresh;
- the keyboard path through the timeline;
- Next case matching the Library;
- the screen with no saved drive;
- the full click-through on fixture-y: Library → Brief → Plan → Compare → Drive → Results.

Screenshots in this folder:
- clean, wrong-branch and over-budget results;
- light and dark;
- at 1440 and 390.

## Open items

- **The plain app can't drive yet.** It needs David's `select.ts`. Until then, the click-through runs through a test-only copy of the app that plugs in the rail wire. Once `select.ts` lands, the same click-through can run on the real build.
- **The top feedback line praises the plan on fixture-y.** On every fixture-y drive, the top line is "Your route is the best available at your own weights", even on the prolapse drive that scores 39. I asked Vaibhav to put a line that needs changing first (`team/requests/to-vaibhav-from-aroovee-feedback-lead.md`). Only the order changes. Until then, the screen shows the top line as it is.
- **No Replay button.** Nothing on main can replay a drive yet, so the timeline stands in for now.
- **The best-route line is hidden on fixture-y.** It sits under the driven path whenever the player drove the best route. The legend still names both lines.

## Decisions logged (`DECISIONS.md`)

- How the finding and its button are chosen.
- Scoring on entry, and recording each attempt once.
- The Library stays in open mode, per Vaibhav's demo rule.
- No Replay action yet.
- `startApp` and the test-only app harness.
- The new icons, and the colour of the problem marks.
