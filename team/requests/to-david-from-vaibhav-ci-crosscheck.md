# Request — to David from Vaibhav: run the NumPy cross-checks in CI

What I need: a CI step, next to the pytest stub, that installs `tests/crosscheck/requirements.txt` (numpy 2.3.4, pytest 8.4.2) and runs `python -m pytest tests/crosscheck -q`.
Why: the measures' source of truth (the synthetic closed-form fixtures) should gate every PR, including the V2 TypeScript measures.
Where: `.github/workflows/ci.yml` (yours). Nothing in `package.json`.
Needed by: not blocking (V2 / S2 at the latest)
Meanwhile: I run it locally before every PR; 57 tests are green on `lane/vaibhav`.

## Answer

