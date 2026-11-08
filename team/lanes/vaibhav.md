# Teammate 2 — Vaibhav: optimizer, rail wire and scoring

Vaibhav builds the deterministic engine: per-edge measures, the route optimizer and frontier, the rail wire, and the plan and drive scores. It is pure TypeScript in Web Workers with no UI. Every measure is checked against closed-form answers on synthetic fixtures, in both TypeScript and NumPy, so the engine can be built and tested before any real case exists.

**Read first:** `docs/ThreadSim_Build_Specification.md` sections 4, 5.3, 5.6, 6, 11. Then `CLAUDE.md`, `PLAN.md` and `DECISIONS.md`.

**You own:** `client/src/optimize/`, `client/src/score/`, `client/src/wire/rail*`, `client/src/wire/mock-source.ts`, `tests/fixtures/synthetic/`, `tests/fixtures/logs/`, `metrics/vaibhav/`. (`tests/crosscheck/` moved to Gibran when his lane was approved.)

**You consume:** `LoadedCase` from David (`fixture-y` from D0b, the generated Type III and low-tortuosity cases from D6-min) and, only if real, `recorded-runs.json` from D4.

**Never:** edit `package.json` (file a request; a dev-only dependency may be self-applied after 20 minutes), compute any number with an AI model, or let a recorded-runs mock reach the app.

## Truth for measures

The synthetic fixtures have closed-form answers, and those are the truth. NumPy and TypeScript are both tested against them. On real anatomy, where no closed form exists, TypeScript is cross-checked against NumPy within 0.1 mm and 0.5°. If anything disagrees, find the bug; never loosen a tolerance without a `DECISIONS.md` line.

## Milestones

1. **V0 — Synthetic fixtures and NumPy references** (starts at minute zero; needs no contracts).
    - `tests/fixtures/synthetic/`: centerlines with known answers: a straight line, a 90° arc of known radius, a helix, a Y-branch.
    - `tests/crosscheck/`: NumPy implementations of the §4.2 measures (L, turning angle over a 5 mm window, Θmax, ΘΣ, rmin, proximity clearance), each passing against the closed-form answers.
2. **V1 — Mocks in contract shape. Do not start until contracts v1 is on `main`** (David's D0b handoff).
    - `optimize/mock.ts` (three-route frontier for `fixture-y`), `score/mock.ts` (scores and three feedback lines), `wire/mock-source.ts` (tip walks a path at constant speed), and a recorded-runs mock used by tests only.
    - Handoff unlocks: Aroovee builds Plan, Compare, Drive and Results on them.
3. **V2 — Graph and per-edge measures in a Worker** (spec §4.1–4.2). Required for S2.
    - Graph from centerlines; per-edge measures; risk-zone overlap; `measureRoute(edges)` for a partial route, called by the Plan screen on every click.
    - Done when: TypeScript passes the closed-form tests and matches NumPy within 0.1 mm and 0.5° on `fixture-y` and the generated cases once they land; a partial-route update fits in one frame.
    - Handoff unlocks: Aroovee's live cost panel goes real.
4. **V3 — Optimizer and frontier** (spec §4.3–4.8). Required for S2.
    - Wire presets (labelled illustrative); hard constraints; DFS capped at 50 per pair; Yen's k = 10 for large graphs; cost vectors; heavy-crossings-first ordering; frontier; labels; "no safe route" with the suggested change; weighted ranking.
    - The §4.4 arch constraint and the two simulated measures run only when real `recorded-runs.json` exists; otherwise they are absent from the cost vector and the UI.
    - Done when: a property test finds no dominated route on the frontier; a forbidden zone is never routed through; re-ranking takes under 16 ms.
    - Handoff unlocks: Aroovee's Compare screen goes real.
5. **V4 — Rail wire** (spec §5.3, §5.6). Required for S3.
    - `RailWireSource` implementing `WireSource`: arc-length s, roll φ, the 25° branch-entry rule, scripted prolapse, wall-force proxy, the 30 Hz `EventLog` with discrete events, in simulation time. The core is a pure `step(state, input, dt)`.
    - "Template cases" means `fixture-y` and the synthetic fixtures until D6-min lands, then the generated cases too. Real phantoms are a bonus, never a gate.
    - Done when: rail reaches every target on every template case along the frontier routes, and replaying a golden input log through `step` is bit-stable.
    - Handoff unlocks: David's `select.ts` falls back to it; Aroovee's Drive screen goes real.
6. **V5 — Plan and drive scores** (spec §6.1–6.4, §6.6). Required for S4.
    - Plan score with its four capped checks, regret and the biggest single contributor; drive score from fidelity, gentleness, radiation and errors (time shown, never scored); stars; feedback lines from templates, each with its values and `formulaRef`.
    - Golden event logs in `tests/fixtures/logs/`. Done when: replaying a log gives identical scores, and every cap rule and template has a test.
    - Handoff unlocks: Aroovee's Results screen and formula tooltips.
7. **V6 — Progression rules** (spec §6.5). Required for S4.
    - Pure functions for the radiation budget (costs stars, not progress), the unlock ladder (starting with the generated low-tortuosity arch), adaptive difficulty and completion-based course grading.
8. **V7 — Performance and voice pass.** Required for S5.
    - Optimizer timings to `metrics/vaibhav/`; send feedback templates to Aroovee by request for a voice review (she may change words, never numbers).

## Starter prompt for Vaibhav's Claude Code

```text
I'm Vaibhav, Teammate 2 on ThreadSim: the engine (measures, optimizer, rail wire, scoring).
Read CLAUDE.md, PLAN.md, DECISIONS.md, team/lanes/vaibhav.md, and docs/ThreadSim_Build_Specification.md
(sections 4, 5.3, 5.6, 6, 11).
Start with V0: synthetic fixtures with closed-form answers and NumPy reference measures that pass against them.
V1 must not start until CONTRACTS_VERSION is 1 on main. Work only in my folders; never edit package.json.
No AI model computes any number, and the recorded-runs mock never reaches the app.
When the milestone is done: tests green, PR, team/handoffs file, team/status/vaibhav.md, then stop and wait for me.
Do one milestone per session unless I say "continue". Handle team/requests/to-vaibhav-*.md and to-all-*.md first every session.
```
