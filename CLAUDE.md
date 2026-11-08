# ThreadSim — rules for every Claude Code session

Four teammates build ThreadSim at the same time, each with their own Claude Code:

| Teammate | Lane | Branch | Lane file |
| --- | --- | --- | --- |
| Teammate 1 — David | Anatomy, case data, physics; release manager | `lane/david` | `team/lanes/david.md` |
| Teammate 2 — Vaibhav | Engine: optimizer, rail wire, scoring | `lane/vaibhav` | `team/lanes/vaibhav.md` |
| Teammate 3 — Aroovee | Design system, screens, rendering, AR | `lane/aroovee` | `team/lanes/aroovee.md` |
| Teammate 4 — Gibran | Engine verification, data and demo QA | `lane/gibran` | `team/lanes/gibran.md` |

The spec is `docs/ThreadSim_Build_Specification.md`. The plan is `PLAN.md`. The demo script is `team/DEMO.md`. **Precedence:** the spec wins on product behaviour, `PLAN.md` on sequencing and ownership, this file on session rules. Deliberate deviations from the spec are in `DECISIONS.md`.

## Every session

1. **Pull.** `git pull origin main`, then merge main into your lane branch.
2. **Contracts.** Compare `CONTRACTS_VERSION` in `client/src/contracts/index.ts` with your status file. `unset` means D0b has not merged. If the version changed, read the contract diff before anything else.
3. **Requests first.** Handle every unanswered `team/requests/to-<you>-*.md` and `to-all-*.md` before feature work, including before resuming a milestone. Answer in one line under "Answer" and move the file to `team/requests/done/`.
4. **Read.** Every `team/handoffs/` file newer than your last session, then `team/status/*.md`, then your lane file and the spec sections it lists. Read `DESIGN.md` before any UI work.
5. **Work.** One milestone per session unless your human says "continue". Edit only your own folders. Need a change elsewhere? File a request and keep going on the mock.
6. **Finish.** A milestone is done when its acceptance test passes. Then: commit, open a PR from your lane branch to main, write `team/handoffs/<YYYY-MM-DD>-<you>-<milestone>-<slug>.md`, update `team/status/<you>.md`, push, and stop for your human to look at the PR.
7. **Ambiguity.** Pick the simpler option, add one line to `DECISIONS.md`, continue. Exception: if the simpler option changes a contract, a license boundary or demo scope (cutting physics, AR, a case or a screen), stop and file a request to all instead of deciding alone.

## For the four humans

The repo is a message bus only when someone opens a session to read it. Each of you starts a Claude Code session at least once an hour during the build, and right away when a teammate says a handoff or request landed. Mandatory stops for a human look: after D0b, after D1, after A0.

## Git

- D0a lands directly on `main`. Everything after it, D0b included, goes lane branch → PR → `main`, with CI green.
- Contract changes: `team/requests/to-all-from-<you>-contract-<slug>.md`. David waits up to 20 minutes for both answers, then merges, bumps `CONTRACTS_VERSION` and posts a handoff listing the changed types. Mistakes found later become new contract requests. Nobody else edits `client/src/contracts/`.
- `pnpm` only. Never add npm or yarn lockfiles.
- Runtime dependencies go through David by request. A dev-only dependency request unanswered after 20 minutes may be added by the requester and named in their handoff.

## Folder ownership

| Folder or file | Owner |
| --- | --- |
| `client/src/contracts/`, `client/src/case/`, `client/src/wire/physics*`, `client/src/wire/replay*`, `client/src/wire/select.ts`, `client/public/cases/`, `client/public/models/` | David |
| `client/src/input/`, `tests/fixtures/hands/` | Vaibhav |
| `physics/` (including `physics/cases/`, the CathSim-derived packages), `tools/`, `slicer/`, `tests/fixtures/broken/` | David |
| `package.json`, `pnpm-lock.yaml`, `vite.config.ts`, `vitest.config.*`, `playwright.config.*`, `.github/` (CI, `CODEOWNERS`), `README.md` structure | David, as release manager |
| `client/src/optimize/`, `client/src/score/`, `client/src/wire/rail*`, `client/src/wire/mock-source.ts` | Vaibhav |
| `tests/fixtures/synthetic/`, `tests/fixtures/logs/` | Vaibhav |
| `DESIGN.md`, `client/src/styles/`, `client/src/render/`, `client/src/ui/` (including `ui/plan/`, the Plan screen), `client/src/assets/`, `tests/e2e/`, `team/DEMO.md` | Aroovee |
| `tests/engine/`, `tests/fixtures/engine/`, `tests/crosscheck/`, `team/rehearsal/` | Gibran |
| `metrics/<lane>/` | Each lane writes only its own (`metrics/david/`, `metrics/vaibhav/`, `metrics/aroovee/`, `metrics/gibran/`). Commit summaries, not raw high-frequency logs. |
| `DECISIONS.md`, `THIRD_PARTY.md`, `docs/` | Shared, append-only |
| `assets/vascular/` (staged BodyParts3D mesh, CC BY-SA 2.1 JP; stays outside `client/` until a request to all says otherwise) | Gibran |
| `tests/fixtures/` root | Nobody. New fixtures go in a subfolder you own. |

`client/src/wire/` is split between two owners; see `client/src/wire/README.md`. If you are about to create a file in `wire/` whose name does not match your globs, stop and file a request.

## Never

- Compute routes, measures, scores or feedback numbers with an AI model. Never hard-code realistic-looking numbers in the UI: after V1, every on-screen number comes from a contract field (a mock or the real engine).
- Feed stand-in recorded runs to the app. No real runs means the §4.4 arch constraint and the two simulated measures are dropped (see `DECISIONS.md`).
- Copy CathSim code or meshes into `client/` or `client/public/`.
- Claim clinical realism, patient benefit, or a clinician review that `DECISIONS.md` does not record.
- Invent `DESIGN.md` tokens or a brand colour unless you are Aroovee. Use raw colours, sizes, radii or shadows in UI code.
- Put secrets, API keys or `.env` files in the repo.
- Edit another lane's folders or another teammate's status file.
- Chain more than one milestone in a session without your human saying "continue".
