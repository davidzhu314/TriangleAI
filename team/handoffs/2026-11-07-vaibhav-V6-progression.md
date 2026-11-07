# Handoff — Vaibhav V6: progression rules (+ V5 no-safe-route fix)

What landed:
- `client/src/score/progress.ts`, exported from `score/index.ts`: the §6.5 unlock ladder, adaptive difficulty and course grading. These are pure functions with no clock, randomness or storage, and they never mutate their inputs. The radiation budget stays V5's `applyFluoroBudget`. It costs stars, never progress.
- `LOW_TORTUOSITY_MAX` (0.3, illustrative) in `score/constants.ts`.
- **V5 fix** (its own commit): with no safe route, a feasible route that crosses a heavy zone is now capped at 40 instead of scoring 0. This is the new template `plan.heavy_crossing_no_alt`. An infeasible route still scores 0. No golden result changed.

The functions:

| Function | What it gives |
| --- | --- |
| `recordFromResult(seq, caseResult)` | A `ProgressRecord` after each Results screen |
| `ladderTier(case)` | 0–4, or null for cases outside the ladder (always open) |
| `unlockedTiers(cases, history, mode)` | Open tiers that have cases |
| `unlockedCaseIds(cases, history, mode)` | Open cases by (tier, id), with cases outside the ladder last |
| `isUnlocked(caseId, cases, history, mode)` | Whether that case can be played |
| `currentTier(cases, history, mode)` | Highest open tier with cases |
| `nextCase(cases, history, mode)` | The Library's "next case": the first open case not yet finished, or null |
| `bestStars(caseId, history)` | Best stars over attempts, 0 if none |
| `completedCaseIds(history)` | Cases reached at least once |
| `adaptiveSuggestion(cases, history, mode)` | `{ kind: 'next_tier', tier, caseIds }`, `{ kind: 'guided', caseId }` or null |
| `courseGrade(assignedIds, history)` | Completion and attempts per case, and the completed fraction |

How to use:
```ts
import { recordFromResult, nextCase, bestStars, ladderTier, adaptiveSuggestion, type ProgressRecord } from '../score';
const history: ProgressRecord[] = [...stored, recordFromResult(nextSeq++, result)];
nextCase(cases, history, 'open');               // cases: the LoadedCases, or { id, anatomy, planningOnly } summaries
adaptiveSuggestion(cases, history, 'open');     // show on the Results screen
```

Who switches:
- **Aroovee:**
  - **Recording progress:** after each Results screen, build a record with `recordFromResult(seq, result)`.
    - `seq` is a counter you keep next to the history, never a timestamp. A repeated seq throws.
    - Store the history in `localStorage`, and wrap every read and write in try/catch: storage can come back empty or throw.
  - **Demo build:** use mode `'open'`, so the Type III case is playable on a fresh browser.
  - **Library:** shows `nextCase`, `bestStars` and the case's `ladderTier`, and greys out what `isUnlocked` says is closed in `'ladder'` mode.
  - **Results screen:** shows `adaptiveSuggestion`.
- **David (D6-min):** the ladder reads only `case.json` `anatomy`, so set it on both generated cases:
  - **Low-tortuosity case:** `anatomy.arch_type: 'I'`, or `anatomy.tortuosity` ≤ 0.3 with no arch type.
  - **Type III case:** `anatomy.arch_type: 'III'`.
  - Without these, the ladder treats the cases as outside it, so they're always open but untiered.
  - **Tier 4 (whole-body planning)** needs a marker in the case format when D6 adds those cases. That's a contract request; until then no case maps to tier 4.

Mock replaced: none (progression had no mock).
Contracts version after this handoff: unchanged (1)
Tests: `pnpm test` gives 417 green.
- 25 progression tests in `progress.test.ts`:
  - **Tiers:** every anatomy maps to its tier, the precedence rules hold, and the tortuosity boundary sits at 0.3.
  - **Unlocking:** a fresh history; each tier opening the next; a failed attempt opening nothing; 1★ and over-budget finishes still unlocking; an empty middle tier being skipped; open mode.
  - **Library helpers:** `nextCase`, `bestStars` and `completedCaseIds`.
  - **Adaptive suggestions:** both rules, mixed results, a single record, 0★, other tiers ignored, nothing past the last tier, and ordering by seq.
  - **Course grading:** counts, and grades that ignore stars and fluoro.
  - **Determinism and validation:** 20 shuffles of cases and history give identical output, deep-frozen inputs aren't mutated, and a repeated seq or case id throws.
- 3 new no-safe-route tests: the three branches, and a fixture-y drive where the right branch has no safe route.

`python -m pytest tests/crosscheck -q` gives 164 green. The build is clean, with no mock markers.
New dependencies: none
Decisions logged: "Plan score with no safe route (amends 'Plan score as implemented')"; "Progression types live in score/"; "Ladder tiers from case.anatomy"; "Unlocking"; "Adaptive difficulty"; "Progress history and course grading".
Known gaps:
- **The player's tier is defined differently from your plan.** For adaptive difficulty, it's the tier of their most recent ladder record, not the highest unlocked tier. Finishing any case already opens the next tier, so "highest unlocked" would leave the 3★ rule with nothing to offer. This is logged in DECISIONS.md.
- **Guided mode** points at the lowest-id case on the lowest tier that has cases: tier 0, until D6-min adds a low-tortuosity case.
- **Tier 4 is never populated,** and "finishing tier 3 opens tier 4" can't be observed until a whole-body case exists.
- **The cases in these tests are made up,** with metadata only. When D6-min lands, add its two cases to a test.
