# Handoff — Gibran G4 (part 1): Cathy answer grounding

What landed:
- **`tests/engine/cathy-grounding.test.ts`** covers every bundled case (all 8) and every target, at DEFAULT_WEIGHTS.
  - **Plan answers** (`planAssist` + `planAssistLine`, "best" and "options") are checked for every entry × wire × prefix of every frontier route and safe candidate:
    - numbers are grounded, and `n` equals the option count;
    - the arteries named are option-edge vessels, and option edges lie on frontier routes (or safe candidates, when off the frontier);
    - "best" follows the top-ranked route (`bestFrontierRoute`);
    - no-safe-route says so with no numbers;
    - answers are deterministic.
  - **Live answers** (`driveAssist`) are checked on rail drives of every frontier route, cut at a quarter, half, three quarters and the end:
    - numbers are grounded;
    - non-assist lines equal scoreCase's lines;
    - "next" names the plan's next vessel.
  - **Push-only drives that take a wrong branch** must get a grounded "pull back" naming the wrong and the expected vessels.
  - **Size:** 1402 lines, 54 drives, 40 wrong-branch checks, all passing.
- **`tests/engine/cathy-hints.test.ts`:** hints never change progression (`nextCase`, unlocks, tier, suggestion, best stars, course grade are all the same with `hintsUsed` set), and scoring takes no hint input. It has two `it.todo`s for the app counting hints and the Results "assisted" mark (Aroovee, after the demo).
- **`metrics/gibran/cathy-qa.md`:** the summary. Its findings section lists one route Cathy recommends that the rail wire can't steer.

How to use: `pnpm exec vitest run tests/engine/cathy-grounding.test.ts tests/engine/cathy-hints.test.ts`. `UPDATE_METRICS=1` rewrites `metrics/gibran/cathy-qa.md`.
Who switches:
- **Vaibhav:** decide whether "best" may name an unsteerable route (`to-vaibhav-from-gibran-cathy-unsteerable-best.md`: ts-s1404-cta → lcca). Also add the G4 section to `team/lanes/gibran.md`, if you drafted it for my lane.

Mock replaced: none
Contracts version after this handoff: unchanged (1)
Tests: `pnpm test` is green, including both new files.
New dependencies: none
Decisions logged: none
Known gaps:
- **After PR #22 merges** (after the demo): the voice command corpus (40+ rows, 10+ must-not-trigger), push-to-talk timing, the hand clips (G3) and the Cathy rehearsal beat.
- **Hint counting and the "assisted" mark:** they don't exist in the app yet, so they're `it.todo` for now.
