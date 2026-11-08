# G4 — Cathy QA: answer grounding

Written by `UPDATE_METRICS=1 pnpm exec vitest run tests/engine/cathy-grounding.test.ts`. Machine: darwin arm64, Node v22.23.4. Main thread, after a warm-up. Date of run: 2026-11-08.

Every bundled case (`low-tort`, `type-i-plaque`, `type-ii`, `type-ii-tortuous`, `type-iii`, `bovine`, `ts-s1404-cta`, `fixture-y`), every target, at DEFAULT_WEIGHTS. 1402 spoken lines checked over 54 rail drives and every entry × wire × route prefix. All checks in `tests/engine/cathy-grounding.test.ts` pass: every number is in the line's values, every artery named is on a frontier route (or safe candidate), "best" follows the top-ranked route, live lines match scoreCase, and the same input gives the same line. No LLM is involved.

Off-frontier answers ("no frontier route continues from here"): 48 prefixes. Push-only drives that took a wrong branch and got a grounded "pull back": 40.

## Targets with no safe route

- fixture-y → right_branch

## Findings (not failures)

### "My options" counts more ways than it names

The count is the number of option edges, but the vessels are deduplicated, so two edges on one vessel read as, for example, "2 good ways on from here: Aorta."

- none

### "Best next artery" on a route the rail wire can't steer

The assistant follows the top-ranked frontier route; the optimizer does not yet check steering (`cannot_steer` waits on a contract bump).

- ts-s1404-cta → lcca: best is `fem_l · soft_angled · e_l_iliac,e_aorta_1,e_lcca`; rail can't steer at n_b2 into e_lcca (takeoff 73° vs tip 45°)

## Not covered yet

- Hint counting and the "assisted" mark: see `tests/engine/cathy-hints.test.ts`. The Results mark is Aroovee's, after the demo.
- Voice command corpus, push-to-talk timing and hand clips: after PR #22 merges.
