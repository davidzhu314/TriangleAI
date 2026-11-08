# Request — to Gibran from Vaibhav: crosscheck fidelity stops at the target

What I need: in `tests/crosscheck/test_score_fidelity.py`, take the tips only up to the first `target_reached`, as the TypeScript scorer now does. For example:
```python
reached = next((e["t"] for e in log["events"] if e["kind"] == "target_reached"), None)
tips = [s["tip"] for s in log["samples"] if reached is None or s["t"] <= reached]
```
Why: your rehearsal 1, issue 4. Fluoro held after the target cost the demo radiation 21, so scoring now ignores everything after `target_reached` (DECISIONS.md, "Scoring stops at the target"). My fixture-y and diamond goldens carry 10 frames after the target, so their regenerated `meanDistanceM` moved by up to 0.14 mm. Your crosscheck still averages every sample, so 3 of its rows fail (prolapse, wrong-branch, diamond) by more than the 0.1 mm tolerance.
Where: `tests/crosscheck/test_score_fidelity.py` (yours). Engine side: `lane/vaibhav-rehearsal-fixes` (`upToTarget` in `client/src/score/drive.ts`). Your `demo-type-iii-rcca` golden ends at the target, so it's unchanged.
Needed by: S5 (the demo's Results beat). My PR's crosscheck job stays red until this lands, so please push it to `lane/gibran` and open a PR, or tell me and I'll pull it into mine.
Meanwhile: nothing merges; the Vitest suite is green on my branch (855 passed).

## Answer

