# Teammate 1 — David: anatomy, case data and physics

David builds everything the app runs on: the repo, the contracts, the case packages and their loader, the generated arches, and the physics and replay wires. He is also release manager. His kickoff (D0a, D0b) comes first; after that no other lane waits on him, because each later milestone replaces a fixture or mock the others already use.

**Read first:** `docs/ThreadSim_Build_Specification.md` sections 2, 3, 5.1–5.2, 8 (Phases 0, 1, 6, 7), 9.1–9.2, 11. Then `CLAUDE.md`, `PLAN.md` and `DECISIONS.md`.

**You own:** `client/src/contracts/`, `client/src/case/`, `client/src/wire/physics*`, `client/src/wire/replay*`, `client/src/wire/select.ts`, `client/public/cases/`, `physics/` (including `physics/cases/`), `tools/`, `slicer/`, `tests/fixtures/broken/`, `metrics/david/`. As release manager: `package.json`, `pnpm-lock.yaml`, build and test configs, `.github/`, `README.md` structure.

**You consume:** `wire/rail*` from Vaibhav, for the fallback in `select.ts`. Use `wire/mock-source.ts` until V4 lands.

**Hard rule:** no CathSim code or meshes in `client/` or `client/public/`. Phantom cases live in `physics/cases/` and reach the browser only at runtime, from the physics process.

## Milestones, in the order you do them

1. **D0a — Scaffold** (lands directly on `main`, before anyone else starts).
    - Repo layout from spec §2 with the Plan screen at `client/src/ui/plan/`; `package.json` with a pinned `pnpm`; Vitest, Playwright and pytest stubs; `.github/workflows/ci.yml` passing; keep the stub files from this pack.
    - `physics-protocol.ts`, `events.ts` and `wire.ts` written in full from spec §5.2 and §5.6; the other contract files export their names and compile. `CONTRACTS_VERSION` stays unset.
2. **D0b — Contracts v1** (your first PR; stop for your human afterwards).
    - Fill `case`, `validation`, `recorded-runs`, `optimizer` and `score`; `case.schema.json`; `fixture-y` validating; `pnpm test` runs something real.
    - Review: Vaibhav and Aroovee get 20 minutes, then you merge; later mistakes become contract requests.
    - Done when: merged, `CONTRACTS_VERSION = 1`. Handoff unlocks: Vaibhav's V1, and both others set `Contracts version: 1`.
3. **D1 — Physics gate** (spec Phase 0; timebox 90 minutes; stop for your human afterwards).
    - Python 3.9 environment in `physics/`; CathSim manual control on phantom3; steps per second over 60 s; stream the 80 wire points to a blank three.js page. Write `physics/README.md` as you go: environment setup, the 60 s probe, how to start the server, what happens when CathSim is missing.
    - Gate: ≥ 40 steps/s and < 100 ms latency. A failed install inside the timebox is a failed gate.
    - Done when: `DECISIONS.md` has the line "Demo leads with physics" or "Demo leads with rail". Do not start D2 before that line exists.
4. **D2 — Loader and validator** (spec §3.5). Required for S2.
    - In-browser unzip, schema check, units auto-rescale offer, axes, graph connectivity, radii, mesh budget with decimation in a Web Worker, privacy strip, Planning-only flag. mm → m and RAS → Y-up happen here, once. Loads bundled, imported and physics-served cases the same way.
    - One broken package per rule in `tests/fixtures/broken/`. Done when: each produces its message.
    - Handoff unlocks: Aroovee's import and Library use the real `loadCase`.
5. **D6-min — The two generated cases** (spec §3.4). Required for S2.
    - Seeded generator in `tools/`, one language, our own GLB writer (or a wrapper we own), writing standard packages from the same splines as the mesh.
    - Two cases into `client/public/cases/`: a **Type III arch** (the §7.4 demo case, tuned by seed so its routes include a sharp turn the optimizer flags and at least three frontier routes) and a **low-tortuosity arch** (ladder start and §7.3 tutorial).
    - Done when: both validate; the byte test passes (sorted JSON keys, fixed float formatting, fixed zip order and metadata, single-threaded numerics) and the semantic test passes beside it.
    - Handoff unlocks: S2 on a real case; Vaibhav's cross-checks on generated anatomy.
6. **D3c — First Slicer fixture, early.**
    - As soon as one 3D Slicer export works, commit it as a fixture in `client/public/cases/` and confirm it imports with no manual edits. D7 later only has to reproduce it.
7. **D3a — Phantom case packages** (only if D1 passed).
    - The four CathSim phantoms as packages in `physics/cases/` (GLB under 60k triangles, VMTK centerlines, bca and lcca targets), `source.license` set to CC BY-NC-SA 4.0, attribution recorded in `THIRD_PARTY.md`.
8. **D4 — Recorded runs** (only if D1 passed).
    - Run CathSim per phantom × target × preset; write `recorded-runs.json` and replay files (wire frames, not meshes) into `physics/`.
    - No stand-in, ever. If there are no real runs, write in `DECISIONS.md` that the §4.4 arch constraint and the two simulated measures are dropped, and tell Vaibhav by handoff.
9. **D5 — Physics server, case serving, wire sources, fallback selector** (spec §5.2, §5.7).
    - Localhost only. WebSocket `/wire` at about 30 Hz, plus an HTTP endpoint that serves the phantom packages from `physics/cases/` with their license notice. Replay needs this process up too.
    - `PhysicsWireSource` and `ReplayWireSource` implement `WireSource` and write the same `EventLog` as rail, in simulation time.
    - `wire/select.ts` works with `mock-source.ts` until V4, then `RailWireSource`; it falls back to rail when the socket fails or stalls for 2 s and fires `onFallback`. Phantom cases are listed only while the physics process answers.
    - Done when: pytest covers messages and fallback; the fallback test runs with no physics server; latency goes to `metrics/david/`.
10. **D3b — Public CTA planning case** (stretch; cut 3 in the scope order).
    - Record the dataset name, license and URL in `THIRD_PARTY.md` before conversion. De-identify before any processing (spec §3.1); the D2 privacy strip is only a backstop.
11. **D6 — Full generator ladder** (spec Phase 6).
    - Types I and II, bovine, tortuosity, diameters, risk zones, completing the unlock ladder after D6-min's two cases. Same byte and semantic tests.
12. **D7 — Slicer script and licensing** (spec §3.6, §9.1).
    - The Slicer script reproduces the D3c fixture; `THIRD_PARTY.md` complete for every dependency and asset; README with honest claims.

## As release manager

- Apply runtime-dependency requests promptly; a dev-only request may be self-applied by its author after 20 minutes.
- Keep CI green on `main`; revert a merge that breaks it and tell its owner by request.
- Call scope cuts in the order in `PLAN.md`, each written into `DECISIONS.md`.
- Generate `.github/CODEOWNERS` from the `CLAUDE.md` table once GitHub usernames are known.

## Starter prompt for David's Claude Code

```text
I'm David, Teammate 1 on ThreadSim: anatomy, case data, physics, and release manager.
Read CLAUDE.md, PLAN.md, DECISIONS.md, team/lanes/david.md, and docs/ThreadSim_Build_Specification.md
(sections 2, 3, 5.1-5.2, 8, 9, 11).
This session: D0a only if main has no scaffold yet, otherwise D0b. D0a lands on main; D0b is a PR from lane/david.
Write physics-protocol.ts, events.ts and wire.ts in full from the spec. Never put CathSim code or meshes in client/.
When the milestone is done: tests green, PR, team/handoffs file, team/status/david.md, then stop and wait for me.
Do one milestone per session unless I say "continue". After D1, do not start D2 until DECISIONS.md says
whether the demo leads with physics or rail. Handle team/requests/to-david-*.md and to-all-*.md first every session.
```
