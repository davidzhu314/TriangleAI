# Decisions

One line per decision: date · who · decision · why. Append only. A decision that changes a contract, a license boundary or demo scope is made by a request to all three lanes, never by one Claude Code alone.

## Decided at kickoff (2026-11-07, all three, from the plan review)

- 2026-11-07 · all · **Precedence.** The spec (`docs/ThreadSim_Build_Specification.md`) wins on product behaviour; `PLAN.md` wins on sequencing and ownership; `CLAUDE.md` wins on session rules. Deviations from the spec are logged here.
- 2026-11-07 · all · **Spec file.** One name everywhere: `docs/ThreadSim_Build_Specification.md` (Markdown copy, read by Claude Code) and `docs/ThreadSim_Build_Specification.docx` (original).
- 2026-11-07 · all · **No CathSim code or meshes in `client/` or `client/public/`.** Why: CC BY-NC-SA share-alike would reach the client build, and spec §9.1 keeps CathSim in its own directory and process so a later commercial switch is a dependency change. Deviation: spec §3.3 lists the phantoms as built-in cases.
- 2026-11-07 · all · **Phantom meshes are served at runtime if D1 passes.** The physics process serves each phantom case package (mesh, centerlines, case.json) from `physics/cases/` over HTTP on localhost, with its license notice. Physics and replay modes both need the physics process running, even when the sim is not stepping. Phantom cards appear in the Library only while the physics process answers.
- 2026-11-07 · all · **If D1 fails, physics leaves the demo.** The demo runs rail only and says so honestly; replay of phantom runs is out too, since it needs the same mesh path.
- 2026-11-07 · all · **Recorded runs are real or absent.** With no real CathSim runs (D1 failed, or D4 never landed), drop the §4.4 arch-only hard constraint and the two simulated measures in §4.6 (peak wall force, success rate) from the optimizer and UI. Vaibhav's recorded-runs mock is a test fixture only and never feeds the app.
- 2026-11-07 · all · **D6-min comes before the full generator.** Two seeded generated cases: a Type III arch (the §7.4 demo case) and a low-tortuosity arch (the §6.5 ladder start and §7.3 tutorial, replacing the `low_tort` phantom in the client). Required for S2.
- 2026-11-07 · all · **Definition of done, first item, changed from the spec.** Five or more cases load: `fixture-y`, generated arches covering the unlock ladder, and a licensed CTA planning case if one is ready. Physics phantoms count only while served by the physics process.
- 2026-11-07 · all · **Byte-identical generated packages stay** (spec Phase 6). One writer, owned by us: sorted JSON keys, fixed float formatting, our own GLB writer (or a wrapper we own) in a single language, zip entries in fixed order with fixed metadata, single-threaded numerics. A semantic test (topology, points within 1e-6, metadata) runs beside the byte test so failures are diagnosable. Revisit here only if the byte test still fails after all of that.
- 2026-11-07 · all · **Source of truth for measures** is the closed-form answer on the synthetic fixtures. NumPy and TypeScript are both tested against it, then cross-checked against each other on real anatomy within 0.1 mm and 0.5°.
- 2026-11-07 · all · **Demo script** is spec §7.4, copied into `team/DEMO.md` with one fallback line per beat.
- 2026-11-07 · all · **D1 is timeboxed to 90 minutes** of install and measurement. A failed install inside the timebox is a failed gate. D1's output is one line here: "Demo leads with physics" or "Demo leads with rail".
- 2026-11-07 · all · **Honesty line** ("Decision trainer with simplified device mechanics. Not a clinical device; no claim of patient benefit.") appears in the README and on Library, Case brief and Results, not on the Drive HUD.
- 2026-11-07 · all · **AR is stretch.** A7 never blocks A8. If A7 is cut, write it here: hiding Enter AR covers browsers without `immersive-ar`, not a Quest 3, so the AR done item is then unmet.
- 2026-11-07 · all · **Folder rename.** The Plan screen lives in `client/src/ui/plan/` (spec §2 says `src/plan/`). UI only; optimizer code never goes there.
- 2026-11-07 · all · **Release manager is David**: runtime dependencies, `package.json`, lockfile, build and test configs, CI and the scope-cut call. A dev-only dependency request unanswered after 20 minutes may be added by the requester and named in their handoff.
- 2026-11-07 · all · **Package manager** is `pnpm` only.
- 2026-11-07 · all · **Physics hosting** is localhost on the demo laptop. Event logs use simulation time (`dt` steps), never wall-clock time.

## Open questions

- **Clinician review** (all, at kickoff). Name the reviewer here, or write "No clinician review lined up; scoring rules and anatomy ranges are illustrative, from published arch classifications." Never imply a sign-off that did not happen.
- **Planning-case dataset** (David, before D3b). Which public CT angiogram has a license that fits? Record name, license and URL in `THIRD_PARTY.md` before conversion.
- **Reference site and brand colour** (Aroovee, part of A0's done condition).
- **Demo lead** (decided by D1).

## Log
- 2026-11-07 · David · **D0a toolchain pinned**: pnpm 9.15.9 (`packageManager`), Node 22 (`.nvmrc`), TypeScript 7.0.2, Vite 8.3.6, Vitest 5.1.0, Playwright 1.65.0, pytest 8.4.2 (Python 3.9). One package at the repo root; Vite root is `client/`, build output `dist/`.
- 2026-11-07 · David · **`ControlInput` carries `fluoro` and `contrastPuff`** besides push and rotate, because the wire source writes fluoro on/off into each sample and the `contrast_puff` event (spec §5.6). `WireSource` keeps exactly start, control, stop, onState, onFallback; `stop()` resolves with the drive's `EventLog`.
- 2026-11-07 · David · **Physics `state` positions are metres in the served phantom package's Y-up frame**; the physics process converts before sending, so the client draws wire points without transforming (spec §5.2 gives no frame).
- 2026-11-07 · David · **Event log units**: `s` and positions in metres, time in simulation seconds; `back_out` threshold is 0.02 m (spec's 20 mm). `force_spike` records its threshold, which scoring owns.
- 2026-11-07 · David · **App entry** `client/index.html` and `client/src/main.ts` are a D0a shell showing the honesty line; Aroovee owns them from A1. `tests/e2e/smoke.spec.ts` is a D0a smoke test that A8 may replace.
