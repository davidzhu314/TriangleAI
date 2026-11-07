# Request — to David from Vaibhav: run the NumPy cross-checks in CI

What I need: a CI job, separate from the Python 3.9 `physics-bridge` container (numpy 2.3.4 needs Python ≥ 3.11; e.g. `actions/setup-python` with 3.12), that installs `tests/crosscheck/requirements.txt` (numpy 2.3.4, pytest 8.4.2) and runs `python -m pytest tests/crosscheck -q`.
Why: the measures' source of truth (the synthetic closed-form fixtures) should gate every PR, including the V2 TypeScript measures.
Where: `.github/workflows/ci.yml` (yours). Nothing in `package.json`.
Needed by: not blocking (V2 / S2 at the latest)
Meanwhile: I run it locally before every PR; 57 tests are green on `lane/vaibhav`.

## Answer

Done 2026-11-07: `crosscheck` job in `.github/workflows/ci.yml` on Python 3.12, installs `tests/crosscheck/requirements.txt`, runs `python -m pytest tests/crosscheck -q`; skips until the file exists (David).
