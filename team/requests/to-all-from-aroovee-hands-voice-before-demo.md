# Request — to all from Aroovee: hands and voice enter the demo (reverses "after the demo")

What I need: everyone's yes, on record, that hands and voice may be in tomorrow's demo after all. This is option A, as David approved it: on `integration/hands-voice`, through one scoped merge exception, with a 06:00 EST cut-off. It's a demo-scope change, and it reverses the "after the demo" answers recorded on `to-all-from-vaibhav-hands-voice-assist.md` and `to-all-from-vaibhav-mediapipe-hand-input.md`, including mine.

Why: the team agreed tonight that there's time. The gesture and voice logic in #22 is tested, and David has added MediaPipe and the hand model to the branch. Keyboard-only stays the fallback.

The rules (David's, in DECISIONS.md 2026-11-08):
- **Main stays frozen.** All the work goes to `integration/hands-voice` (draft PR #73, preview https://threadsim-git-integration-hands-voice-dz-ll.vercel.app/).
- **One merge, or none.** If #73 is green and Gibran has rehearsed it on the preview by 06:00 EST, David merges it once. If not, main is unchanged and the demo is keyboard-only.
- **Live risks, said out loud:** voice needs the venue's internet (Chrome streams the audio to Google while the mic is open), and hand tracking needs decent light.

Who does what:
- **David:** done. `@mediapipe/tasks-vision` 1.2.2 (pinned) and `client/public/models/hand_landmarker.task`, both served from the app.
- **Vaibhav:** bring #22 up to date and merge it into the branch.
  - Please also change `client/src/input/purity.test.ts` ("nothing in the app imports the input folder yet"). From now on `client/src/ui/` imports it by design. Allowing `ui/` keeps the guard for everything else.
- **Aroovee (me), on the branch:**
  - camera on/off and a mirrored self-view;
  - hand tracking on MediaPipe, feeding #22's gesture machine;
  - on Drive, gestures push and rotate the wire through `mergeControl`, and keyboard input wins;
  - on Plan, the hand points and a pinch picks the branch under it;
  - push-to-talk on **V** with a caption of what was heard, and a visible notice while the mic is live that audio goes to Google;
  - voice commands: zoom in or out, plus Cathy's best next artery and the options, from the engine's assist answers;
  - a new `team/DEMO.md` step, with its fallback line, and its Playwright test.
- **Gibran:** rehearse the new step on the preview, time it, and file anything wrong before the cut-off.

Needed by: tonight, well before 06:00 EST.
Meanwhile: the demo path on main is unchanged. If any lane says no, the branch just doesn't merge.

## Answer

David: Approved: option A, as an integration branch with one scoped merge exception, cut-off 06:00 EST (his message tonight; DECISIONS.md 2026-11-08).
Vaibhav: <one line>
Gibran: <one line>
