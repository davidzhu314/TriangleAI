# Handoff — Gibran G5: Cathy as a hybrid (the LLM understands and phrases, the engine gives every fact)

What landed:
- **Engine (`client/src/score/`):**
  - `warn.ts`: `driveWarning` and `warningLine`, the wrong branch ahead within 20 mm;
  - `plan-marks.ts`: `planMarks` and `planMarkLine`;
  - `cathy-facts.ts`: `cathyFacts` and `caseNames`, the only thing the LLM sees;
  - `grounding.ts`: `groundingCheck`;
  - in `live.ts`, `driveCheckLine`, `planCheckLine` and `noAnswerLine`;
  - eight new `assist.*` templates.
- **Voice:** `client/src/input/voice/commands.ts` gains `assist_check`. New `cathy-llm.ts` has `understand`, `answer` and `resolveIntent`, with an injected transport, a 2 s timeout and the template fallback.
- **Docs:**
  - `metrics/gibran/cathy-g5.md`: the inventory;
  - `metrics/gibran/cathy-eval.md` and `tests/fixtures/cathy/`: the eval set and recorded responses.

How to use:
- The warning: `driveWarning(model, state, input.rotate)` then `warningLine(w, case).text`.
- "Is this right": `driveCheckLine(scoreInput, warning)` on Drive, or `planCheckLine(planMarks({...}), planAssist({...}), case, targetId)` on Plan.
- After approval: `answer(question, cathyFacts(state), templateLine, { transport })`.

Who switches:
- **Aroovee:** shows the warning, plan marks, captions and privacy line (`to-aroovee-from-gibran-cathy-ui.md`).
- **David:** deploys `/api/cathy` after approval (`to-david-from-gibran-cathy-server.md`).
- **Vaibhav:** adds rail state access, the index exports and the illustrative rows, and reviews (`to-vaibhav-from-gibran-cathy-g5.md`).

Mock replaced: none. The LLM is mocked by recorded responses until `to-all-from-gibran-cathy-llm.md` is approved.
Contracts version after this handoff: unchanged.
Tests: `pnpm test` (all green, 1290+); `pytest tests/crosscheck` (164 passed). They cover:
- the grounding check, with an adversarial table and every deterministic line on every case;
- understand and answer on every recorded failure path;
- the warning, on every bundled case, before each wrong branch and never on a clean drive, in under 0.2 ms;
- the `assist_check` corpus, with and without the wake word;
- plan marks;
- the eval set's integrity.

New dependencies: none in this PR. `@anthropic-ai/sdk` (server-only) is requested from David, pending approval.
Decisions logged: Cathy: hybrid rule; warning distance; LLM line length; LLM timeout; assist_check and its templates (all 2026-11-08).
Known gaps:
- **Nothing is wired into a screen**, since main is frozen and screens are Aroovee's.
- **The warning is rail-only:** physics has no rail state.
- **The live eval hasn't run.** It waits for approval and the deployed function.
- **The server code is unchecked:** it isn't type-checked, because the SDK isn't a dependency.
- **Latency:** the 2 s client timeout with `claude-opus-5-5` may often fall back to the template. The live eval will measure it.
