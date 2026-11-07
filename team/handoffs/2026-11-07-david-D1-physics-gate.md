# Handoff — David D1: physics gate

What landed: the decision line in `DECISIONS.md`, **"Demo leads with physics"**, with three supporting lines (Euler integrator, physics environment, provisional phantom frame). Also `physics/README.md` (setup, probe, fallback); `physics/requirements-sim.txt`; probe scripts in `physics/probe/` (steps/s bench, integrator comparison, a §5.2 probe server with a blank three.js page, and a Playwright latency measurer); measurements in `metrics/david/d1/`; CathSim and its dependencies in `THIRD_PARTY.md`.
How to use: nothing changes for the app yet. To see it, follow `physics/README.md`, then open `http://127.0.0.1:8765/` while `probe/probe_server.py` runs.
Who switches: nobody yet. Aroovee: the demo script leads with physics, with rail as the fallback (spec §7.4 order unchanged). The Drive screen still gets its source only from `select.ts` (D5); until then, the rail and mock sources. Vaibhav: recorded runs (D4) will be real, so the §4.4 arch constraint and the two simulated measures stay in scope.
Mock replaced: none
Contracts version after this handoff: unchanged (1)
Tests: `pnpm test` and `pytest physics` (all green; pytest now ignores `physics/vendor`, `.venv` and `probe`). The gate numbers are measurements, not tests: `metrics/david/d1/SUMMARY.md`.
New dependencies: none in `package.json`. Physics process only (Python 3.9, not CI): `physics/requirements-sim.txt`.
Decisions logged: Demo leads with physics; the pass depends on the Euler integrator (stock CathSim: about 14 steps/s); physics environment; provisional phantom frame.
Known gaps: the probe is a spike, not the D5 server (no case serving, no fallback, no event log). Phantom meshes are not packaged yet (D3a): three of four exceed 60k triangles (phantom2 120k, phantom3 197k, phantom4 190k), CathSim ships no centerlines (VMTK needed), and its only license is the repo-level CC BY-NC-SA LICENSE, so each package must carry it. Which bodies make up `wire` (80 guidewire bodies, with the 4 tip bodies left out) is the probe's choice and D5 confirms it. Measured on this machine only.
