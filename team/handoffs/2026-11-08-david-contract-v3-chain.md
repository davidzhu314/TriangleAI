# Handoff — David: contracts v3 (chain simulation), on `integration/hands-voice`

**Contracts version: 3 on `integration/hands-voice`. `main` is still 2 until the integration branch merges.**

Changed types (all additive; rail, physics, replay and scoring are unchanged):
- **`events.ts`:**
  - `WireMode` gains `'chain'`. New `DeviceId = 'wire' | 'catheter'`.
  - `EventSample` gains optional `device`, `push`, `rotate`, `tangent`, `tipRollRad`, `hubRollRad` and `riskIndex`.
  - New `ReviewEvent`: `wall_contact`, `imaging_interval`, `branch_entry` and `roadmap_stored`.
  - `EventLog` gains optional `review?: ReviewEvent[]`. `events` is unchanged.
- **`wire.ts`:**
  - `ControlInput` gains optional `device`, `pulse` and `storeRoadmap`.
  - New `PulseRate`, `WireTipPose`, `WireDevices`, `WireContact` and `WireImaging`.
  - `WireState` gains optional `tipPose`, `devices`, `contacts`, `riskIndex` and `imaging`.
- `CONTRACTS_VERSION` is 3.

What landed with it:
- **The chain simulation** (`client/src/wire/physics-chain*.ts`, from #74), merged into the integration branch.
- **`ChainWireSource`:**
  - reports `mode: 'chain'`;
  - reads `device`, `pulse` and `storeRoadmap` from `ControlInput`;
  - emits the v3 `WireState` fields and the v3 sample fields;
  - writes `review` events at `stop()`.
- **CLAUDE.md, Git:** until the demo, every feature integrates on `integration/hands-voice`.

Who switches:
- **Aroovee:** the Drive redesign screen reads `WireState.imaging`, `tipPose`, `devices`, `contacts` and `riskIndex` from a chain source. `select.ts` doesn't offer it yet; say when the screen is ready and I'll switch bundled cases to it on this branch.
- **Vaibhav:** scoring and review can read `EventLog.review` and the new sample fields. Imaging efficiency must be weighed together with contact and navigation.
- **Gibran:** verify on the integration preview once a screen uses it.
- **Everyone:** compare `CONTRACTS_VERSION` (3 on this branch). New features target `integration/hands-voice`, not `main`.

Tests:
- `tsc`;
- `vitest run` on the integration branch: 1142 passed, 4 skipped, 2 todo. That includes the 11 chain-simulation tests and the contracts test (version 3).
New dependencies: none
Decisions logged: DECISIONS.md 2026-11-08 "Contracts v3 (chain simulation) on the integration branch; features integrate pre-demo"
