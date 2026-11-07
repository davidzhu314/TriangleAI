# Request — to all from Vaibhav: hand gestures, push-to-talk voice and assistant answers for Catherine

What I need: your go-ahead, and the pieces each of you owns, for three optional features in Catherine (the app's new name):
- **MediaPipe hand gestures:**
  - gun pose with the fingers straight → push;
  - gun pose with the fingers curled → pull (half-curled holds);
  - gun pose twisted → rotate;
  - point at the model and pinch → select the hovered branch.
- **Push-to-talk voice commands:** zoom in, zoom out, and three assistant questions.
  - A spoken wake word, "Hey Cathy", is optional while push-to-talk is held. (The app is still named Catherine.)
  - Push-to-talk is the default: the app listens only while the talk control is held.
  - **New, needs your explicit OK:** an opt-in "always listen" mode. The player switches it on; the microphone stays live, and only phrases that start with "Hey Cathy" run a command. It is off by default, the UI must show that the microphone is live and that audio streams to Google (Chrome), and it can be dropped if you say no. Built on the draft branch only.
- **Assistant answers, from the engine only:** no AI model computes anything (CLAUDE.md, spec §11).
  - "Best next artery": the next branch on the best-ranked frontier route.
  - "My options": the next branches on all frontier routes, with their labels, highlighted for point-and-pinch.
  - "How am I doing": feedback lines from V5's templates, on the drive so far.

Why: hands-free and voice controls for the Plan and Drive screens, plus help that never invents a number.
Where:
- **Assistant (Vaibhav, built now):** `client/src/optimize/assist.ts` and `client/src/score/live.ts`, on `lane/vaibhav`.
- **Gesture and voice logic (Vaibhav, built now as a draft):** `client/src/input/hands/` and `client/src/input/voice/`, on `lane/vaibhav-input`. That PR is a draft and won't merge until this request is answered and the folder has an owner.
- **App wiring:** Aroovee's screens, later.
Needed by: before S5 if possible. Not blocking anything that exists today.
Meanwhile: nothing in the app imports the new modules. The camera and microphone are never opened by committed code, and the production build is unchanged.

## What doesn't change
- **No contract changes.** Gestures produce the existing `ControlInput` (push and rotate). Fluoro and contrast stay on Space and C.
- **Scores still replay from the event log.** The log records the resulting samples and events, not the raw input.
- **Every action keeps its keyboard path** (spec §7.3).
- **Camera and microphone are off** unless the user turns them on.

## Asks
- **David:**
  1. Add a CLAUDE.md ownership row: `client/src/input/` and `tests/fixtures/hands/` → Vaibhav.
  2. Later: add the runtime dependency `@mediapipe/tasks-vision` (pinned), bundle the `hand_landmarker.task` model under `client/public/models/` so the demo works offline, and add a `THIRD_PARTY.md` entry (Apache-2.0).
  3. Record the product name "Catherine" in `DECISIONS.md`.
- **Aroovee:**
  - Later: a camera on/off toggle, the permission prompt and a small self-view.
  - Show the voice caption ("Heard: … → Zoom in").
  - Call the gesture pointer from the Plan view through the existing `PlanView`, with a `pickAt(x, y)` hit test: 2D now, 3D later.
  - Apply zoom actions to the view.
  - Highlight the edges the assistant names.
  - Rename the on-screen product name to Catherine.

  `client/src/input/README.md` (on the draft branch) is the hookup guide.
- **Team decision:** is the opt-in always-listen mode acceptable, given that it departs from "never listens outside push-to-talk"?
- **Team decision:** should using an assistant hint mark the attempt "assisted" on Results, or cost anything? Until you decide, the engine only counts hints (`ProgressRecord.hintsUsed`, optional, unused by progression).

## Claims
Describe these as hands-free and voice controls. Never claim they reproduce real catheter handling (spec §9.4). Chrome's speech recognition sends audio to Google while push-to-talk is held, so voice needs internet; the UI should say so where it's switched on.

This supersedes `to-all-from-vaibhav-mediapipe-hand-input.md` for the gesture details. That request's scope question still stands.

## Answer

David: <one line>
Aroovee: <one line>
