# Handoff — David D4: no recorded runs

What landed: no data. A `DECISIONS.md` entry records that D4 was tried and produced no usable runs. `physics/recorded-runs.json` and the replay files are **not** written, and none are coming.
How to use: nothing to import. Keep using only what exists today. The §4.4 arch-only constraint and the two simulated §4.6 measures (peak wall force, success rate) stay dropped ("Recorded runs are real or absent").
Who switches:
- **Vaibhav:** nothing changes. Don't wait for `recorded-runs.json`. Your recorded-runs mock stays a test fixture only, and the rail-proxy gentleness reference stays as it is.
- **Aroovee:** nothing changes. The Plan screen keeps not showing simulated success rate or peak force.
Mock replaced: none
Contracts version after this handoff: unchanged (1)
Tests: no code changed. `pnpm test` and pytest are unaffected.
New dependencies: none
Decisions logged: "D4 recorded no runs; `physics/recorded-runs.json` is not written."
Known gaps: listed below.

## What happened

- **Attempts:** I drove CathSim on the four D3a phantoms × `bca`/`lcca` with three drivers:
  - centerline-following steering;
  - a sampling driver that tries six roll angles in CathSim before each move;
  - CathSim's own random policy.
  
  The setup was D1's: `MUJOCO_GL=disable`, Euler, CathSim `adfabb2`.
- **Result:** none reached a target within 30–60 s of simulated time. The wire stalls at the top of the arch near the great-vessel ostia. The closest approach was 12 mm (success is 4 mm). Insertion was not the limit, and the stock `implicitfast` integrator stalls at the same spot.
- **Why nothing was recorded:** all-failure recordings would make §4.4 drop every phantom route and would publish spike-dominated forces, so nothing was recorded. RL training (CathSim's SAC) is a possible later stretch, not planned.

## For D5 (live physics server)

- **Contact force:** the D1 probe's rule only counted contacts within 2 mm. CathSim's contact margin is 4 mm, so the probe can report 0 N while the wire is actually held against the wall at about 1.5 N. The live server must sum the normal force (`mj_contactForce`) over **every** contact between a wire geom and a non-wire geom. Phantom geoms are named `<phantom>//unnamed_geom_N`, not `phantom/…`.
- **Force spikes:** expect single-step spikes in the kN range from the 4 mm margin, worse with fast wire spin. Smooth or average any force shown to the player (for example per 1/30 s frame) rather than showing raw step values.
- **Frame:** unchanged from D3a. Send CathSim world positions as they are, and don't reuse the D1 probe's frame conversion.

## Demo risk

- **The risk:** scripted and random driving both stalled at the arch apex on every phantom tried. D1 only checked speed and latency, not whether a person can reach a target.
- **What to do:** before relying on "demo leads with physics", rehearse a live phantom drive to a target. If it can't be reached, the demo beat should lead with rail.
