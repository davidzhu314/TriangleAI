# Request — to Aroovee from Gibran: show Cathy's warning and plan marks, caption her lines, and the privacy line

What I need, on Plan and Drive (your screens; I edit none of them):
1. **Drive: the wrong-branch warning.** Each frame, call `driveWarning(model, state, input.rotate)` from `client/src/score/warn.ts`.
   - **When it returns a warning:** highlight `wouldEnter`, the branch the tip will take, and `plannedEdge`, the one it should take. Show `warningLine(w, case).text` as a caption, for example "Careful: the tip will go into the Aorta, not the Brachiocephalic trunk. Rotate right."
   - **What's in it:** `rotate` is `'left'` (A) or `'right'` (D), or null when no roll enters the planned branch, and `distanceM` is the distance to the branch point.
   - **When it fires:** only while the tip is on the plan, within 20 mm of the branch point, and the player isn't already rotating the right way. Off the plan, `driveAssist` gives "pull back" as before.
   - **What you need from Vaibhav:** read access to the rail model and state, `to-vaibhav-from-gibran-cathy-g5.md` item 1.
2. **Plan: highlight the plan marks.** `planMarks({ routeSoFar, measures, optimized, entryId, presetId, graph })` from `client/src/score/plan-marks.ts` returns the route's problem edges. Each has a `why`:
   - `'cannot_steer'`: the wire can't steer into it;
   - `'off_frontier'`: the route leaves the best routes there;
   - `'heavy_zone'`: it crosses a heavy or forbidden zone, with the `zone` named.

   `planMarkLine(mark, case)` gives each one's line. Please don't rely on colour alone.
3. **The new voice action `assist_check`** ("am I on the right path", "is this right", "am I lost"):
   - on Drive, say `driveCheckLine(scoreInput, warning)`;
   - on Plan, say `planCheckLine(marks, planAssist(...), case, targetId)`.

   Both are deterministic and need no LLM.
4. **Caption every Cathy line.** Whatever Cathy says, as text on screen, for accessibility and for a noisy venue, including when she falls back to a template.
5. **The privacy line where voice is turned on,** pending the to-all request. Proposed wording: "While voice is on, your microphone audio goes to Google for speech recognition, and what you ask Cathy goes to Anthropic for her answers." The wording is yours. The second half applies only once the LLM is approved and switched on. Until then the existing Google-only notice stands.
6. **Later, only after the to-all approval: the LLM.**
   - **Mapping speech:** when the matcher returns no action, `resolveIntent(match, { transport })` asks the LLM which known action it was.
   - **Phrasing answers:** `answer(question, cathyFacts(state), templateLine, { transport })` returns grounded text or the template line, never blocking more than about 2 s.
   - **The transport:** a `fetch('/api/cathy')` call. The code is in `to-david-from-gibran-cathy-server.md`.
   - **The default:** pass `transport: null` until it's approved.

Why: G5 (`team/lanes/gibran.md`) gives Cathy a warning before a wrong branch and an "is this right" answer, computed by the engine. The LLM layer is optional on top, and grounded.
Where: `client/src/score/warn.ts`, `plan-marks.ts`, `cathy-facts.ts`, `grounding.ts` and `live.ts` (`driveCheckLine`, `planCheckLine`, `noAnswerLine`), and `client/src/input/voice/cathy-llm.ts`. These aren't re-exported from `client/src/score/index.ts` yet (that's Vaibhav's), so import them from the files for now.
Needed by: not the demo, since main is frozen. The work would land with the hands-and-voice hookup after it.
Meanwhile: nothing changes on screen. The functions are tested on every bundled case (`pnpm test`).

## Answer

Aroovee: <one line>
