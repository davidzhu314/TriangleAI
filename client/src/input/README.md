# client/src/input: hands-free and voice input (owner: Vaibhav, pending the CLAUDE.md row)

Optional controls for Catherine:
- MediaPipe hand gestures;
- push-to-talk voice commands;
- the engine's assistant answers, which voice asks for.

Everything here is pure logic plus two thin wrappers. Nothing in the app imports it yet, and nothing here opens the camera or microphone on its own. Every action keeps its keyboard path (spec §7.3), and these are described as hands-free and voice controls, never as real catheter handling (spec §9.4).

Status: draft, waiting on `team/requests/to-all-from-vaibhav-hands-voice-assist.md`. `@mediapipe/tasks-vision` isn't installed yet; this folder declares the landmark types itself and never imports MediaPipe.

## Gestures (`hands/`)

| Gesture | Effect |
| --- | --- |
| **Gun pose:** ring and pinky curled, thumb up, index and middle together | Engages push and rotate |
| Index and middle straight | Push (proportional) |
| Index and middle half-curled | Hold |
| Index and middle curled | Pull |
| Twist the hand (clockwise, as you see it, is positive) | Rotate; ±10° dead zone, full rate at ±45° |
| **Point pose:** index out; middle, ring and pinky curled | Moves the pointer |
| Pinch (thumb to index tip) while pointing | Selects the hovered branch, once per pinch |

A pose starts only when its strict **start** checks pass for 150 ms. Once engaged it is kept by looser **keep** checks, and a wobble must last 150 ms before the pose drops, so twisting and aiming around don't release it. Losing the hand, a low tracking score, or dropping the thumb releases control on that same frame. Each pose is a named list of checks (`gunChecks`, `pointChecks` in `hands/pose.ts`, each with its value, limit and OK); show them in a debug view to see why a pose isn't registering. All thresholds are in `hands/constants.ts` and are illustrative.

### Hookup (Aroovee)

```ts
import { createGestureMachine, mergeControl } from '../input';

const hands = createGestureMachine({ dominant: 'Right', mirrored: true }); // raw front-camera frames; labels kept as MediaPipe reports them
// for each HandLandmarker result (VIDEO mode), with the video frame's timestamp:
const g = hands.step({ tMs: video.currentTime * 1000, hands: toHandObservations(result) });
```

- **`toHandObservations`** maps MediaPipe's `landmarks[i]`, `worldLandmarks[i]` and `handedness[i][0]` (`categoryName`, `score`) to `HandObservation`.
- **Drive screen:** `wire.control(mergeControl(g, keyboardInput))`. Push and rotate come from the hand, but any keyboard axis you press wins, and fluoro and contrast stay on Space and C.
- **Plan screen:** when `g.pointer` isn't null, it's a 0..1 screen position in the user's view (already un-mirrored). Hover with `PlanView.pickAt(x, y)`. When `g.select` is true (one frame per pinch), add the hovered branch.
- **Self-view:** draw the selfie video mirrored, so the pointer and the picture agree.

## Voice (`voice/`)

The app listens only while the talk control is held. Saying the wake word "Hey Cathy" first is optional.

| Action | Phrasings (see `voice/commands.ts`) | What the app does |
| --- | --- | --- |
| `zoom_in` | "zoom in", "closer", … | Zoom the Plan/Drive view in |
| `zoom_out` | "zoom out", "wider", … | Zoom out |
| `assist_best_next` | "best next artery", "where next", … | Plan: `planAssistLine(planAssist(…), case, target, 'best')`; highlight `best.edge`. Drive: `driveAssist(…).lines[0]` |
| `assist_options` | "what are my options", … | Plan: `planAssistLine(…, 'options')`; highlight every `options[i].edge` and make them pinchable |
| `assist_review` | "how am I doing", "any mistakes", … | Drive: `driveAssist(input).lines` (the drive so far) |

```ts
import { createBrowserRecognizer, createPushToTalk } from '../input';

const ptt = createPushToTalk(createBrowserRecognizer(), (m) => {
  showCaption(m.action ? `Heard: “${m.heard}” → ${label(m.action)}` : `Heard: “${m.heard}”`);
  if (m.action) run(m.action);
});
// hold a key (or a gesture) to talk:
onKeyDown('KeyV', () => ptt.press());
onKeyUp('KeyV', () => ptt.release());
```

**Privacy:** in Chrome, speech recognition sends audio to Google's servers while a push-to-talk session is open, so voice needs internet. Say so where the user turns voice on. `createBrowserRecognizer()` reports `isSupported: false` (and does nothing) where the API is missing, and never throws.

The assistant answers (`planAssist`, `planAssistLine`, `driveAssist`) come from the engine (`client/src/optimize/assist.ts`, `client/src/score/live.ts`). No AI model computes any number. Each hint can be counted in `ProgressRecord.hintsUsed`; whether a hint marks the attempt "assisted" is a team decision still open.
