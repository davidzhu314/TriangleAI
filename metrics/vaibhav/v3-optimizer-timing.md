# V3 — optimizer and re-rank timing

Written by `UPDATE_METRICS=1 pnpm exec vitest run client/src/optimize/rank.test.ts`. The same test asserts re-rank p95 < 16 ms and typical optimize median < 50 ms (spec §4.5, §4.9) on every CI run.

Machine: win32 x64, Node v26.10.0. Main thread, after a warm-up. Optimize is a cold call each time (fresh enumerator; graph prebuilt), so it includes path enumeration and every route's measures.

| What | Median ms | p95 ms | Max ms |
| --- | --- | --- | --- |
| Re-rank, 1000-route frontier, 5 weights | 0.562 | 1.329 | 9.195 |
| Re-rank, diamond frontier (3 routes) | 0.001 | 0.006 | 0.155 |
| Optimize, fixture-y → left | 0.154 | 1.560 | 1.560 |
| Optimize, diamond (4 paths × 3 presets) | 0.399 | 1.009 | 1.009 |
| Optimize, random graph, seed 11 | 2.531 | 3.642 | 3.642 |
| Optimize, grid 7 × 7 (84 edges, Yen k = 10) | 11.988 | 16.596 | 16.596 |
