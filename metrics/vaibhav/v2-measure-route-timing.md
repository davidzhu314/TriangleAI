# V2 — measureRoute timing

Written by `UPDATE_METRICS=1 pnpm exec vitest run client/src/optimize/measure-route.timing.test.ts`; the same test asserts p95 under one 60 Hz frame (16.7 ms) on every CI run.

Machine: win32 x64, Node v26.10.0. Main thread, after a 20-call warm-up; 200 calls per row. A Worker adds one postMessage round trip on top.

| Route | Edges | Length mm | Median ms | p95 ms | Max ms |
| --- | --- | --- | --- | --- | --- |
| fixture-y, entry → left | 2 | 150.0 | 0.094 | 0.238 | 0.769 |
| junction, parent → retro (120°) | 2 | 110.0 | 0.065 | 0.218 | 0.597 |
| chain, 1 edge (partial) | 1 | 101.7 | 0.052 | 0.088 | 0.296 |
| chain, 5 edges (partial) | 5 | 509.8 | 0.360 | 0.713 | 1.878 |
| chain, 10 edges (1 m, full) | 10 | 1019.8 | 0.736 | 1.384 | 2.444 |

buildGraph on the 1 m chain (10 edges, 3 zones, once per case load): median 10.318 ms, p95 13.998 ms.
