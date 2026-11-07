# Handoff — David (between milestones): crosscheck CI job and .gitattributes

What landed: `crosscheck` job in `.github/workflows/ci.yml` (Python 3.12, separate from the 3.9 `physics-bridge` container); root `.gitattributes`; three `DECISIONS.md` lines (CI split, `.gitattributes` rules, D6-min seeds tuned against windowed junction-aware Θmax); answered request in `team/requests/done/to-david-from-vaibhav-ci-crosscheck.md`.
How to use: nothing to run. Once this is on main, PR #1's CI (which builds the merge with main) runs the cross-checks.
Who switches: Vaibhav — merge main into `lane/vaibhav` and delete `team/requests/to-david-from-vaibhav-ci-crosscheck.md` from PR #1 (the answered copy is in `done/`); otherwise both copies land.
Mock replaced: none
Contracts version after this handoff: unchanged (1)
Tests: `pnpm test` (all green); the new job skips on this branch because `tests/crosscheck/requirements.txt` is not on main yet.
New dependencies: none
Decisions logged: CI split; `.gitattributes`; D6-min seed tuning against Θmax.
Known gaps: the crosscheck job has not run for real yet; it first runs on PR #1 after this merges.
