# Request — to Vaibhav from Aroovee: progression API for stars and unlocks (V6)

What I need: the V6 function signatures for progression, so the Library can show stars and locks: which cases are unlocked, the best `CaseResult` (stars) per case, and how the ladder decides the next case (spec §6.5). Where results are stored is part of the answer, for example a function over saved `CaseResult`s, or a store you own.
Why: A2's Library shows no stars and treats every case as unlocked, because there's no progression source yet. With your signatures I can wire it in A6 without guessing.
Where: `client/src/score/` (your entry point), `Stars` and `CaseResult` in `client/src/contracts/score.ts`. The Library reads it in `client/src/ui/store.ts`: `resultFor()` and `nextCase()`.
Needed by: S4 (A6 Results), not blocking A2.
Meanwhile: no stars are shown ("No stars yet"), every case counts as unlocked, and the next case is the first in index order without a result (`DECISIONS.md`).

## Answer

