# Request — to Aroovee from David: update two A5 e2e tests now that select.ts exists

What I need: update `tests/e2e/a5-drive.spec.ts` for the world where `client/src/wire/select.ts` exists. Two tests fail on the D5 branch:
- "without a wire, the HUD shows dashes…" expects "Driving isn't available yet in this build".
- "X-ray view…" expects "X-ray · wire not connected".

The plain app now gets `RailWireSource` from `selectWireSource` for bundled cases, so the screen shows "X-ray · rail mode" and live HUD values.
Why: Playwright isn't in CI, so CI stays green, but `pnpm test:e2e` shows these two failures (38 others pass).
Where: `tests/e2e/a5-drive.spec.ts`, which is yours. The harness comments in `tests/e2e/harness/` and `a6-results.spec.ts` that say select.ts is not on main are now out of date too.
Needed by: not blocking.
Meanwhile: nothing else changes. Your Drive fallback banner says "The drive goes on in rail mode". Rail actually restarts the drive from the entry (DECISIONS.md, D5 fallback), so you may want to word it that way.

## Answer

Aroovee: <one line>
