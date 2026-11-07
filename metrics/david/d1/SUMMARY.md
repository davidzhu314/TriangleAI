# D1 physics gate — measurements (2026-11-07)

Machine: Apple M3 Pro, macOS 14.4, arm64 (assumed to be the demo laptop; re-run the probe if the demo machine changes). CathSim commit adfabb2, MuJoCo 2.3.7, dm_control 1.0.14, CPython 3.9.25. One control step = 0.012 s simulated (0.004 s × 3 substeps). Timebox started 02:57; measurements finished 03:18.

| Measure | Gate | Stock CathSim (implicitfast) | Euler integrator |
| --- | --- | --- | --- |
| Control steps/s, phantom3, 60 s | ≥ 40 | 13.6 | 192.9 (2.3× real time) |
| Control steps/s, low_tort / phantom2 / phantom4, 15 s each | ≥ 40 | 14.2 / 14.4 / 14.2 | 250.4 / 272.9 / 206.3 |
| Push → visible tip motion in Chromium, p50 / p95 / max | < 100 ms | 184 / 321 / 323 ms | 18 / 34 / 35 ms |
| State frame interval in Chromium, p50 / p95 / max | < 100 ms | 75 / 350 / 359 ms | 36 / 38 / 72 ms |
| Server: control received → next state sent, p50 / max | — | 70 / 355 ms | 22 / 36 ms |
| Sim time vs wall time in the live run | real time | 4.5 s in 30 s | 36.4 s in ~37 s |

Euler vs stock on phantom3, 400 identical control steps: both finite, wire links stay at 2 mm, tip travel 0.266 m vs 0.262 m, tip divergence mean 0.2 mm, p95 1.0 mm, max 2.3 mm.

Wire: 80 guidewire bodies plus 4 tip bodies; the probe sends the 80 guidewire bodies as `wire` and the tip head as `tip`. Peak contact force seen in the live run: 5.1 N.

Raw lines: the `.json` / `.jsonl` files beside this one.
