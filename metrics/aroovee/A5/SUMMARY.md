# A5 — Drive screen and controls: progress report

**Status:** Done, except for one item: the `select.ts` hookup, which is David's file.
**Date:** 2026-11-07
**Branch / PR:** `lane/aroovee` → davidzhu314/TriangleAI#17, which holds A2 to A5 and is not merged yet.
**Needed for:** S3 (drive on a real wire).

## What the Drive screen does

| Area | What's there |
| --- | --- |
| HUD | Vessel name, distance to target, wall force (labelled illustrative) and fluoro used of the budget (labelled illustrative). Every number comes from `WireState`, the planned route or `LoadedCase`. A missing value shows as a dash. |
| Controls | Keyboard: W/S push and pull, A/D rotate, hold Space for fluoro, C for a contrast puff. Gamepad with a 0.15 dead zone. On-screen buttons. All of them send `ControlInput` frames to the wire. |
| Views | Front and X-ray. In X-ray the wire shows only while fluoro is on. The contrast puff fades over `--duration-contrast-fade`, which is 1.5 s. |
| Difficulty ladder | Beginner shows everything. Intermediate dims the view. Expert is X-ray only. |
| Banners, in priority order | 1. Target reached. 2. Wall force over the threshold. 3. Off the planned route. 4. Fluoro over budget. |
| Fallback notice | If the physics wire drops to rail, a notice says why in plain words and stays up. The drive keeps going in rail mode. |
| Finish / exit | Calls `wire.stop()`, then saves `{ plan, log }` to session storage (`threadsim.drives.v1`). The plan includes its weights. Results (A6) reads this back with `savedDrive(caseKey)`. No scores are computed here. |
| Wire hookup | The wire comes from an injected factory. In the app, that factory looks for `wire/select.ts`, and the screen never builds a wire source itself. |

## How it was proven without `select.ts` on main

- A test-only page, `tests/e2e/harness/drive.html`, plugs real and fake wire sources into the screen through the same factory. Playwright serves it from its own dev server. It is never part of the app build, and I checked `dist/` to confirm.
- 7 new Playwright tests, all passing:
  1. Keys reach the wire: W pushes, Space holds fluoro, C sends exactly one puff.
  2. Vaibhav's real `RailWireSource` drives `fixture-y` to the target. The distance, force and fluoro on the HUD match the wire's own state. Finish saves a log that contains `target_reached`.
  3. Rotating into the wrong branch shows "Off the planned route". Pushing into its dead end then shows the wall-force warning.
  4. to 6. Fallback, once for each reason (`socket_failed`, `socket_stalled`, `server_unavailable`). The notice gives the right words, and the wire keeps moving in rail mode.
  7. Ladder and X-ray: intermediate dims the view, the wire is hidden in X-ray until fluoro is on, and the puff fades over 1.5 s.

## Checks

| Check | Result |
| --- | --- |
| `pnpm test` (includes the mock guard) | 673 passing |
| `pnpm build` | Green; no test code in `dist/` |
| Playwright, full suite, run twice | 31 passing, 1 skipped |
| Taste lint | 0 FAIL. The 1 WARN is the Inter font, already there before A5. |
| Inspector, Drive at 1440 / 768 / 390, light and dark | 0 FAIL with a wire present, at the target, on fallback, and in X-ray with a puff |
| Token check | Clean: no raw colours, sizes, radii or shadows |

Screenshots in this folder:
- `live-1440-light.png`, `live-1440-dark.png` and `live-390-light.png`: a live drive mid-route;
- `live-1440-dark-xray-puff.png`: X-ray during a contrast puff;
- `fallback-1440-light.png`: the fallback notice.

## Open item

- **`select.ts` (David).** I've asked for a rail-only version now: `selectWireSource(case)` returns `new RailWireSource()`. Until it lands, the app shows "Driving isn't available yet in this build". Once it lands, the Drive screen connects with no change on my side. Physics and replay can follow later under the same function signature.

## Left out on purpose

- **3D aorta:** three.js isn't on main, so the 2D view stays.
- **Hand tracking and voice:** the team decided these come after the demo.
- **Honesty line:** no honesty line on the Drive HUD, as instructed.

## Decisions logged (`DECISIONS.md`)

- The injected wire factory.
- Saving drives for Results.
- The fallback notice wording.
- How off-route is detected.
- The test-only harness.
- Rotate stays live in physics mode.
