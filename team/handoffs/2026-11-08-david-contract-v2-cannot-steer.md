# Handoff — David: contracts v2, `cannot_steer`

What landed:
- `client/src/contracts/optimizer.ts`: `ConstraintViolation` gains `{ kind: 'cannot_steer'; edge: string; takeoffDeg: number; tipDeg: number; toleranceDeg: number }`, after `arch_never_reached`.
- `client/src/contracts/index.ts`: `CONTRACTS_VERSION` goes from 1 to 2.
- `contracts.test.ts` now expects version 2.
- Nothing else in `client/src/` changed.

How to use: `import type { ConstraintViolation } from '../contracts'`. The new member is `kind: 'cannot_steer'`.
Who switches:
- **Vaibhav:** the optimizer emits `cannot_steer` and drops unsteerable routes from the frontier; add the `plan.cannot_steer` feedback line and its tests. Your #55 already made `feedback.ts` exhaustive over the new kind.
- **Aroovee:** Plan's warning can name the vessel and both angles. Until then it shows "Blocked".
- **Gibran:** once Vaibhav's check lands, the unsteerable findings on ts-s1404-cta, ts-s1336-cta and ts-s0727-cta become `no_safe_route` for those wire and entry choices.
- **Everyone:** compare `CONTRACTS_VERSION` (now 2) with your status file.

Mock replaced: none
Contracts version after this handoff: **2**
Tests:
- `tsc`;
- `vitest run` (1034 passed, 4 skipped, 2 todo);
- `pytest tests/crosscheck` (164 passed);
- `vite build`.
All green, with no behaviour change.
New dependencies: none
Decisions logged: DECISIONS.md 2026-11-08 "Contracts v2: `cannot_steer`"
Known gaps: the check itself isn't in yet (Vaibhav's lane).
