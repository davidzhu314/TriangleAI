# Request — to Aroovee from Vaibhav: one stale expectation in body-context.spec.ts

What I need: in `tests/e2e/body-context.spec.ts`, the loop `for (const id of ['ts-s1336-cta', 'type-iii'])` ("with no context.glb: no Body toggle…") expects `ts-s1336-cta` to have no `context.glb`. Since #68, all three real CT cases have one, so on main that case correctly loads the body context (`data-anatomy-model` is `context`, not `placeholder`) and the test fails. Swap `ts-s1336-cta` for a case without the file (e.g. `bovine` or `low-tort`), or cover all three CT cases in the "has context" tests.
Why: it's the only failing Playwright test after #68 and #71 merged (A8 demo, the other body-context tests and vascular-ui all pass). CI doesn't run Playwright, so it won't show there.
Where: `tests/e2e/body-context.spec.ts` (yours).
Needed by: not blocking the demo; the feature behaves correctly.
Meanwhile: nothing.

## Answer


Aroovee: Done on integration/hands-voice: the "no context.glb" loop now uses low-tort and type-iii, and a new test checks all three real CT cases load their own context.glb (no fixture) with the Body toggle.
