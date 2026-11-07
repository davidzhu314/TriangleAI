# V7 — rail step() timing

Written by `UPDATE_METRICS=1 pnpm exec vitest run client/src/wire/rail.timing.test.ts`. The same test asserts median step < 1 ms on every CI run (DECISIONS.md, "Engine timing budgets").

Machine: win32 x64, Node v26.10.0. Main thread, after a warm-up. Date of run: written by the test, 2026-11-07. Each case: every frontier route to every target, driven by the rail autopilot at 30 Hz; one untimed pass first. Only step() is timed (not the autopilot).

| Case | Drives | Steps in longest drive | Median ms/step | p95 ms/step | Max ms/step |
| --- | --- | --- | --- | --- | --- |
| fixture-y | 2 | 225 | 0.002 | 0.006 | 0.903 |
| straight | 3 | 151 | 0.001 | 0.002 | 0.120 |
| arc90 | 3 | 48 | 0.001 | 0.002 | 0.011 |
| helix | 3 | 308 | 0.001 | 0.002 | 0.060 |
| bend | 3 | 108 | 0.001 | 0.001 | 0.005 |
| y-branch | 2 | 165 | 0.001 | 0.002 | 0.470 |
| junction | 2 | 150 | 0.001 | 0.002 | 0.062 |
| diamond | 3 | 180 | 0.002 | 0.002 | 0.114 |

D6-min generated cases are not on main yet; they join this table when they land.
