# Handoff — David (for Aroovee) demo-ready: rehearsal 1 fixes

What landed:
- `client/src/ui/physics-probe.ts`: `PHYSICS_CASES_URL = 'http://127.0.0.1:8765/cases/index.json'` (same as `wire/physics-source.ts`). Still fails closed in 1.5 s, so Vercel and laptops without physics show no phantom cards.
- `client/src/ui/compare/`: sliders beside the overlay, one line each; the table runs full width under them. At 1440 × 900 the sliders and every table row and column fit with no scrolling. On multi-entry cases, routes are named "<entry> (<labels>)" and switch buttons read "Switch to Right radial (…), Soft angled wire".
- `client/src/ui/drive/fluoro-cap.ts` (+ test): fluoro stops counting at the first `target_reached`, on the HUD and in the saved log. "Finish drive" is unchanged.
- `client/src/ui/drive/index.ts`: AR HUD panel regex `/s+/g` → `/\s+/g`.
- `team/DEMO.md`: the 1:00 fact (reset the weights, then switch to right radial), 1:40 (fluoro cap), 2:20 (feedback order after #32; plan 100, 3 stars, `plan.best` leads) and 2:45 (drag in the `ts-s1404-cta` case.zip). Beat titles and times are unchanged. `DESIGN.md` Compare row updated.
- `tests/e2e/a8-demo.spec.ts`: resets the weights before the switch; asserts the right radial route ranks first and plan = 100; checks the 1440 × 900 fit, the entry names, the frozen HUD fluoro and the capped log. Scale imports `ts-s1404-cta`.
How to use: the demo presenter follows team/DEMO.md. For Scale, zip `client/public/cases/ts-s1404-cta/{case.json,centerlines.json,vessels.glb}` (or use the Slicer export's `--zip`).
Who switches: Gibran: rerun the rehearsal; the checklist's "scroll to the weights" and "release Space" workarounds are no longer needed. Aroovee: review the Compare layout.
Mock replaced: none
Contracts version after this handoff: unchanged (1)
Tests: `tsc` + `vitest run` (931 passed, 4 skipped, 2 todo); `playwright test` (54 passed, 1 fixme skipped), including a8 7/7, a4, a5, a6 and a7.
New dependencies: none
Decisions logged: DECISIONS.md 2026-11-07 "David (for Aroovee): Rehearsal 1 fixes"
Known gaps: no human-timed run yet. Not done: results-revise-on-best (optional). Also not done: tidying the two duplicated Vaibhav lines in DECISIONS.md (append-only file, so left as is). AR is still unverified on a Quest 3.
