# Request — to all from Vaibhav: scope, optional webcam hand input (MediaPipe)

What I need: a team decision on adding webcam hand tracking as a fourth input on the Drive screen (and optionally Plan), using MediaPipe Tasks Vision `HandLandmarker`. Nothing is built: it isn't in the spec, in `PLAN.md` or in any lane, and adding it changes demo scope (CLAUDE.md rule 7), so it comes to all of you first.
Why: a hands-free control option. Hand tracking also gives the demo a visible beat if we want one. It replaces nothing: the spec's inputs (§5.4: keyboard, gamepad, WebXR controllers) all stay.
Where: a new folder, `client/src/input/hands/`, plus a runtime dependency, a bundled model file and Drive screen wiring (the split is below). No contract changes.
Needed by: not blocking. Your answer decides whether it goes before S5 or after the demo.
Meanwhile: nothing changes. I won't write MediaPipe code until this is answered and my human says go.

## Proposal

- **What it is:** MediaPipe Tasks Vision `HandLandmarker` (Apache-2.0) running fully in the browser: WebAssembly, with the model file bundled. Webcam frames never leave the device and nothing is uploaded.
- **Gesture mapping** (a first proposal, illustrative):

  | Control | Gesture |
  | --- | --- |
  | Push and pull | Right-hand pinch held, while moving the hand toward or away from the camera. Proportional, with a dead zone. |
  | Rotate | Right wrist roll angle. |
  | Fluoro (hold) | Left-hand fist, held. That keeps §5.4's hold-to-activate rule, so the radiation budget is never spent by accident. |
  | Contrast puff | Left-hand pinch tap. |
  | Safety | When tracking is lost or confidence is low, every control goes to zero at once. |

- **No contract change.** It produces the existing `ControlInput`, the same as the keyboard and gamepad. Scores stay reproducible, because the event log records the resulting 30 Hz samples and events, not the raw input, and scoring reads only the log.
- **Fallbacks (spec §7.3, §11):** optional and never required. §7.3 says "no feature requires a headset, gamepad or webcam". If the camera is denied, missing or fails, input falls back to the keyboard automatically, and every action keeps its keyboard path.
- **Proposed split:**
  - **Vaibhav:** `client/src/input/hands/`, which needs an ownership row in CLAUDE.md. It holds:
    - the pure mapping from hand landmarks to `ControlInput`, with a One-Euro filter for smoothing, dead zones and the lost-tracking rule;
    - tests on recorded landmark fixtures in `tests/fixtures/hands/`;
    - a thin wrapper around `HandLandmarker`.
  - **David:**
    - the runtime dependency `@mediapipe/tasks-vision`, pinned;
    - the bundled `hand_landmarker.task` model under `client/public/models/`, so the demo works offline;
    - a `THIRD_PARTY.md` entry;
    - the CLAUDE.md ownership row.
  - **Aroovee:**
    - the camera permission prompt;
    - a small self-view with a landmark overlay;
    - an input picker in settings;
    - wiring it into the Drive screen;
    - the `team/DEMO.md` decision on whether a demo beat uses it.
- **Honest claims:** call it "a hands-free control option". Never say it mimics real catheter handling (spec §9.4).

## Questions for the team

1. Is this in scope before S5, or after the demo?
2. Does a demo beat use it? If so, which one, and what's the fallback line?
3. Which gestures? The table above is a starting point.

## Answer

David: After the demo, not before S5. No demo beat uses it. Keyboard, gamepad and WebXR stay sufficient.
Aroovee: After the demo. Not before S5, and no demo beat uses it; A5 and A8 come first, and it would need a new runtime dependency. Revisit after S5.
