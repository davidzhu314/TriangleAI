# ThreadSim — Four-Lane Build Plan

Nov 7, 2026 · David (Teammate 1), Vaibhav (Teammate 2), Aroovee (Teammate 3), Gibran (Teammate 4) · revised after the plan review; Gibran's lane added Nov 7

> ThreadSim is a browser decision trainer for endovascular procedures. You plan a wire route through an aortic arch, compare it with a computed frontier, drive it with simplified device mechanics, and see which choice cost you the most.
>
> Decision trainer with simplified device mechanics. Not a clinical device; no claim of patient benefit.

The spec is `docs/ThreadSim_Build_Specification.md`. It wins on product behaviour; this plan wins on sequencing and ownership; deviations are in `DECISIONS.md`.

## How the work splits

ThreadSim splits into three lanes along its data flow: David makes the anatomy and the physics, Vaibhav turns them into routes and scores, and Aroovee turns everything into what a trainee sees. Every lane works against shared contracts and mocks from the first hours, then swaps a mock for the real module when the upstream lane posts a handoff, so all three build at the same time. Gibran's lane sits beside that flow: he checks the engine on the cases the demo uses and rehearses the demo, with no engine or UI code of his own.

| Teammate | Lane | Spec sections | Hands to the others |
| --- | --- | --- | --- |
| Teammate 1 — David | Anatomy, case data, physics; release manager | 2, 3, 5.1–5.2, 9.1–9.2 | Contracts, case packages + loader + validator, generated arches, recorded-run stats, physics and replay wire sources |
| Teammate 2 — Vaibhav | Engine: optimizer, rail wire, scoring | 4, 5.3, 5.6, 6 | Measures, frontier, rail wire, plan and drive scores, feedback lines, progression rules |
| Teammate 3 — Aroovee | Design system, screens, rendering, AR | 5.4–5.5, 7, 9.4 | The app itself, the design system, the demo script and its Playwright test |
| Teammate 4 — Gibran | Engine verification, data and demo QA | 4, 5.3, 5.6, 6, 7.4, 11 | Engine checks on the demo cases, timings, a golden demo log, and rehearsal QA. Nothing moves from David's or Aroovee's folders |

Folder ownership is in `CLAUDE.md`. Nobody edits another lane's folders; file a request and keep building on the mock.

**Release manager: David.** He owns runtime dependencies, `package.json`, the lockfile, build and test configs, CI and the final scope-cut call. Others file a request for a runtime dependency; a dev-only dependency unanswered after 20 minutes may be added by the requester and named in their handoff.

```text
David ──case packages, generated arches, recorded runs──▶ Vaibhav ──measures, frontier, rail wire, scores──▶ Aroovee
  └──────────────loader and validation results, physics and replay wire sources, phantom cases at runtime──────────▲
══════════ client/src/contracts: typed hand-offs, version checked every session ══════════
══════════ team/: status, handoffs and requests, how each lane says it is done ══════════
```

No arrow runs right to left: Aroovee never hands code back, and Vaibhav depends on David only through contracts that have mocks.

### Gibran's lane: G0–G3

The full lane is `team/lanes/gibran.md`. Bugs Gibran finds go to the owner as a request with a failing test; he never edits `client/src/` or `package.json`.

- **G0 — Onboarding** (read and run only): `pnpm test`, `pytest tests/crosscheck`, `pnpm build` and `pnpm dev` green on a fresh `main`; `team/status/gibran.md` on `main`.
- **G1 — Engine checks on `type-iii` and `low-tort`** (S5 confidence): NumPy cross-checks, rail acceptance, timings (`metrics/gibran/d6-timing.md`), real-anatomy progression, and a golden Type III demo log that replays byte for byte.
- **G2 — Demo rehearsal QA** (supports S5): `team/rehearsal/checklist.md` from `team/DEMO.md`, one full timed rehearsal recorded, every bug filed to its owner.
- **G3 — Real-hand clip library** (after the demo, once PR #22 merges): at least 5 clips handed to Vaibhav as fixtures.

## Kickoff: D0a, then D0b

Contracts are not a 30-minute job. Kickoff runs in two steps.

**D0a — before anyone else starts.** A human or one short Claude session, landing directly on `main`:

- Repo layout from spec §2 (with the Plan screen at `client/src/ui/plan/`), `package.json` with a pinned `pnpm`, Vitest, Playwright and pytest stubs, and the CI workflow passing.
- The stub files in this pack: `README.md`, `DESIGN.md`, `THIRD_PARTY.md`, `.gitignore`, `.github/CODEOWNERS`, `client/src/styles/tokens.css`, `client/src/wire/README.md`, the `metrics/` and `tests/fixtures/broken/` folders.
- Three contracts written in full, because the spec spells them out: `physics-protocol.ts` (§5.2), `events.ts` (§5.6), `wire.ts` (from those two).
- The other contract files exporting their names, compiling, with bodies still to fill.
- `CONTRACTS_VERSION` stays unset.

**D0b — David's first reviewed PR.** Fill `case`, `validation`, `recorded-runs`, `optimizer` and `score` from the spec; write `case.schema.json`; build `fixture-y` so it validates; make `pnpm test` run something real. Vaibhav and Aroovee review within 20 minutes; after that David merges anyway and mistakes become contract requests. Only when D0b merges does `CONTRACTS_VERSION = 1`, and David's handoff tells the others to update their status files.

A longer D0b idles nobody: V0 (NumPy references) and A0 (design system) need no contracts and take longer than D0b.

## Contracts

| File in `client/src/contracts/` | Defines | Spec | Written in | Producer → consumer |
| --- | --- | --- | --- | --- |
| `physics-protocol.ts` | WebSocket messages `start`, `control`, `stop`, `state` exactly as in §5.2; `t` is simulation time | 5.2 | D0a | David (both ends) |
| `events.ts` | `EventLog`: 30 Hz samples (t, tip, s, edge, force, fluoro) and discrete events (wrong_branch, prolapse, back_out, force_spike, contrast_puff, target_reached); time is simulation time, never wall-clock | 5.6 | D0a | Rail and physics sources write it; Vaibhav scores it |
| `wire.ts` | `WireSource` (start, control, stop, onState, onFallback), `WireState`, `ControlInput` (push and rotate, each −1..1) | 5.1–5.3 | D0a | David + Vaibhav → Aroovee |
| `case.ts` + `case.schema.json` | `threadsim.case/1` (case.json, centerlines.json) and `LoadedCase` after load (metres, Y-up); a case's source can be bundled, imported, or served by the physics process | 3.2 | D0b | David → Vaibhav, Aroovee |
| `validation.ts` | `ValidationResult`: check id, severity, message, offered fix (rescale, flip axes, decimate) | 3.5 | D0b | David → Aroovee |
| `recorded-runs.ts` | Real CathSim stats per phantom × target × preset: runs, success rate, peak force, reached | 4.4, 4.6 | D0b | David → Vaibhav |
| `optimizer.ts` | `WirePreset`, `Route`, `CostVector` (the measures in §4.6; the two simulated ones optional, present only with real recorded runs), `Frontier`, route labels, `Weights`, `NoSafeRoute` with suggestion | 4.3–4.8 | D0b | Vaibhav → Aroovee |
| `score.ts` | `PlanScore`, `DriveScore`, stars, `FeedbackLine` { text, values, formulaRef } | 6 | D0b | Vaibhav → Aroovee |
| `index.ts` | Re-exports everything plus `CONTRACTS_VERSION` (unset until D0b merges, then 1) | — | D0a | Everyone checks it each session |

The mocks, so nobody waits on anybody:

- **`client/public/cases/fixture-y/`** (David, D0b): the smallest valid case, an aorta edge splitting into two branches, one entry, two targets and one heavy risk zone.
- **`optimize/mock.ts`, `score/mock.ts`, `wire/mock-source.ts`** (Vaibhav, V1): a fixed three-route frontier, fixed scores with three feedback lines, a wire that walks the tip along a path at constant speed, all in contract shape.
- **A recorded-runs mock** (Vaibhav, V1) for tests only. It never feeds the app: with no real runs, the §4.4 arch constraint and the two simulated measures are dropped.
- **`styles/tokens.css`** (Aroovee, placeholder from D0a): neutral tokens until A0 lands.

Units rule: case files stay in millimetres and RAS axes; the loader converts once to metres and Y-up, and every contract after load uses metres. Displayed numbers keep the spec's units (cm for length, mm for radius, degrees, seconds).

## How the four Claude Codes talk

The repo is the message bus. Each Claude Code reads `team/` at the start of every session and writes to it at the end of every milestone. Each file has exactly one writer, so there are no merge conflicts. The session checklist is in `CLAUDE.md`; requests are handled before any feature work.

```text
threadsim/
  CLAUDE.md  PLAN.md  README.md  DESIGN.md  DECISIONS.md  THIRD_PARTY.md
  docs/ThreadSim_Build_Specification.md    # read this one
  docs/ThreadSim_Build_Specification.docx  # original
  team/
    DEMO.md                                   # spec §7.4 with fallbacks
    lanes/david.md vaibhav.md aroovee.md gibran.md
    status/david.md vaibhav.md aroovee.md gibran.md   # each lane edits only its own
    rehearsal/                                # Gibran: demo rehearsal checklists and results
    handoffs/<YYYY-MM-DD>-<name>-<milestone>-<slug>.md
    requests/to-<owner>-from-<you>-<slug>.md
    requests/to-all-from-<you>-contract-<slug>.md
    requests/done/
  metrics/david/ vaibhav/ aroovee/ gibran/
  .github/CODEOWNERS  .github/workflows/ci.yml
```

**Human cadence.** Nothing reads a handoff while every session is closed. Each teammate opens a Claude Code session at least once an hour during the build, and immediately when told a handoff or request landed. Each session does one milestone and stops for a human look at the PR. Mandatory stops: after D0b, after D1, after A0.

## Sync points

The five sync points are merges, not meetings: each is the moment mocks are replaced on `main` by real modules. Only the Required column gates a sync point; the rest runs in parallel. Physics never gates anything after S1, because rail carries every flow.

| Sync | Passes when | Required | Parallel / optional |
| --- | --- | --- | --- |
| S1 Contracts v1 | D0b merged; V1 mocks exist; A0 tokens exist | D0a, D0b, V0, V1, A0 | D1 (decides the demo lead), A1 |
| S2 Plan works | A route is planned and compared on the generated Type III case, with real `measureRoute` and frontier | D2, D6-min, V2, V3, A2, A3, A4 | D3a, D3b, D3c |
| S3 Drive works | Rail drive reaches the target on a frontier route | V4, A5 | D4, D5; if D5 is late, the fallback notice is tested with a mock socket failure |
| S4 Scores work | Replaying a golden event log gives identical scores | V5, V6, A6 | D6 full ladder |
| S5 Demo ready | Playwright runs `team/DEMO.md` green on rail; zero Taste inspector FAILs on 2D screens | V7, A8 | D7, A7, G1, G2 |

David's D1 result, written into `DECISIONS.md` at S1, decides whether the S5 demo leads with physics or rail.

## Scope cuts

If the team falls behind, David calls cuts in this order and writes each one into `DECISIONS.md`:

1. AR (A7). Hidden AR covers browsers without `immersive-ar`, not a Quest 3, so cutting A7 leaves that done item unmet; say so.
2. Live 3D Slicer export (D7). The fixture committed in D3c still loads in the demo.
3. The public CTA planning case (D3b).
4. Live physics (D5). Rail only. Replay of phantom runs goes with it, because it needs the physics process to serve the mesh.
5. The Taste product microsite (already stretch).

Never cut: Library → Brief → Plan → Compare → Drive → Results in rail mode on the generated Type III case and `fixture-y`, the frontier, scores that replay from a log, honest copy, and zero invented on-screen numbers.

## Design rules: Taste Skill + the Design Playbook

Aroovee's Claude Code measures one reference site into `DESIGN.md` and tokens (Playbook skills 1 and 2), deals the app's layout with Taste Skill's app-screen route while keeping that palette and type, and draws every icon and chart with `/draw-svg` (Playbook skill 3). If either skill will not install within 30 minutes, she writes `DESIGN.md` and tokens by hand and continues. David, Vaibhav and Gibran never pick a colour or write UI. The full design run is in `team/lanes/aroovee.md`.

| Rule | Source | In ThreadSim |
| --- | --- | --- |
| No invented data (`placeholder-data` fails an app screen) | Taste app checks | Every number on screen comes from a contract field and has a tooltip naming its formula (spec §6.6) |
| Colour is spent on data; no rainbow charts | Taste app checks | Frontier routes also differ by line pattern and label (spec §7.3) |
| No eyebrow labels, 01/02/03 numbering, gradients, glass, emoji, resting shadows | Taste house style | All 2D UI; the grey X-ray view is required by spec §5.5, not a style choice |
| A phone layout, not a squeezed desktop | Taste app checks | Library, Brief and Results work well at 390 px; Plan and Drive stay usable there |
| Tokens only | Playbook design memory | No raw hex or px outside `tokens.css`; three.js materials read colours from the tokens |
| One icon family | Playbook graphics in code | No icon pack; every icon drawn on the same grid and stroke |
| Honest copy | Spec §9.4 + Taste copy lint | The honesty line in the README and on Library, Brief and Results, not on the Drive HUD; presets and weights labelled illustrative |
| Last-night priority | — | If inspector FAILs remain during A8, fix Library, Drive and Results first; they carry the demo |

## Definition of done

Spec §11's list, with the deviations recorded in `DECISIONS.md`:

- [ ] Five or more cases load from the Library: `fixture-y`, generated arches covering the unlock ladder, and a licensed CTA planning case if ready. Phantom cases count only while served by the physics process — David
- [ ] Plan → Compare → Drive → Results works on every case, in rail mode at minimum — Aroovee, on Vaibhav's engine
- [ ] The optimizer returns a non-dominated frontier and handles "no safe route" — Vaibhav
- [ ] Plan and drive scores are reproducible from saved event logs — Vaibhav
- [ ] All metric cross-checks pass against the analytic fixtures and each other — Vaibhav
- [ ] A Playwright test runs `team/DEMO.md` green in rail mode on the Type III case and `fixture-y` — Aroovee
- [ ] AR works on the Quest 3 browser at ≥ 72 fps, or is hidden where unsupported; if A7 is cut, `DECISIONS.md` says so — Aroovee
- [ ] Every 2D screen shows zero Taste inspector FAILs at 1440, 768 and 390 px — Aroovee
- [ ] `THIRD_PARTY.md`, `DECISIONS.md` and a README with honest claims exist — David, with input from all

## Sources

- `docs/ThreadSim_Build_Specification.md` (Nov 7, 2026)
- [Taste Skill](https://www.tasteskill.dev/) and its [documentation](https://www.tasteskill.dev/docs)
- [The Claude Code Design Playbook](https://nuhushaik.com/resources/design) by Nuhu Shaik
- `ThreadSim-Plan-Review-and-Recommended-Changes.md` and its evaluation
