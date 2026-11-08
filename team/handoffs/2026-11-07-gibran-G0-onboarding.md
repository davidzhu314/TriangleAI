# Handoff — Gibran G0: onboarding

What landed: `team/status/gibran.md` (new) and this handoff. No code, test or fixture changes.
How to use: nothing to import. Gibran's lane is live and runs G1 next, when his human says continue.
Who switches: nobody.
Mock replaced: none
Contracts version after this handoff: unchanged (1)
Tests: on a fresh `main` (6a85153), Apple M5, macOS 26.6.2, Node 22.23.4, pnpm 9.15.9, Python 3.12.10, all green:
- `pnpm test`: typecheck clean; 44 files and 758 tests passed. The 4 skipped tests are opt-in: `tools/generator/tune.test.ts` (2), `client/src/optimize/d6min-drivability.test.ts` (needs `D6_DIR`) and `client/src/wire/physics-live.test.ts` (needs a running physics process).
- `pytest tests/crosscheck`: 164 passed.
- `pnpm build`: built.
- `pnpm dev`: the Library loads 8 cases with no console errors. No physics process was running, so no phantom cards showed.
New dependencies: none
Decisions logged: none
Known gaps, which are G1 input and not bugs:
- **NumPy covers fixture-y only.** `tests/crosscheck/numpy-cases.json` and `CASES` in `dump_numpy.py` hold only `fixture-y`. `type-iii` and `low-tort` still need adding, as the crosscheck README asks.
- **Demo path covers one case.** `client/src/score/demo-path.test.ts` drives `fixture-y` and `type-iii` → `rcca` only, and only the best route at the safety weights. G1's rail acceptance covers every frontier route of `type-iii` and `low-tort`.
- **Timings are from another machine.** The committed engine timings come from other laptops. G1 timings on this M5 go in `metrics/gibran/`, not `metrics/vaibhav/`.
