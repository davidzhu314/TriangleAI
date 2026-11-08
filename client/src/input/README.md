# client/src/input: hands-free and voice input (owner: Vaibhav, pending the CLAUDE.md row)

Optional controls for Catherine:
- **MediaPipe hand gestures:** push, pull and rotate the wire; point and pinch to pick a branch.
- **Voice commands:** push-to-talk (default) or an opt-in always-listen mode woken by "Hey Cathy".
- **The engine's assistant answers**, which voice asks for.

Everything here is pure logic plus two thin wrappers. Only the screens (`client/src/ui/`) import it (the purity test enforces that), and nothing here opens the camera or microphone on its own. Every action keeps its keyboard path (spec §7.3). Describe these as hands-free and voice controls, never as real catheter handling (spec §9.4).

## Status

| | |
| --- | --- |
| Code | PR #22 (`lane/vaibhav-input`), merged into `integration/hands-voice` (draft PR #73) for the demo: hands and voice enter the demo after all (DECISIONS.md 2026-11-08, option A, cut-off 06:00 EST). Tuned on a real webcam clip. |
| Team request | `team/requests/to-all-from-vaibhav-hands-voice-assist.md`; reversed for the demo by `team/requests/to-all-from-aroovee-hands-voice-before-demo.md` |
| Aroovee | Hooked up on `integration/hands-voice`: camera and self-view, gestures into Drive, pinch on Plan, push-to-talk with caption and live-mic notice, and a DEMO.md step. Always-listen ("Hey Cathy") isn't hooked up yet. A hint marks the attempt "assisted", shown on Results (A6). |
| David | Approved option A (one scoped merge exception to the freeze, cut-off 06:00 EST). Added the CLAUDE.md row for `client/src/input/` and `tests/fixtures/hands/`, the pinned `@mediapipe/tasks-vision`, the bundled model and its THIRD_PARTY.md entry. |
| MediaPipe | `@mediapipe/tasks-vision` 1.2.2 (pinned) and `client/public/models/hand_landmarker.task`, added by David on `integration/hands-voice`. This folder still declares the landmark types itself and never imports MediaPipe; Aroovee's `ui/hands-voice/` does. |
| Assistant answers | Already on main (PR #21): `client/src/optimize/assist.ts`, `client/src/score/live.ts`. |

## Files

| Path | What it is |
| --- | --- |
| `hands/types.ts` | Landmark, frame, output and config types (MediaPipe's 21-point hand) |
| `hands/constants.ts` | Every gesture threshold, illustrative, tuned on synthetic hands and a real clip |
| `hands/pose.ts` | Pose geometry: named checks (`gunChecks`, `pointChecks`), curl, twist, 2D pinch, mirroring |
| `hands/filter.ts` | One-Euro smoothing |
| `hands/machine.ts` | `createGestureMachine(config).step(frame) → GestureOutput` |
| `hands/to-control.ts` | `mergeControl(gesture, keyboard) → ControlInput` |
| `voice/commands.ts` | Voice actions and their phrasings; wake words |
| `voice/match.ts` | `matchCommand(alternatives)`: phrase matching |
| `voice/ptt.ts` | `createPushToTalk`: hold to talk, with a 0.7 s cut-off after release |
| `voice/wake.ts` | `createWakeListener`: opt-in always-listen, woken by "Hey Cathy" |
| `voice/speech.ts` | `createBrowserRecognizer`: a thin, never-throwing Web Speech wrapper |
| `index.ts` | The public API: import from here |

## Gestures (`hands/`)

| Gesture | Effect |
| --- | --- |
| **Gun pose:** index and middle together (the barrel), thumb up on top, ring and pinky folded (the grip) | Engages push and rotate |
| Barrel straight (curl ≤ 0.25) | Full push; partial push up to curl 0.35 |
| Barrel half-curled (0.35–0.55) | Hold |
| Barrel curled (0.55 → 0.85) | Pull, to full pull |
| Twist the hand (clockwise, as you see it, is positive) | Rotate; ±10° dead zone, full rate at ±45° |
| **Point pose:** index out; middle, ring and pinky folded (thumb free) | Moves the pointer |
| Pinch: thumb tip to index tip while pointing | Selects the hovered branch, **once per pinch**; open the thumb before the next |

How poses behave:
- **Start and keep levels.** A pose starts only when its strict start checks pass for 150 ms. Once engaged, looser keep checks hold it, so aiming around and twisting past 90° don't release it.
- **Grace.** A keep failure must last 250 ms before the pose drops. A real camera runs at about 20 fps, so a wobble lasts several frames.
- **Instant release.** Losing the hand, a tracking score below 0.6, or dropping the thumb out of the gun releases control on that same frame.
- **Pinch is measured in 2D** on the image landmarks: the thumb-tip to index-tip distance, ÷ the larger of palm length and knuckle width. The tracker's depth fails when the thumb tip hides behind the fingertip; on a real clip, 3D caught 1 of 8 pinches and 2D catches all 8. Touch below 0.25, re-open above 0.35.
- **While pinching, the index check is waived.** A real index bends to meet the thumb, and that must not drop the point pose.
- **Left/right.** With `mirrored: true` (raw front-camera frames), x is flipped to the user's view, and MediaPipe's Left/Right label is kept: Tasks Vision 1.2.2 already names the real hand. `swapHandedness: true` exists for a camera path that reports the opposite hand.

Each pose is a named list of checks (`gunChecks`, `pointChecks`), each with its value, limit and OK. Show them in a debug view to see why a pose isn't registering. All thresholds are in `hands/constants.ts`, and every change is logged in DECISIONS.md.

### Hookup (Aroovee)

```ts
import { createGestureMachine, mergeControl } from '../input';

const hands = createGestureMachine({ dominant: 'Right', mirrored: true }); // raw front-camera frames
// for each HandLandmarker result (VIDEO mode), with the video frame's timestamp:
const g = hands.step({ tMs: video.currentTime * 1000, hands: toHandObservations(result) });
```

- **`toHandObservations`:** map MediaPipe's `landmarks[i]`, `worldLandmarks[i]` and `handedness[i][0]` (`categoryName`, `score`) to `HandObservation`.
- **Drive screen:** `wire.control(mergeControl(g, keyboardInput))`. Push and rotate come from the hand, any keyboard axis you press wins, and fluoro and contrast stay on Space and C.
- **Plan screen:** when `g.pointer` isn't null, it's a 0..1 screen position in the user's view (already un-mirrored). Hover with `PlanView.pickAt(x, y)`. When `g.select` is true (one frame per pinch), add the hovered branch.
- **Self-view:** draw the selfie video mirrored, so the pointer and the picture agree.

## Voice (`voice/`)

There are two ways to talk:

- **Push-to-talk (default).** The app listens only while the talk control is held. After release, a result still counts for 0.7 s (the end of what was said while held). Then the microphone is cut off and later speech is ignored. Saying "Hey Cathy" first is optional.
- **Always listen (opt-in; approved by Aroovee and David).** The player switches it on and the microphone stays live. **Only speech that starts with "Hey Cathy" runs a command**; everything else is ignored.
  - "Hey Cathy, zoom in" works in one go.
  - "Hey Cathy" alone arms it for the next phrase.
  - It restarts after each phrase until switched off, and stops for good if the microphone is blocked.
  - While it's on, the UI must show that the microphone is live and that audio streams to Google (Chrome).

The wake word is "Hey Cathy", with a C. The app's name stays Catherine. The matcher also accepts the spellings speech recognition may return (`kathy`, `cathie`, `kathie`, `cathi`, `kathi`, `katie`), after "hey" or "a".

| Action | Phrasings (see `voice/commands.ts`) | What the app does |
| --- | --- | --- |
| `zoom_in` | "zoom in", "closer", … | Zoom the Plan/Drive view in |
| `zoom_out` | "zoom out", "wider", … | Zoom out |
| `assist_best_next` | "best next artery", "where next", … | Plan: `planAssistLine(planAssist(…), case, target, 'best')`; highlight `best.edge`. Drive: `driveAssist({ log: wireLogSoFar(source), … }).lines[0]` (the drive so far, without stopping it; null for a source without `logSoFar`) |
| `assist_options` | "what are my options", … | Plan: `planAssistLine(…, 'options')`; highlight every steerable `options[i].edge` and make them pinchable |
| `assist_review` | "how am I doing", "any mistakes", … | Drive: `driveAssist(input).lines` (the drive so far) |

```ts
import { createBrowserRecognizer, createPushToTalk, createWakeListener } from '../input';

// push-to-talk: hold V (or a gesture) to talk
const ptt = createPushToTalk(createBrowserRecognizer(), onMatch, { onStateChange: showMicState });
onKeyDown('KeyV', () => ptt.press());
onKeyUp('KeyV', () => ptt.release());

// always listen (opt-in): only "Hey Cathy, …" runs a command
const wake = createWakeListener(createBrowserRecognizer(), onMatch, showMicState); // 'listening' | 'armed' | 'off' | 'error'
alwaysListenToggle.onchange = () => (alwaysListenToggle.checked ? wake.start() : wake.stop());

function onMatch(m: VoiceMatch) {
  showCaption(m.action ? `Heard: “${m.heard}” → ${label(m.action)}` : `Heard: “${m.heard}”`);
  if (m.action) run(m.action);
}
```

Use one recogniser per mode, or stop one mode before starting the other. Disable the V key while always-listen is on.

**Privacy:** in Chrome, speech recognition sends audio to Google's servers while a session is open, so voice needs internet. Say so where the user turns voice on. `createBrowserRecognizer()` reports `isSupported: false` (and does nothing) where the API is missing, and never throws.

## Assistant answers and "assisted"

`planAssist`, `planAssistLine` and `driveAssist` come from the engine (`client/src/optimize/assist.ts`, `client/src/score/live.ts`, on main). No AI model computes any number. Count each hint in `ProgressRecord.hintsUsed`. Per Aroovee's answer, an attempt with `hintsUsed > 0` is "assisted", and Results (A6) shows it. Progression still ignores the count.

Pass the case's graph so Cathy only names routes the wire can steer: `planAssist({ …, graph: buildGraph(case) })`. Each option then carries `steerable`, `best` is never one the wire can't steer, and when nothing for that entry and wire is drivable the answer is "No safe way on from here with this wire." With contracts v2 the optimizer already drops unsteerable routes (`cannot_steer`), so this is a double check. Highlight only options with `steerable !== false`.

## Tests

- **`hands/gestures.test.ts`:** synthetic hands, grouped by what the player does: making a pose (and the near-misses), holding it in the real world (aim ±45°, twist ±60° with tracking noise), push/pull/twist zones, letting go, and point/pinch, mirroring and dominant hand.
- **`hands/real-clip.test.ts`:** replays a real 79 s webcam clip (`tests/fixtures/hands/right-gun-twist-point-pinch.json.gz`, compressed landmarks only). The gun and point hold throughout, and 8 pinches give exactly 8 selects. A change that breaks a real hand fails here.
- **`hands/rail-drive.test.ts`:** gesture frames drive fixture-y's best route on the rail wire with no wrong branch.
- **`voice/voice.test.ts`, `voice/wake.test.ts`:** every phrasing and wake spelling, mis-hearings, the push-to-talk window and cut-off, always-listen (wake-only, arming, restarts, fatal errors), and the browser wrapper.
- **`purity.test.ts`:** no clock, randomness, storage, network, MediaPipe or three.js, and nothing outside this folder imports it.

## Webcam lab (local only, never committed)

`scratch/hand-lab/` (git-excluded) runs the real MediaPipe HandLandmarker (loaded from its CDN) into this folder's code. It shows:
- a live readout beside the video: status, push, rotate, pointer, selects, and a DIAGNOSIS panel with every pose check (OK, STAY or FAIL) and the pinch distance;
- a voice log: mic open/closed, what Chrome heard and how sure it was, the command matched, or why the speech was ignored.

Run it from the `TriangleAI` folder on this branch, then open http://localhost:5199 in Chrome:

```bash
npx -y pnpm@9.15.9 exec vite scratch/hand-lab --port 5199
```

- **Voice:** hold **V** to talk, or tick **Always listen for "Hey Cathy"**.
- **Recording:** **Record** downloads the frames as JSON. Good clips become fixtures in `tests/fixtures/hands/` with a replay test, and any constant they change gets a DECISIONS line.
