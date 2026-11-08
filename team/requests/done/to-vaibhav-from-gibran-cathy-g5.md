# Request — to Vaibhav from Gibran: G5 review, and three small things in files I don't own

What I need:
1. **Read access to the rail model and state, for the warning.** `driveWarning(model, state, rotateControl)` (`client/src/score/warn.ts`) needs the live `RailModel` and `RailState`, which are private in `RailWireSource` (`client/src/wire/rail-source.ts`). A read-only accessor such as `railSnapshot(): { model: RailModel; state: RailState } | null` would let the Drive screen call it each frame. Physics drives have no rail state, so the warning is rail-only for now.
2. **Re-export the G5 functions from `client/src/score/index.ts`,** so screens import from the entry point:
   - `driveWarning`, `warningLine`, `WARN_AHEAD_M`;
   - `planMarks`, `planMarkLine`;
   - `cathyFacts`, `groundingCheck`;
   - `driveCheckLine`, `planCheckLine`, `noAnswerLine`.
3. **Add Cathy's new illustrative constants to `ILLUSTRATIVE_CONSTANTS`** (`client/src/score/illustrative.ts`), with the DECISIONS.md lines I added:
   - `WARN_AHEAD_M` (20 mm), "Cathy: warning distance (illustrative)";
   - `CATHY_MAX_CHARS` (240), "Cathy: LLM line length (illustrative)";
   - `CATHY_TIMEOUT_MS` (2000), "Cathy: LLM timeout (illustrative)". This one lives in `client/src/input/voice/`, so it may belong with your input constants instead.
4. **Review the PR from `lane/gibran-cathy`.** It stays inside your written handover:
   - **In `client/src/score/`:**
     - in `live.ts`, `driveCheckLine`, `planCheckLine` and `noAnswerLine`;
     - in `templates.ts`, new `assist.*` templates only;
     - the two template-list tests, extended to scan `warn.ts` and `plan-marks.ts`;
     - new files: `warn.ts`, `plan-marks.ts`, `cathy-facts.ts`, `grounding.ts` and `cathy.testutil.ts`, plus their tests.
   - **In `client/src/input/voice/`:**
     - in `commands.ts`, the new action `assist_check`;
     - new files: `cathy-llm.ts`, plus its tests.
   - **Not touched:** `assist.ts`. `planMarks` reuses its prefix test and `steerableAt` instead.

Why: G5, Cathy as a hybrid: the LLM understands and phrases, and the engine gives every fact (`to-all-from-gibran-cathy-llm.md`).
Where: branch `lane/gibran-cathy`, cut from `origin/lane/vaibhav-input`, so it includes #22.
Two things to check in review:
- **When the warning stays quiet:** while the player is already rotating the right way. Without that, the autopilot's roll-in would trip it on every short edge: it starts rolling as it enters the edge, inside 20 mm. With it, the warning never fires on a clean autopilot drive of any steerable frontier route of any bundled case, and fires before every wrong branch taken from the plan in a push-only drive of every frontier route.
- **Grounding strictness:** a number said with a unit must match a value with that unit, and ratio words ("twice", "half") never pass. I chose strict because a false rejection only costs the template line.

Needed by: not the demo. It merges after the freeze.
Meanwhile: `pnpm test` (1290+ tests) and the crosscheck are green on the branch.

## Answer

Vaibhav: Reviewed and approved: G5 stays inside the handover, has no key and no network of its own (the LLM layer only speaks through an injected transport, and nothing passes one), and driveWarning reuses chooseBranch/steerRoll, so a warning is exactly what the rail wire would do; the quiet-while-rotating-right rule and strict grounding are the right calls. Done: 1. `railSnapshot()` on RailWireSource and `wireRailSnapshot(source)` (read-only; the state is replaced each tick, never mutated; null for physics/chain), tested with driveWarning on a live drive; 2. the G5 functions are re-exported from client/src/score/index.ts; 3. WARN_AHEAD_M and CATHY_MAX_CHARS are in ILLUSTRATIVE_CONSTANTS; CATHY_TIMEOUT_MS stays in client/src/input (the engine never imports input).
