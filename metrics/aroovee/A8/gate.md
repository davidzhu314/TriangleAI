# A8 gate: every 2D screen

Run on 2026-11-07, on the production build (`pnpm build`), with Taste Skill v2.1.5:
- `inspect.mjs --app` at 1440, 768 and 390 px;
- `CHROME_PATH` set to Playwright's Chromium 1254.

**How each theme was tested.** Light and dark were inspected on scratch copies of `dist/`, with the dark media query forced on or off, because the inspector's browser follows the OS theme.

**Seeded data.** Each copy seeds this tab's saved plan and drive from Vaibhav's `score-wrong-branch-fixture-y` golden, so Compare and Results have data. The Library opens as a first-time trainee's, with the guided-tutorial note showing.

**Drive with a wire.** The test-only drive harness, built the same way, gives Drive a moving wire: `RailWireSource` on autopilot, advanced 60 ticks. `select.ts` isn't on main.

| Screen | URL inspected | Light | Dark |
| --- | --- | --- | --- |
| Library | `#/library` (fresh browser, tutorial note on) | 0 FAIL, 0 WARN | 0 FAIL, 0 WARN |
| Case brief | `#/case/type-iii` | 0 FAIL, 1 WARN | 0 FAIL, 1 WARN |
| Plan | `#/case/type-iii/plan` | 0 FAIL, 1 WARN | 0 FAIL, 1 WARN |
| Compare | `#/case/fixture-y/compare` | 0 FAIL, 1 WARN | 0 FAIL, 1 WARN |
| Drive, front view, wire mid-route | drive harness, `fixture-y`, autopilot | 0 FAIL, 0 WARN | 0 FAIL, 0 WARN |
| Drive, X-ray during a contrast puff | drive harness, `view=xray&puff=1` | 0 FAIL, 0 WARN | 0 FAIL, 0 WARN |
| Results | `#/case/fixture-y/results` (wrong-branch golden) | 0 FAIL, 0 WARN | 0 FAIL, 0 WARN |

**0 FAIL on every 2D screen.**

## Warnings kept

| Screen | Warning | Why it stays |
| --- | --- | --- |
| Case brief, 1440 | `panel-void`: a 261 px blank band in the scenario card | The card lays its facts out as label-over-value in two columns. On Type III, one column (targets and entry sites) is longer than the other, so the short column ends early. The facts come from the case file, and padding the short side would add filler. |
| Plan, 1440 | `ragged-row`: the view well and the cost panel end 367 px apart | The view and the readout panel are different objects in the builder layout (DESIGN.md: Plan row). The well fills the stage and the panel is as tall as its rows. Stretching the panel would add empty space. |
| Compare, 1440 | `ragged-row`: the overlay and the weights panel end 350 px apart | Same reason as Plan: the overlay is the screen's largest block, and the weights panel holds one row per measure. |

## Other checks

- **Taste `lint.mjs`** on my folders (`client/src/ui`, `render`, `styles`, `assets`, `main.ts`): 0 FAIL, 1 WARN. The warning is `default-font` (Inter), the A0 typeface measured from the reference site and recorded in DECISIONS.md.
- **Token check** across `client/src/ui` and `client/src/render`: no raw hex colours and no px, rem, em or ch lengths, apart from the 640 px and 1100 px breakpoints DESIGN.md allows. The tutorial note's position is computed at run time from the element it points at, not written as a size.

## Re-run with the 3D views (2026-11-07, after D5 and A7)

**Setup.**
- Plan, Compare and Drive now open in three.js; the flat 2D face is one click away.
- Same method as above: the production build, theme forced, a plan and the wrong-branch golden seeded.
- Drive now gets its wire from `select.ts` in the production build, so it was inspected on the real app, not the harness.

| Screen | Light | Dark |
| --- | --- | --- |
| Library (7 cases now, tutorial note beside "Open case") | 0 FAIL, 1 WARN | 0 FAIL, 1 WARN |
| Case brief | 0 FAIL, 1 WARN | 0 FAIL, 1 WARN |
| Plan, 3D | 0 FAIL, 1 WARN | 0 FAIL, 1 WARN |
| Compare, 3D | 0 FAIL, 1 WARN | 0 FAIL, 1 WARN |
| Drive, 3D, live rail wire | 0 FAIL, 0 WARN | 0 FAIL, 0 WARN |
| Results | 0 FAIL, 0 WARN | 0 FAIL, 0 WARN |

**0 FAIL on every 2D screen.**

**New warning kept: Library `hero-void` at 1440 px** (an empty block of 780 × 480 px). It's the middle of the case rows, each with its title on the left and its stars on the right. Main now bundles 7 cases, so seven rows fill the first screen. They are peer rows (DESIGN.md: Library row), and filling the middle would add filler.

**Fixed while checking:** the tutorial note covered the "Other cases" heading. It now sits beside its anchor when there's room.

**Plan's `ragged-row`** now counts two pairs (367 and 292 px), because the 3D well holds the 3D/Flat switch. The reason it stays is the same as above.
