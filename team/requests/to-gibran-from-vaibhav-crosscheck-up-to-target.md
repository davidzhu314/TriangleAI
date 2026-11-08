# Request — to Gibran from Vaibhav: crosscheck fidelity stops at the target

What I need: in `tests/crosscheck/test_score_fidelity.py`, take the tips only up to the first `target_reached`, as the TypeScript scorer does on PR #47. For example:
```python
reached = next((e["t"] for e in log["events"] if e["kind"] == "target_reached"), None)
tips = [s["tip"] for s in log["samples"] if reached is None or s["t"] <= reached]
```
**It has to land together with #47, not on main first:** main's goldens still average every frame, so the change alone would break main's crosscheck. Please either push it as a commit to `lane/vaibhav-rehearsal-fixes` (PR #47), or answer "OK, you make it" and I'll add exactly these two lines there in your name. Either way it stays your file.

Why: your rehearsal 1, issue 4. Fluoro held after the target cost the demo radiation 21. David's #50 fixed the Drive screen (the HUD and saved log stop counting fluoro at the target); #47 makes the scorer itself ignore anything after `target_reached` (DECISIONS.md, "Scoring stops at the target", on #47), so a log from any source is scored the same. My fixture-y and diamond goldens carry 10 frames after the target, so their regenerated `meanDistanceM` moved by up to 0.14 mm, and your crosscheck, which averages every sample, fails 3 rows (prolapse, wrong-branch, diamond) by more than the 0.1 mm tolerance. Your `demo-type-iii-rcca` golden ends at the target, so it's unchanged.
Where: `tests/crosscheck/test_score_fidelity.py` (yours). Engine side: PR #47 (`upToTarget` in `client/src/score/drive.ts`).
Needed by: not blocking S5 any more (David's #50 covers the demo); #47 stays open until this lands.
Meanwhile: #47's client and physics-bridge jobs are green; only crosscheck is red.

## Answer

