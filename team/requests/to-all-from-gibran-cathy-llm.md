# Request — to all from Gibran: Cathy as a hybrid (an LLM for understanding and phrasing, the engine for every fact)

What I need: approval of four things before Cathy's LLM layer (G5) calls a real model. CLAUDE.md rule 7 applies: this changes demo scope, adds a dependency and adds an outside service.
1. **A server function, owned by David.** It runs as a Vercel function at `POST /api/cathy` and holds `ANTHROPIC_API_KEY` as a Vercel environment variable. The key is never in the repo and never in the browser bundle. The code is attached to `to-david-from-gibran-cathy-server.md`.
2. **`@anthropic-ai/sdk` as a server-only dependency, which David adds.** Nothing under `client/` imports it.
3. **A privacy line in the UI, shown where voice is turned on.** Proposed wording: "While voice is on, your microphone audio goes to Google for speech recognition, and what you ask Cathy goes to Anthropic for her answers." Aroovee owns the wording, and `to-aroovee-from-gibran-cathy-ui.md` has the details.
4. **The template answers stay the fallback, so the demo never depends on the network.** Every Cathy action works with the LLM off. With it on, a reply is used only if it passes the grounding check within about 2 s. Otherwise Cathy says the template line.

Why: the template answers only work for phrasings we listed in advance. An LLM lets "is the tip heading the right way" or "why is radial first" get a useful answer, while keeping the rule in CLAUDE.md "Never" and spec §11 that no AI computes or decides a route, measure, score, warning, star or number.
- **The LLM only maps speech to a known action, or phrases an answer from the facts the engine gives it.** Those facts are `cathyFacts`, one JSON object with display names and units.
- **The grounding check runs before anything the LLM wrote is shown or spoken** (spec §6.4). Every number must be one of those facts, at the same rounding and in the same unit. Every vessel, wire, entry or target named must be in the case's name set. Nothing on the never-say list is allowed, and the reply has a length cap.

Where (branch `lane/gibran-cathy`, PR for Vaibhav's review):
- **Engine facts (`client/src/score/`):**
  - `warn.ts`: the wrong-branch warning;
  - `plan-marks.ts`: plan marks;
  - `cathy-facts.ts`: the facts object;
  - `grounding.ts`: the grounding check;
  - new `assist.*` templates;
  - in `live.ts`, `driveCheckLine` and `planCheckLine` for the new `assist_check` action.
- **Client LLM layer:** `client/src/input/voice/cathy-llm.ts`, which talks only through an injected transport.

No screen, contract or `package.json` change. Until this is approved, everything is tested against recorded responses, and nothing calls the real API.
Needed by: not the demo. The demo stays on the template answers whatever we decide. I'd like an answer in time to run the eval (`metrics/gibran/cathy-eval.md`) against the real model before anyone wires the LLM into a screen.
Meanwhile: everything is built and tested with the LLM mocked: `pnpm test` and the crosscheck are green. `assist_check` and the warning work deterministically. They're usable once Aroovee hooks them up, with or without the LLM.

## Answer

David: <one line>
Aroovee: <one line>
Vaibhav: <one line>
