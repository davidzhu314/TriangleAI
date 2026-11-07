# Handoff — Vaibhav: assistant answers (usable now), hand gestures and push-to-talk voice (draft)

Request filed: `team/requests/to-all-from-vaibhav-hands-voice-assist.md`. David and Aroovee, please answer it. It covers the CLAUDE.md row, the MediaPipe dependency and model, the "Catherine" naming, the UI hookup and the open "assisted" question.

## Done, on `lane/vaibhav` (PR "Assistant answers from the engine")
- **`planAssist({ optimized, weights, entryId, presetId, routeSoFar })`** (`client/src/optimize/assist.ts`, exported from `optimize/index.ts`). It gives the next-branch options for the route built so far: `{ edge, node to pinch, routeIds, bestRank, labels, source }`, best first.
  - **Ranking:** routes continuing the prefix (same entry and preset) are ranked with V3's `rankRoutes` over `measureRanges(candidates)`, the same choice as the gentleness reference.
  - **Fallback:** safe candidates when no frontier route continues (`off_frontier`).
  - **Reasons when empty:** `complete`, `no_safe_route` or `no_continuation`.
- **`driveAssist(scoreInput)`** (`client/src/score/live.ts`). On the drive so far it gives:
  - `nextEdge`, the planned edge after the tip's current one;
  - `offPlan: { edge, backToEdge }` on a wrong branch;
  - at most 3 lines: a next-branch or pull-back line, then V5's own feedback (from `scoreCase` on the partial log), with "not reached" dropped.
- **`planAssistLine(assist, case, target, 'best' | 'options')`** is the spoken answer for the voice commands.
- **New `assist.*` templates,** under the same guard tests (placeholders, no digits, never-say list, every number in `values`).
- **`ProgressRecord.hintsUsed?`:** counted only; progression ignores it until the team decides on "assisted".
- No AI model computes anything. Nothing in the app calls these yet, and the production bundle has none of this code.

## Draft, on `lane/vaibhav-input` (draft PR; don't merge until the request is answered)
- **`client/src/input/hands/`:** gesture logic over MediaPipe's landmark shape. It never imports MediaPipe.
  - **Poses:** the gun pose (push and pull from the index and middle curl, rotate from the twist) and the point pose (pointer, with pinch-select).
  - **Stability:** One-Euro smoothing and a 150 ms debounce. Control is released on the same frame when tracking is lost, the score is low, or the thumb drops.
  - **Mirroring:** handled in one function.
  - **`mergeControl`** feeds the existing `ControlInput`; any keyboard axis wins, and fluoro and contrast stay on Space and C.
  - **Tests:** all on a synthetic hand builder, including a gesture-driven rail drive of fixture-y that reaches the target with no wrong branch.
- **`client/src/input/voice/`:**
  - command phrasings;
  - a matcher (optional "Hey Catherine", word edit distance, alternatives in order);
  - a push-to-talk state machine;
  - a Web Speech wrapper that never throws and that nothing calls.
- **`client/src/input/README.md`** is the hookup guide.
- **A purity test** checks no clock, network, MediaPipe or three.js import, and that nothing outside the folder imports it.

## Constants and tuning
- **Constants:** every threshold is in `client/src/input/hands/constants.ts`, illustrative, and listed in DECISIONS.md under "Hand gesture constants":
  - gun pose: ring and pinky > 0.6, thumb > 0.5 palm, index and middle within 15°;
  - curl: push < 0.30, hold to 0.55, pull above;
  - twist: ±10° dead zone, full at ±45°, neutral over 300 ms;
  - pinch: enters at 0.25, exits at 0.35, freezes the pointer 100 ms back;
  - debounce 150 ms, minimum score 0.6.
- **Tuning so far:** on synthetic hands only. Real-hand tuning happens in the local webcam lab (`scratch/hand-lab/`, git-excluded, never committed). Any change and any recorded fixtures go to `lane/vaibhav-input`, with a DECISIONS line each.

## Who does what next
- **David:**
  - the CLAUDE.md ownership row for `client/src/input/` and `tests/fixtures/hands/`;
  - later, the pinned `@mediapipe/tasks-vision` dependency (npm latest is 1.2.2), the bundled `hand_landmarker.task` under `client/public/models/`, and a `THIRD_PARTY.md` entry (Apache-2.0);
  - the "Catherine" line in DECISIONS.md.
- **Aroovee:**
  - the camera toggle, permission prompt and self-view;
  - the voice caption ("Heard: … → Zoom in");
  - `PlanView.pickAt(x, y)` for the pointer and pinch-select;
  - zoom actions;
  - highlighting the edges the assistant names;
  - renaming the product to Catherine.

  All the details are in `client/src/input/README.md`.
- **Team:** whether a hint marks the attempt "assisted" or costs anything.

Mock replaced: none
Contracts version after this handoff: unchanged (1)
Tests:
- **`lane/vaibhav`:** `pnpm test` gives 578 green and 6 skipped (type-iii and D6 checks waiting on #13).
- **`lane/vaibhav-input`:** 619 green and 6 skipped, twice in a row.
- **Both branches:** `python -m pytest tests/crosscheck -q` gives 164 green, the build is clean, the mock build-guard test passes, and neither the input nor the assist code is in the production bundle.

New dependencies: none
Decisions logged: "Assistant answers as implemented"; "Hand gesture constants" (on the input branch).
Waiting on: answers to the to-all request; the MediaPipe dependency and model; three.js and the 3D scene for `pickAt` in 3D; D6-min (#13) for the type-iii assist test.
