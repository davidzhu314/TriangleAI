# Handoff — David: chain simulation for the Drive redesign (simulation half, first version)

What landed, on `lane/david-chain-sim` (draft PR, held for the merge freeze):
- **`physics-chain-lumen.ts`:** the vessel lumen as a union of tubes (centerline points with inscribed radii), with a grid for fast nearest-wall queries.
- **`physics-chain.ts`:** the device model, a pure, deterministic `stepChain(model, state, {push, rotate, device}, dt)`.
- **`physics-chain-imaging.ts`:** imaging, a pure `stepImaging`. Live frames at a pulse rate, last-image-hold with staleness, contrast, roadmap, totals.
- **`physics-chain-source.ts`:** `ChainWireSource`, behind the v2 `WireSource`, writing a v2 `EventLog`.
  - Extras through methods: `setDevice`, `setPulse`, `storeRoadmap`.
  - `chain()`: tip pose, both devices, imaging, hold staleness, risk.
  - `trace()`: a per-step record and branch-entry attempts, for review.
- **`physics-chain.test.ts`:** 10 tests.
- **Records:** `team/requests/to-all-from-david-contract-chain-sim.md` proposes v3. There's a DECISIONS.md line and a `client/src/wire/README.md` row.

## The interaction model

- **Two devices.** The guidewire and the catheter are separate. `device` selects which one push and rotate move. Each has an inserted length, a pre-shaped tip and a roll, and either can lead. The catheter straightens the wire's tip inside it, and the wire partly straightens the catheter's tip.
- **Insert and rotate are separate.** Push feeds length at the sheath. Rotate turns the hub roll at once; the tip roll follows by stick-slip. The shaft stores twist up to a limit that grows with inserted length and wall contact, then the tip turns with a short lag, so it can whip when contact drops.
- **The tip is a pose, not a cursor.**
  - `tipPose` gives position, tangent, curvature, tip roll and hub roll.
  - Which branch the tip enters follows from where its shaped tip points as it reaches the junction. On fixture-y, different rolls take different branches (tested).
- **The wall acts along the whole device.** Every link is kept inside the lumen by the smallest deflection from where it was heading, so the device slides along the wall.
  - Each node's load (N proxy) is the bend the wall forced on it, times that material's stiffness, plus any residual penetration.
  - The educational contact-risk index (0–100) integrates load, duration and pushing.
  - Neither is a measured or clinical force, nor an injury prediction.
- **Imaging decides what is known.**
  - Frames are captured only while fluoro is held, at 30, 15 or 7.5 frames/s.
  - On release, the last frame becomes the held image with its capture time. It never updates, and `heldIsStale` turns true once the device moves.
  - Contrast is separate: it opacifies frames for 1.5 s.
  - A roadmap can only be stored from a contrast frame, and it never refreshes.
  - Totals: fluoro seconds, activations, frames, simulated exposure units (not a dose), injections, and simulated contrast units (not mL).

## Role of the modeling reference

The ISMR 2026 tutorial (https://rosmed.github.io/ismr2026/catheter_model, repository `rosmed/flexible_catheter_simulation`) models a catheter in Gazebo/ROS2 as a serial chain: a base link, N−2 bending links with spring-damper universal joints (stiffness K, damping Kd, friction Kf), and a tip link.

- **Adopted:** that structure. The chain lives in joint space, with two-axis joints relaxing toward a rest bend.
- **Replaced:**
  - Gazebo's dynamics and mesh collision become a quasi-static sweep against the centerline lumen. It runs in the browser at about 0.2–1.8 ms a step.
  - Joint damping and friction become per-step relaxation and stick-slip torsion.
  - Two coaxial devices replace one catheter.
- **Not reused:** the repository has no license, so no code or meshes were copied. It would also need ROS2, Gazebo and 3D Slicer at run time.

## Approximations that remain

- **Statics:** quasi-static, with no inertia or damping dynamics. Feed transmits fully to the tip, with no axial friction loss.
- **Walls:** the vessel is rigid, and its lumen is the inscribed radius, narrower than a real non-circular lumen. Wide vessels overlap near junctions.
- **Blocked tip:** it folds distally; the shaft doesn't bow proximally while the tip stays put.
- **Calibration:** all constants are illustrative, uncalibrated, and not validated against bench or clinical data.
- **Drivability:**
  - With a simple steering driver, fixture-y reaches its target.
  - low-tort and type-iii did not reach the target in 120 s with that driver. The tip doubles into the contralateral iliac and needs better steering, or tuning.
  - Drivability on the arch cases is the next job. It isn't claimed.

## How it was verified

`vitest run client/src/wire/physics-chain.test.ts`: 10/10 pass. The full suite: 1039 passed, 4 skipped, 2 todo; `tsc` is clean.
- **Device:**
  - stays inside the lumen within 1 mm while pushed for 10 s on low-tort, and every link stays exactly 3 mm;
  - deterministic, bit for bit;
  - rotating the hub leaves the tip trailing, with more stored twist when deeper;
  - on fixture-y, eight rolls enter both branches;
  - pushing against resistance raises the wall load and the risk index;
  - feeding the catheter leaves the wire where it is.
- **Imaging:**
  - 30 frames in 1 s continuous, and 8 at 7.5/s; none with fluoro off;
  - the held image stays bit-identical while the device moves, and turns stale;
  - a roadmap is refused without a contrast frame, and is fixed once stored.
- **ChainWireSource:** writes 31 samples for 30 ticks, with fluoro flags and one contrast_puff.

Who switches:
- **Everyone:** answer the v3 request.
- **Aroovee:** the screen. It can prototype on this branch through `chain()`.
- **Vaibhav:** scoring and review wording for imaging efficiency together with contact. `trace()` has the data.
- **Gibran:** verification once it is wired.

Contracts version after this handoff: unchanged (2)
New dependencies: none
Decisions logged: DECISIONS.md 2026-11-08 "Chain simulation (browser physics approximation), on a branch"
