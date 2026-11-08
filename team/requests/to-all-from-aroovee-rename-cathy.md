# Request — to all from Aroovee: the product is now called Cathy (was ThreadSim)

What I need: each of you renames "ThreadSim" to "Cathy" in the files you own that a person reads. Internal identifiers stay as they are (list below). Answer with one line when done, or if you disagree.

Why: the team wants one name for the trainer and its voice ("Hey Cathy"). Decision recorded in `DECISIONS.md` (2026-11-08).

**Done (Aroovee, on `integration/hands-voice`):**
- **What a trainee sees:** the browser tab (`client/index.html`), the logo text in the sidebar and phone menu, and page titles ("Plan · Cathy") in `client/src/ui/shell.ts`.
- **My docs and files:** the palette page, `DESIGN.md`, `team/DEMO.md`, my file headers.
- **Tests:** the smoke test's title check and the test harness title.

**Keep as they are (renaming would break saved data, packages or tests; a contract change if anything):**
- storage keys (`threadsim.plans.v1`, `threadsim.drives.v1`, `threadsim.progress.v1`, …);
- the case package format id `threadsim.case/1` and `schema` fields;
- event names (`threadsim:theme`, `threadsim:settings`);
- test hooks (`window.__threadsimHands`);
- file names like `docs/ThreadSim_Build_Specification.md`;
- generator tags inside committed binaries.

**Yours to rename, where a person reads it:**
- **David:**
  - `README.md` (structure is yours), `CLAUDE.md`, `PLAN.md`, `team/lanes/*.md`, `THIRD_PARTY.md`.
  - The attribution and licence notes (`client/public/anatomy/ATTRIBUTION.md`, `assets/vascular/*.md`, `physics/cases/*/LICENSE.md`).
  - `slicer/README.md`.
  - **The one that shows on screen:** the CT cases' `source.dataset` text (`client/public/cases/ts-s*/case.json`, from `slicer/export_case.py`) ends "…by ThreadSim slicer/export_case.py". The Case brief shows it under "Dataset details".
  - The generators' visible strings, if you like (`tools/generator`, `tools/fixture-y`).
  - The Cathy server draft's system prompt ("the voice assistant in ThreadSim") should become "the voice assistant in Cathy, a training simulator…".
- **Vaibhav:** comments in `client/src/wire/mock-source.ts` and the voice help text, if any say ThreadSim.
- **Gibran:** `tests/engine/vascular-assets.test.ts` (if it checks a string) and `team/rehearsal/`.
- **The spec** (`docs/`, shared, append-only): a dated line at the top saying the product is now called Cathy, rather than editing the text.

Timing: whenever suits.

## Answer

David: <one line>
Vaibhav: <one line>
Gibran: <one line>
