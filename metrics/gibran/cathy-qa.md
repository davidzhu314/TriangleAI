# G4 — Cathy QA: answer grounding

Written by `UPDATE_METRICS=1 pnpm exec vitest run tests/engine/cathy-grounding.test.ts`. Machine: darwin arm64, Node v22.23.4. Main thread, after a warm-up. Date of run: 2026-11-08.

Every bundled case (`low-tort`, `type-i-plaque`, `type-ii`, `type-ii-tortuous`, `type-iii`, `bovine`, `ts-s1404-cta`, `fixture-y`), every target, at DEFAULT_WEIGHTS. 1354 spoken lines checked over 50 rail drives and every entry × wire × route prefix. All checks in `tests/engine/cathy-grounding.test.ts` pass: every number is in the line's values, every artery named is on a frontier route (or safe candidate), "best" follows the top-ranked route, live lines match scoreCase, and the same input gives the same line. No LLM is involved.

Off-frontier answers ("no frontier route continues from here"): 48 prefixes. Push-only drives that took a wrong branch and got a grounded "pull back": 40.

## Targets with no safe route

- fixture-y → right_branch

## Findings (not failures)

### "My options" counts more ways than it names

The count is the number of option edges, but the vessels are deduplicated, so two edges on one vessel read as, for example, "2 good ways on from here: Aorta."

- none

### "Best next artery" without the graph, on a route the rail wire can't steer

Without `graph`, the assistant follows the top-ranked frontier route even when the wire can't steer it. With `graph` (#51), the test checks that "best" is always steerable: 319 plan states, all passing. Callers should pass `graph`.

- ts-s1404-cta → lcca: best is `fem_l · soft_angled · e_l_iliac,e_aorta_1,e_lcca`; rail can't steer at n_b2 into e_lcca (takeoff 73° vs tip 45°)

### Frontier routes the rail wire can't steer (skipped by the live-answer drives)

The optimizer doesn't check steering yet (the `cannot_steer` contract bump), so these frontier routes are offered but undrivable on rail.

- ts-s1404-cta → rcca: `fem_l · standard_j` at n_b2 into e_bca (takeoff 36° vs tip 60°)
- ts-s1404-cta → rcca: `fem_r · standard_j` at n_b2 into e_bca (takeoff 36° vs tip 60°)
- ts-s1404-cta → lcca: `fem_l · soft_angled` at n_b2 into e_lcca (takeoff 73° vs tip 45°)
- ts-s1404-cta → lcca: `fem_r · soft_angled` at n_b2 into e_lcca (takeoff 73° vs tip 45°)

### Targets with no steerable frontier route at all

- none

### Where Cathy says "try another wire or entry" (with the graph, at the start of planning)

- ts-s1404-cta → rcca, fem_r · standard_j: "This wire can't steer into any of the ways on from here; try another wire or entry."
- ts-s1404-cta → rcca, fem_l · standard_j: "This wire can't steer into any of the ways on from here; try another wire or entry."
- ts-s1404-cta → lcca, fem_r · soft_angled: "This wire can't steer into any of the ways on from here; try another wire or entry."
- ts-s1404-cta → lcca, fem_l · soft_angled: "This wire can't steer into any of the ways on from here; try another wire or entry."

## Not covered yet

- Hint counting and the "assisted" mark: see `tests/engine/cathy-hints.test.ts`. The Results mark is Aroovee's, after the demo.
- Voice command corpus, push-to-talk timing and hand clips: after PR #22 merges.
