# Handoff — Aroovee A2: app shell, Library and Case brief

What landed:
- **Shell** (`client/src/main.ts`, `client/src/ui/shell.ts`, `ui.css`, `router.ts`):
  - Framed sheet per `DESIGN.md`. `main.ts` imports `tokens.css`, then `theme.css`, then `ui.css`.
  - Hash routes `#/library`, `#/case/<key>` and `#/case/<key>/plan`; anything else goes to the Library.
  - At 640 px and below the frame disappears: a top bar with Menu, the title and one outlined action, and a full-screen menu sheet.
  - The "Mock data" badge shows in the top bar when `engineMode === 'mock'`.
- **Library** (`ui/library.ts`): cases come from D2's `listBundledCases()` and `loadCase()`.
  - The next case leads at full width: title, difficulty, the Physics or Planning-only badge, stars.
  - Other cases follow as peer rows. The empty state uses `no-cases.svg` with its heading and action.
  - A phantom slot sits behind `ui/physics-probe.ts`, which fails closed.
- **Import** (`ui/import-panel.ts`, `ui/validation-list.ts`): one drop zone plus a real file input.
  - Results show in §3.5 order. Errors show their JSON-pointer path; warnings offer their fix and load again with it; privacy notices go in a details view.
  - Unreachable targets are greyed and marked "Unreachable".
- **Case brief** (`ui/brief.ts`): from `LoadedCase` only, with a grey dash for any missing optional field.
  - Fields: scenario, targets, entry sites, arch type, fluoro budget (s).
  - It lists the checks on the case with their fixes. "Start planning" is the one primary.
  - `ui/plan/index.ts` shows the case name and nothing invented until A3.
- **Store** (`ui/store.ts`): the catalogue, and accepted fixes saved in `localStorage`. Bundled cases save by id; imported ones by id plus the file's SHA-256 (see `DECISIONS.md`).
- **E2E test**: `tests/e2e/a2-library-brief.spec.ts`.
- **Screenshots**: `metrics/aroovee/A2/` (Library and brief at 1440 light and 390 dark).

How to use: `pnpm dev`, then open `/#/library`. With `VITE_ENGINE=mock` the top bar shows "Mock data". Screens import the engine only from `client/src/optimize` and `client/src/score`, cases only from `client/src/case`, and the wire only through `select.ts` (nothing in A2 uses the wire).

Who switches:
- Vaibhav — answer `team/requests/to-vaibhav-from-aroovee-progression-api.md` (V6 signatures for stars and unlocks).
- David — answer `team/requests/to-david-from-aroovee-physics-index.md` (physics case list URL and shape). When D6-min merges, its cases appear in the Library with no UI change, as long as `cases/index.json` lists them.

Mock replaced: the D0a placeholder entry in `client/src/main.ts`. A2 uses D2's real loader, not `optimize/mock-case.ts`.
Contracts version after this handoff: unchanged (1)

Tests:
- `pnpm test`: 329 green, including `optimize/mock-guard.test.ts`. `pnpm build` is green, and the real build has no "Mock data" string.
- `pnpm exec playwright test`: 11 green, with the D0a smoke test unchanged. The new test covers:
  - the Library showing fixture-y, and the brief's fields and route to Plan;
  - dropping all eight broken packages, each with its README message;
  - accepting the units fix clearing the warning.
- Taste v2.1.5 `lint.mjs client/src`: 0 FAIL, 1 WARN (`default-font`: Inter is the measured face chosen in A0).
- `inspect.mjs --app` on a `VITE_ENGINE=mock` production build, Library and Case brief at 1440, 768 and 390: **0 FAIL in light and in dark**.
- Token check: no raw hex, lengths, radii or shadows in `client/src/ui` or `main.ts`; the 640 px breakpoint is the only raw width.

New dependencies: none.

Decisions logged:
- Library before V6: no stars, and every case unlocked.
- Fixes saved per case and per file.
- Phantom cards behind a probe that fails closed.

Known gaps:
- **How the inspector was run:** it launches its own browser, which can't pick a colour scheme and follows the OS. Light and dark were each inspected on a scratch copy of the same build, with the dark media query forced off or on. Its Edge launch also exits early on this machine, so it ran on Playwright's Chromium through `CHROME_PATH`.
- **Inspector warnings kept:**
  - Library `hero-void` at 1440: empty space beside a single case. It fills when D6-min adds cases.
  - Brief `hero-void` and `panel-void` at 1440: the sheet fills the screen by design, and fixture-y has few facts.
- **Imported cases** last for the session only; the zip is never stored.
- **Physics-offline art:** `physics-offline.svg` isn't used yet. Nothing in A2 needs it, since no physics case is known. It belongs with the Drive fallback notice (A5).
- **Tablet:** at 768 the sidebar still shows. `DESIGN.md` folds it only at 640 and below.
