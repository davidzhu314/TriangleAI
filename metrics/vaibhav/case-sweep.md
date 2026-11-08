# Case sweep

**Every V7 budget passes on every case and on graphs up to 264 edges; every route the rail wire can steer is driven cleanly and scores 100 / 100 / 3★. Three targets in David's new CT cases have no route any of today's wires can steer.**

- **Timing:** optimize ≤ 2.4 ms per target (budget 50 ms), scoring ≤ 32.3 ms worst (100 ms), rail step ≤ 0.1 ms per frame (1 ms). Above 64 edges the optimizer switches to Yen's k-shortest (k = 10), so it grows gently: 98 ms at 264 edges (budget 500 ms), about 20× the largest case today.
- **Drives:** every frontier route `steerableAt` accepts reaches its target with no wrong branch.
- **Steering gaps:** `ts-s1336-cta` → lcca and `ts-s0727-cta` → both carotids. The takeoffs are 85–98°, and the soft angled tip (45°) slides on down the aorta; no other preset has a safe route there. Until the optimizer's `cannot_steer` lands (contracts v2, waiting on David), the frontier offers those undrivable routes; after it, they're "no safe route". A preset with a tip of about 75–100° would open all three. Real practice uses reverse-curve shapes for steep arch takeoffs, but adding a preset changes `WirePresetId`, a contract, so it needs a request to all lanes, and its numbers would be illustrative like the others. After the demo.
- **Too bent, not too shallow:** on `ts-s1404-cta` → rcca, the Standard J's 60° tip points closer to the lcca than to the 36° brachiocephalic takeoff and enters the lcca. The soft angled wire covers that route.

How to rerun (plugged in): `SWEEP_OUT=metrics/vaibhav/case-sweep.md SWEEP_CASES_DIR=<cases folder> pnpm exec vitest run client/src/score/case-sweep.test.ts` (DECISIONS.md, "Case sweep before new anatomy"). Windows reported the laptop on battery for this run; an earlier run on battery ran about 5× slower and missed the budgets, this one met them all.

## Per case

Cases: the 10 cases on `lane/david` (PR #59: main's 8 plus `ts-s1336-cta` and `ts-s0727-cta`). Run 2026-11-07 on a win32 x64 laptop, Node v26.10.0, main thread, after a warm-up.

| Case | Edges | Target | Result | Frontier (steerable) | Safe candidates (steerable) | Optimize median | Drives clean / steerable | Score median (worst) | Plan / drive / stars (best route) | Rail tick mean |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| low-tort | 11 | rcca | frontier | 2 (2) | 2 (2) | 0.811 ms | 2 / 2 | 8.7 ms (8.7) | 100 / 100 / 3★ | 0.063 ms |
| low-tort | 11 | lcca | frontier | 2 (2) | 2 (2) | 0.692 ms | 2 / 2 | 7.5 ms (7.5) | 100 / 100 / 3★ | 0.051 ms |
| type-i-plaque | 11 | rcca | frontier | 4 (4) | 4 (4) | 1.6 ms | 4 / 4 | 7.6 ms (7.8) | 100 / 100 / 3★ | 0.052 ms |
| type-i-plaque | 11 | lcca | frontier | 2 (2) | 2 (2) | 1.3 ms | 2 / 2 | 8.8 ms (8.8) | 100 / 100 / 3★ | 0.054 ms |
| type-ii | 11 | rcca | frontier | 4 (4) | 8 (8) | 2.0 ms | 4 / 4 | 15.3 ms (17.9) | 100 / 100 / 3★ | 0.057 ms |
| type-ii | 11 | lcca | frontier | 4 (4) | 6 (6) | 2.4 ms | 4 / 4 | 15.7 ms (15.9) | 100 / 100 / 3★ | 0.061 ms |
| type-ii-tortuous | 11 | rcca | frontier | 4 (4) | 4 (4) | 1.5 ms | 4 / 4 | 7.8 ms (9.3) | 100 / 100 / 3★ | 0.069 ms |
| type-ii-tortuous | 11 | lcca | frontier | 2 (2) | 2 (2) | 1.6 ms | 2 / 2 | 9.1 ms (9.1) | 100 / 100 / 3★ | 0.060 ms |
| type-iii | 11 | rcca | frontier | 6 (6) | 6 (6) | 2.1 ms | 6 / 6 | 8.7 ms (10.5) | 100 / 100 / 3★ | 0.057 ms |
| type-iii | 11 | lcca | frontier | 4 (4) | 4 (4) | 2.0 ms | 4 / 4 | 8.5 ms (9.4) | 100 / 100 / 3★ | 0.053 ms |
| bovine | 10 | rcca | frontier | 6 (6) | 8 (8) | 1.7 ms | 6 / 6 | 4.0 ms (7.3) | 100 / 100 / 3★ | 0.052 ms |
| bovine | 10 | lcca | frontier | 4 (4) | 6 (6) | 2.0 ms | 4 / 4 | 6.6 ms (6.9) | 100 / 100 / 3★ | 0.048 ms |
| ts-s1404-cta | 9 | rcca | frontier | 4 (2) | 4 (2) | 1.1 ms | 2 / 2 | 30.0 ms (32.3) | 100 / 100 / 3★ | 0.098 ms |
| ts-s1404-cta | 9 | lcca | frontier | 4 (2) | 4 (2) | 1.1 ms | 2 / 2 | 27.7 ms (27.9) | 100 / 100 / 3★ | 0.098 ms |
| ts-s1336-cta | 10 | rcca | frontier | 2 (2) | 4 (4) | 1.0 ms | 2 / 2 | 9.1 ms (9.1) | 100 / 100 / 3★ | 0.055 ms |
| ts-s1336-cta | 10 | lcca | frontier | 1 (0) | 2 (0) | 1.1 ms | 0 / 0 | 27.0 ms (27.0) | — | 0.096 ms |
| ts-s0727-cta | 11 | rcca | frontier | 1 (0) | 2 (0) | 0.975 ms | 0 / 0 | 28.0 ms (28.0) | — | 0.087 ms |
| ts-s0727-cta | 11 | lcca | frontier | 1 (0) | 2 (0) | 0.936 ms | 0 / 0 | 25.9 ms (25.9) | — | 0.084 ms |
| fixture-y | 3 | left_branch | frontier | 2 (2) | 2 (2) | 0.326 ms | 2 / 2 | 0.706 ms (0.706) | 100 / 100 / 3★ | 0.025 ms |
| fixture-y | 3 | right_branch | no safe route | — | — | 0.116 ms | — | — | — | — |

## Scale

| Graph | Edges | Search | Optimize median | measureRoute median (one route) | Candidates |
| --- | --- | --- | --- | --- | --- |
| 6 × 6 grid | 60 | all simple paths | 28.2 ms (budget 50) | 0.409 ms | 150 |
| 8 × 8 grid | 112 | Yen's k-shortest | 19.1 ms (budget 500) | 0.185 ms | 30 |
| 10 × 10 grid | 180 | Yen's k-shortest | 40.8 ms (budget 500) | 0.260 ms | 30 |
| 12 × 12 grid | 264 | Yen's k-shortest | 98.1 ms (budget 500) | 0.313 ms | 30 |

## Steering failures among safe candidates

10 branch points where a safe candidate's wire can't steer. The tip enters the branch its direction is closest to, if within 25°. So a branch is reachable only by a tip within about 25° of its takeoff, and only if no other branch is closer to where the tip points. Today's tips: Soft angled 45°, Standard J 60°, Stiff straight 0°.

| Route | Should enter | Went into | Takeoff | Tip | Tips that could point in (takeoff ± 25°) |
| --- | --- | --- | --- | --- | --- |
| ts-s1336-cta → lcca: fem_r|soft_angled|e_r_iliac,e_aorta_1,e_aorta_2,e_lcca | lcca | aorta | 98° | 45° | 73–123° |
| ts-s1336-cta → lcca: fem_l|soft_angled|e_l_iliac,e_aorta_1,e_aorta_2,e_lcca | lcca | aorta | 98° | 45° | 73–123° |
| ts-s0727-cta → lcca: fem_r|soft_angled|e_r_iliac,e_aorta_1,e_aorta_2,e_lcca | lcca | aorta | 97° | 45° | 72–122° |
| ts-s0727-cta → lcca: fem_l|soft_angled|e_l_iliac,e_aorta_1,e_aorta_2,e_lcca | lcca | aorta | 97° | 45° | 72–122° |
| ts-s0727-cta → rcca: fem_r|soft_angled|e_r_iliac,e_aorta_1,e_aorta_2,e_aorta_3,e_bca,e_rcca | bca | aorta | 85° | 45° | 60–110° |
| ts-s0727-cta → rcca: fem_l|soft_angled|e_l_iliac,e_aorta_1,e_aorta_2,e_aorta_3,e_bca,e_rcca | bca | aorta | 85° | 45° | 60–110° |
| ts-s1404-cta → lcca: fem_r|soft_angled|e_r_iliac,e_aorta_1,e_lcca | lcca | bca | 73° | 45° | 48–98° |
| ts-s1404-cta → lcca: fem_l|soft_angled|e_l_iliac,e_aorta_1,e_lcca | lcca | bca | 73° | 45° | 48–98° |
| ts-s1404-cta → rcca: fem_r|standard_j|e_r_iliac,e_aorta_1,e_bca,e_rcca | bca | lcca | 36° | 60° | 11–61° |
| ts-s1404-cta → rcca: fem_l|standard_j|e_l_iliac,e_aorta_1,e_bca,e_rcca | bca | lcca | 36° | 60° | 11–61° |

4 of them are steeper than any of today's tips (up to 60°) can reach: the steepest needs a tip of at least 73°.
