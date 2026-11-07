# V2 — measureRoute timing

Written by `UPDATE_METRICS=1 pnpm exec vitest run client/src/optimize/measure-route.timing.test.ts`; the same test asserts p95 under one 60 Hz frame (16.7 ms) on every CI run.

Machine: win32 x64, Node v26.10.0. Main thread, after a 20-call warm-up; 200 calls per row. A Worker adds one postMessage round trip on top.

| Route | Edges | Length mm | Median ms | p95 ms | Max ms |
| --- | --- | --- | --- | --- | --- |
| fixture-y, entry → left | 2 | 150.0 | 0.101 | 0.301 | 0.761 |
| junction, parent → retro (120°) | 2 | 110.0 | 0.072 | 0.311 | 0.678 |
| chain, 1 edge (partial) | 1 | 101.7 | 0.055 | 0.138 | 0.288 |
| chain, 5 edges (partial) | 5 | 509.8 | 0.671 | 1.222 | 1.584 |
| chain, 10 edges (1 m, full) | 10 | 1019.8 | 0.829 | 1.528 | 1.938 |

buildGraph on the 1 m chain (10 edges, 3 zones, once per case load): median 15.456 ms, p95 17.323 ms.
