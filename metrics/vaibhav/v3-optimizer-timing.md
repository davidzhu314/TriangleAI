# V3 — optimizer and re-rank timing

Written by `UPDATE_METRICS=1 pnpm exec vitest run client/src/optimize/rank.test.ts`. The same test asserts re-rank p95 < 16 ms and typical optimize median < 50 ms (spec §4.5, §4.9) on every CI run.

Machine: win32 x64, Node v26.10.0. Main thread, after a warm-up. Optimize is a cold call each time (fresh enumerator; graph prebuilt), so it includes path enumeration and every route's measures.

| What | Median ms | p95 ms | Max ms |
| --- | --- | --- | --- |
| Re-rank, 1000-route frontier, 5 weights | 0.830 | 1.264 | 1.447 |
| Re-rank, diamond frontier (3 routes) | 0.001 | 0.002 | 0.010 |
| Optimize, fixture-y → left | 0.285 | 0.962 | 0.962 |
| Optimize, diamond (4 paths × 3 presets) | 0.540 | 1.311 | 1.311 |
| Optimize, random graph, seed 11 | 2.941 | 5.151 | 5.151 |
| Optimize, grid 7 × 7 (84 edges, Yen k = 10) | 15.526 | 20.180 | 20.180 |
