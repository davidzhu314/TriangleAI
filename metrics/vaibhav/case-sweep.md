# Case sweep

**With contracts v2 and `cannot_steer`, every frontier route on every case is one the rail wire can steer, and every one drives cleanly to its target; the best route on every playable target scores 100 / 100 / 3★. Every V7 budget passes.**

- **Steering:** the three steep targets in David's new CT cases (`ts-s1336-cta` → lcca, `ts-s0727-cta` → both carotids: 85–98° takeoffs against the soft angled 45° tip) are now "no safe route" instead of offering routes the wire can't drive. `ts-s1404-cta` goes from 4 to 2 frontier routes per target. No generated case changes (type-iii demo included). Opening the steep targets needs a preset with a tip of about 75–100°, which changes `WirePresetId` (a contract): a to-all request, after the demo.
- **Timing:** optimize ≤ 1.6 ms per real case target (budget 50 ms), scoring well under 100 ms, rail step ≤ 0.1 ms per frame (1 ms).
- **Bigger graphs:** above 64 edges the optimizer uses Yen's k-shortest (k = 10): 100 ms at 264 edges (budget 500 ms), 112 ms with the steering check. **One thing to watch:** the steering check costs about 0.5 ms per otherwise-feasible route. That's nothing on today's cases, but on a graph just under 64 edges with many routes (the 6 × 6 grid: 150) it takes optimize from 27 ms to 105 ms, past the 50 ms budget. Before a much larger anatomy ships, check steering only on routes that could reach the frontier, or lower the Yen threshold.

How to rerun (plugged in): `SWEEP_OUT=metrics/vaibhav/case-sweep.md SWEEP_CASES_DIR=<cases folder> pnpm exec vitest run client/src/score/case-sweep.test.ts` (DECISIONS.md, "Case sweep before new anatomy").

## Per case

Cases: main's 10 cases, with contracts v2 and `cannot_steer`. Run 2026-11-07 on a win32 x64 laptop, Node v26.10.0, main thread, after a warm-up.

| Case | Edges | Target | Result | Frontier (steerable) | Safe candidates (steerable) | Optimize median | Drives clean / steerable | Score median (worst) | Plan / drive / stars (best route) | Rail tick mean |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| low-tort | 11 | rcca | frontier | 2 (2) | 2 (2) | 1.5 ms | 2 / 2 | 9.9 ms (9.9) | 100 / 100 / 3★ | 0.062 ms |
| low-tort | 11 | lcca | frontier | 2 (2) | 2 (2) | 0.963 ms | 2 / 2 | 8.1 ms (8.1) | 100 / 100 / 3★ | 0.055 ms |
| type-i-plaque | 11 | rcca | frontier | 4 (4) | 4 (4) | 2.3 ms | 4 / 4 | 8.6 ms (8.8) | 100 / 100 / 3★ | 0.061 ms |
| type-i-plaque | 11 | lcca | frontier | 2 (2) | 2 (2) | 1.7 ms | 2 / 2 | 10.0 ms (10.0) | 100 / 100 / 3★ | 0.055 ms |
| type-ii | 11 | rcca | frontier | 4 (4) | 8 (8) | 2.8 ms | 4 / 4 | 18.4 ms (20.5) | 100 / 100 / 3★ | 0.062 ms |
| type-ii | 11 | lcca | frontier | 4 (4) | 6 (6) | 2.1 ms | 4 / 4 | 18.7 ms (19.2) | 100 / 100 / 3★ | 0.061 ms |
| type-ii-tortuous | 11 | rcca | frontier | 4 (4) | 4 (4) | 2.0 ms | 4 / 4 | 9.5 ms (11.3) | 100 / 100 / 3★ | 0.077 ms |
| type-ii-tortuous | 11 | lcca | frontier | 2 (2) | 2 (2) | 2.3 ms | 2 / 2 | 10.6 ms (10.6) | 100 / 100 / 3★ | 0.064 ms |
| type-iii | 11 | rcca | frontier | 6 (6) | 6 (6) | 2.3 ms | 6 / 6 | 9.6 ms (10.9) | 100 / 100 / 3★ | 0.059 ms |
| type-iii | 11 | lcca | frontier | 4 (4) | 4 (4) | 2.2 ms | 4 / 4 | 9.9 ms (10.3) | 100 / 100 / 3★ | 0.058 ms |
| bovine | 10 | rcca | frontier | 6 (6) | 8 (8) | 2.4 ms | 6 / 6 | 5.1 ms (7.4) | 100 / 100 / 3★ | 0.065 ms |
| bovine | 10 | lcca | frontier | 4 (4) | 6 (6) | 2.5 ms | 4 / 4 | 7.2 ms (7.3) | 100 / 100 / 3★ | 0.054 ms |
| ts-s1404-cta | 9 | rcca | frontier | 2 (2) | 2 (2) | 2.0 ms | 2 / 2 | 9.5 ms (9.5) | 100 / 100 / 3★ | 0.061 ms |
| ts-s1404-cta | 9 | lcca | frontier | 2 (2) | 2 (2) | 1.5 ms | 2 / 2 | 8.3 ms (8.3) | 100 / 100 / 3★ | 0.048 ms |
| ts-s1336-cta | 10 | rcca | frontier | 2 (2) | 4 (4) | 1.9 ms | 2 / 2 | 8.2 ms (8.2) | 100 / 100 / 3★ | 0.049 ms |
| ts-s1336-cta | 10 | lcca | no safe route | — | — | 1.3 ms | — | — | — | — |
| ts-s0727-cta | 11 | rcca | no safe route | — | — | 1.3 ms | — | — | — | — |
| ts-s0727-cta | 11 | lcca | no safe route | — | — | 1.1 ms | — | — | — | — |
| fixture-y | 3 | left_branch | frontier | 2 (2) | 2 (2) | 0.108 ms | 2 / 2 | 0.727 ms (0.727) | 100 / 100 / 3★ | 0.010 ms |
| fixture-y | 3 | right_branch | no safe route | — | — | 0.121 ms | — | — | — | — |

## Scale

| Graph | Edges | Search | Optimize median, steering off | With the steering check on every feasible route | measureRoute median (one route) | Candidates |
| --- | --- | --- | --- | --- | --- | --- |
| 6 × 6 grid | 60 | all simple paths | 26.7 ms (budget 50) | 104.6 ms | 0.445 ms | 150 |
| 8 × 8 grid | 112 | Yen's k-shortest | 17.7 ms (budget 500) | 28.5 ms | 0.179 ms | 30 |
| 10 × 10 grid | 180 | Yen's k-shortest | 42.3 ms (budget 500) | 51.1 ms | 0.240 ms | 30 |
| 12 × 12 grid | 264 | Yen's k-shortest | 100.0 ms (budget 500) | 112.1 ms | 0.337 ms | 30 |

## Steering failures among safe candidates

None: every safe candidate route is steerable.
