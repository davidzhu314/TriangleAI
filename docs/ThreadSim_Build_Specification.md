# ThreadSim — Build Specification for an AI Developer

> Markdown copy of `docs/ThreadSim_Build_Specification.docx` (the original). Claude Code reads this file. Where this spec and `PLAN.md` differ, the spec wins on product behaviour, `PLAN.md` on sequencing and ownership, and `DECISIONS.md` records every deliberate deviation.

Nov 7, 2026 · @Aroovee Bear

## 1. Overview

ThreadSim is a browser-first training game for endovascular procedures: the trainee plans a catheter route through a 3D vessel network reconstructed from CT, drives a simulated guidewire along it, and is scored against the best trade-off routes for risk and distance. This document is the build specification; an AI developer should be able to implement the product from it without other context.

### Users

| User | Goal | What they need from ThreadSim |
| --- | --- | --- |
| Trainee (medical student, resident, fellow) | Learn approach decisions and wire behavior before touching a patient | Cases, a route planner, a wire to drive, an explained score |
| Instructor | Assign practice, see who is struggling | Case assignment, class reports |
| Case author (educator, researcher) | Add their own anatomy | Import of a case package exported from 3D Slicer |

### In scope

- **3D vessel reconstruction:** load vessel networks from built-in templates or user-supplied case packages.

- **Catheter pathing:** compute every feasible route from an entry site to a target and the Pareto frontier of best trade-offs.

- **Catheter simulation:** drive a guidewire through the anatomy with push/pull and rotate controls, using physics where available and a simplified "rail" model otherwise.

- **Scoring:** grade the trainee's plan (risk, distance, feasibility, regret) and drive (wall force, fluoroscopy time, wrong branches).

- **Views:** desktop browser first; AR via WebXR as an enhancement.

### Out of scope (do not build)

- Clinical use, real patient planning or diagnosis.

- Realistic twist and torque mechanics, multi-device telescoping, deformable vessels.

- Raw DICOM ingestion or server-side segmentation in version 1.

- Haptic hardware.

### Design principles

These come from analysing Scrub+, the HackNC 2026 winner, and apply to every decision below.

- **Works with no special hardware:** a laptop browser and keyboard or gamepad are enough; headsets are optional.

- **Precompute heavy work:** segmentation, centerlines and physics runs happen offline and ship as static files.

- **Core never depends on a fragile service:** if the physics server is down, the rail wire and replays still work.

- **Every number has a formula:** no AI computes scores or routes; all metrics are deterministic and tested against an independent implementation.

- **Live feedback:** metrics update as the trainee builds a route, not only at the end.

- **Honest framing:** "decision trainer with simplified device mechanics"; improvements are simulated metrics, not proven clinical benefit.

## 2. Architecture

ThreadSim has one browser client that does planning, scoring and rendering, one optional Python physics server, and an offline toolchain that produces case packages. Everything the client needs to run a case is a static file.

system architecture · offline toolchain, browser client, optional physics

### Components

| Component | Runs where | Responsibility |
| --- | --- | --- |
| Offline case toolchain | Developer machine or 3D Slicer | CT → segmentation → meshes + centerline graph → case.zip; pre-recorded physics runs |
| Browser client | User's browser (desktop, phone, Quest browser) | Case loading and validation, 3D/AR rendering, route builder, optimizer, scoring, rail wire, replays |
| Physics server (optional) | Laptop or cloud, Python | Steps CathSim (MuJoCo) and streams wire state over WebSocket |

### Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Client language | TypeScript, Vite | Fast builds; same choice as Scrub+ |
| 3D and AR | three.js + WebXR | One codebase for browser and headset |
| Optimizer and scoring | TypeScript in a Web Worker | Small graph math; no server needed |
| Physics | CathSim on MuJoCo (Python 3.9), WebSocket bridge | Only open-source catheter simulator that installs with pip |
| Offline anatomy | TotalSegmentator (total task), 3D Slicer + SlicerVMTK, trimesh | Open source; centerlines from VMTK |
| Tests | Vitest (unit), Playwright (end to end), pytest (Python) | Every metric checked against an independent implementation |

### Repository layout

```text
threadsim/
  client/            # TypeScript app
    src/case/        # case package loader + validator
    src/render/      # three.js scene, X-ray shader, WebXR
    src/plan/        # route builder UI
    src/optimize/    # graph, measures, enumeration, frontier (Web Worker)
    src/score/       # plan + drive scoring, feedback text
    src/wire/        # rail model, physics client, replay player
    public/cases/    # built-in case packages
  physics/           # Python WebSocket server wrapping CathSim
  tools/             # offline: segmentation, centerlines, packaging, arch generator
  slicer/            # 3D Slicer export script
  tests/             # cross-checks, fixtures, Playwright flows
```

## 3. 3D vessel reconstruction

All anatomy enters ThreadSim as a **case package**: one zip with named vessel meshes, a centerline graph and metadata. Templates, the parametric generator and 3D Slicer exports all produce this same format, so the client has exactly one loader.

### 3.1 Offline pipeline (CT → case package)

- **Input:** a contrast CT angiogram (about 1 mm slices; routine CT is not good enough for vessels). De-identify before processing.

- **Segment:** TotalSegmentator total task, keeping only arterial classes (aorta, brachiocephalic trunk, subclavian, common carotid and iliac arteries). For smaller vessels, use SlicerVMTK vesselness filtering plus level-set segmentation with seed points.

- **Mesh:** marching cubes per vessel class (VTK or scikit-image). One mesh per named vessel.

- **Clean:** smooth (Taubin or windowed sinc) before decimating; keep each case under 100k triangles total.

- **Centerlines:** SlicerVMTK "Extract Centerline" or VMTK in Python, producing points with maximum inscribed radius every ~1 mm.

- **Tag:** entry sites (femoral left/right, radial left/right), targets, and optional risk zones as named points.

- **Package:** write case.zip (schema below) and run the validator (3.5).

### 3.2 Case package format

```text
case.zip
  case.json          # metadata, tags, risk zones
  vessels.glb        # one mesh node per vessel, node name = vessel id
  centerlines.json   # branching graph with radii
```

case.json:

```json
{
  "schema": "threadsim.case/1",
  "id": "arch-type2-001",
  "title": "Type II arch, right carotid target",
  "units": "mm",
  "axes": "RAS",
  "source": { "kind": "ct|parametric|cathsim", "dataset": "...", "license": "CC-BY-4.0" },
  "physics": { "available": true, "phantom": "phantom3" },
  "vessels": [ { "id": "aorta", "name": "Aorta", "kind": "artery" } ],
  "entries": [ { "id": "fem_r", "name": "Right femoral", "node": "n12" } ],
  "targets": [ { "id": "rcca", "name": "Right common carotid", "node": "n40" } ],
  "riskZones": [ { "id": "plaque1", "kind": "plaque|aneurysm|dissection|critical_branch",
                  "tier": "forbidden|heavy|proximity", "edge": "e7", "from_mm": 10, "to_mm": 35 } ]
}
```

centerlines.json:

```json
{
  "nodes": [ { "id": "n12", "pos": [x, y, z], "kind": "entry|branch|target|end" } ],
  "edges": [ { "id": "e7", "from": "n12", "to": "n13", "vessel": "aorta",
               "points": [[x, y, z], ...], "radii_mm": [r0, r1, ...] } ]
}
```

**Conventions:** case files use millimetres and RAS axes. The client converts once at load: divide by 1000 for metres (glTF and WebXR units) and rotate RAS to Y-up. points and radii_mm have equal length, spaced about 1 mm apart.

### 3.3 Built-in templates

| Template set | Count | Physics | Source and license note |
| --- | --- | --- | --- |
| CathSim arch phantoms | 4 (low_tort, phantom2, phantom3, phantom4) | Yes | CathSim repo; CC BY-NC-SA 4.0, research and demo only |
| Whole-body planning cases | 1–2 | No (rail wire only) | Public CT angiograms; confirm each dataset license |
| Parametric arches | Unlimited | No (rail wire only) | Generated; no license restrictions |

Each physics phantom ships its visual.stl (17,593–196,732 triangles, 10–22 cm across); convert to GLB and simplify to under 60k triangles.

### 3.4 Parametric arch generator

Generates teaching variants that are rare in public data. Inputs:

| Parameter | Values | Meaning |
| --- | --- | --- |
| arch_type | I, II, III | How far the great-vessel origins sit below the top of the arch; III is hardest |
| bovine | true/false | Brachiocephalic trunk and left common carotid share an origin |
| tortuosity | 0.0–1.0 | Added curvature along branches |
| diameters_mm | per vessel | Aorta ~25–35, carotids ~6–8 (editable) |
| risk_zones | list | Plaque or aneurysm segments to place |

Algorithm: build each vessel's centerline as a smooth 3D spline from control points set by the parameters; sweep a circle of the given radius along it to make a tube mesh; merge tubes at branch points; emit centerlines.json directly from the same splines, so the graph is exact. Seed the generator so cases are reproducible.

### 3.5 Import and validation

The client validates every package on load, in the browser, and never uploads it.

| Check | Rule | On failure |
| --- | --- | --- |
| Schema | case.json matches threadsim.case/1 | Reject with field-level message |
| Units | Largest aorta radius within 7–20 mm | Offer auto-rescale (×1000 or ÷1000) |
| Axes | axes present; preview shows head up | Toggle to flip; save choice |
| Graph | All entries connect to all targets; no zero-length edges | Highlight gaps; mark targets unreachable |
| Radii | One radius per point, all > 0 | Reject edge |
| Mesh budget | ≤ 100k triangles | Decimate in a Web Worker |
| Privacy | No patient fields; strip metadata | Remove silently, log a notice |
| Physics | physics.available only for known phantoms | Show "Planning only" badge |

### 3.6 3D Slicer export script

A Python script run in Slicer's Python console (later a Slicer extension):

- User selects a segmentation and marks entries, targets and risk zones with markup points.

- Script runs SlicerVMTK Extract Centerline on the arterial segments.

- Exports each segment as a mesh to one GLB (via trimesh or the OpenAnatomy exporter).

- Snaps markup points to the nearest centerline node.

- Writes case.json and centerlines.json and zips the package.

Acceptance: a case exported from Slicer loads in the client and passes validation with no manual edits.

## 4. Catheter pathing

The optimizer lists every feasible route from an entry site to a target, measures each one, and keeps the routes no other route beats on every measure (the Pareto frontier). It is deterministic geometry and search; no AI model is involved.

### 4.1 Vessel graph

Build an undirected graph from centerlines.json: nodes are entries, branch points and targets; edges are vessel segments carrying their centerline points and radii. Vessel trees have few cycles, so route choice comes mainly from **entry site × wire preset × path**, plus real loops (such as the Circle of Willis) where the anatomy has them.

### 4.2 Per-edge measures

For an edge with points p₀ … pₙ and radii r₀ … rₙ:

```latex
L = \sum_{i=1}^{n} \lVert p_i - p_{i-1} \rVert
```

```latex
\theta_i = \arccos\left( \frac{(p_i - p_{i-1}) \cdot (p_{i+1} - p_i)}{\lVert p_i - p_{i-1} \rVert \, \lVert p_{i+1} - p_i \rVert} \right), \quad \Theta_{\max} = \max_i \theta_i, \quad \Theta_{\Sigma} = \sum_i \theta_i
```

```latex
r_{\min} = \min_i r_i
```

Compute turning angles over a 5 mm window (not single 1 mm steps) so segmentation noise does not create false sharp turns. Also record which risk zones overlap the edge and the minimum clearance from the centerline to any proximity zone.

### 4.3 Wire presets

| Preset | Tip angle | Stiffness | Diameter |
| --- | --- | --- | --- |
| Soft angled | 45° | Low | 0.035 in (0.89 mm) |
| Standard J | 60° | Medium | 0.035 in |
| Stiff straight | 0° | High | 0.035 in |

Values are illustrative and must be labelled as such in the UI. Each preset defines a maximum turn it can enter and a minimum vessel diameter.

### 4.4 Hard constraints (route removed)

- Any edge with r_min × 2 smaller than the device diameter plus 1 mm clearance.

- Any turn sharper than the preset's maximum turn.

- Any edge inside a forbidden risk zone.

- Arch segment only: any preset × target pair whose pre-recorded CathSim runs never reached the target.

### 4.5 Route enumeration

- **Default:** exhaustive. For each entry × target × preset, list simple paths with depth-first search, capped at 50 per pair. Typical cases produce dozens of candidates and finish in under 50 ms.

- **Large graphs:** Yen's k-shortest paths (k = 10) on length, run per preset.

### 4.6 Route cost vector

Each route gets these values (sums over edges, or worst values where noted):

| Measure | Aggregation | Unit |
| --- | --- | --- |
| Length | Sum | cm |
| Sharpest turn | Max | degrees |
| Total turning | Sum | degrees |
| Narrowest point | Min | mm |
| Heavy risk crossings | Count | count |
| Proximity penalty | Sum of (1 − clearance / 10 mm), clamped at 0 | unitless |
| Simulated peak wall force (arch segment) | From pre-recorded runs | N |
| Simulated success rate (arch segment) | From pre-recorded runs | % |
| Estimated fluoro time | Length × seconds per cm + turns × seconds per turn | s |

### 4.7 Pareto frontier and ordering

- **Critical first:** compare routes by heavy risk crossings before anything else. A route with fewer crossings always ranks above one with more, whatever its length.

- **Frontier:** among routes with the fewest heavy crossings, route A is removed if some route B is at least as good on every measure and strictly better on one.

- **Labels:** tag the frontier routes with what each is best at ("shortest," "gentlest," "least radiation").

- **No safe route:** if every route crosses a heavy risk zone or fails a constraint, report "no safe route with this device" and suggest the change that would help (another entry, another preset).

### 4.8 Weighted ranking for display

The player sets weights w with sliders (summing to 1). Each measure is min–max normalised to 0–1 across the candidate set, then:

```latex
S(\text{route}) = \sum_k w_k \, \hat{c}_k(\text{route})
```

Lower is better. Weights change the order of the frontier, never which routes are feasible.

### 4.9 Acceptance criteria

- Measures match an independent NumPy implementation within 0.1 mm and 0.5° on all template cases.

- The frontier never contains a dominated route (property test over random cost vectors).

- Moving a weight slider re-ranks in under 16 ms.

## 5. Catheter simulation

The trainee drives a guidewire with two controls, push/pull and rotate, in one of three wire modes. Physics mode uses CathSim where a phantom supports it; rail mode works on every case; replay mode plays pre-recorded physics runs. The client switches to rail mode automatically if the physics server is unavailable.

### 5.1 Wire modes

| Mode | Where | How it works | Realism |
| --- | --- | --- | --- |
| Physics | 4 CathSim phantoms | Python server steps CathSim and streams wire points | Real bending, wall contact and buckling; no twist |
| Rail | All cases | Wire body follows the centerline; tip rules decide branch entry | Teaches decisions; scripted buckling |
| Replay | Cases with recorded runs | Plays a recorded physics run as reference | Physical, not interactive |

### 5.2 Physics mode (CathSim)

Facts from reading the CathSim code:

- Guidewire: 80 linked capsule bodies, each joint bending on two axes, stiffness decreasing toward the tip; pre-bent tip of 2–3 bodies.

- Controls: a slider actuator (push/pull) and a rotator actuator (rotate the whole wire).

- twist: false and stretch: false: no twist lag or whip.

- Timestep 0.004 s with 3 substeps (0.012 s simulated per control step). The author's thesis reports 40–80 steps per second, about 0.5–1.0× real time.

- Each phantom has two target sites: bca (brachiocephalic artery) and lcca (left common carotid).

- Contact forces are available for scoring.

Server requirements:

- Python 3.9 environment; install CathSim without its training extras where possible.

- WebSocket endpoint /wire; the client sends commands, the server replies with state at about 30 Hz.

- Keep CathSim code in its own directory and process; ThreadSim client code must not import or copy it (licensing, section 9).

Messages:

```jsonc
// client -> server
{ "type": "start", "phantom": "phantom3", "target": "bca", "preset": "standard_j" }
{ "type": "control", "push": 0.6, "rotate": -0.2 }      // each -1..1
{ "type": "stop" }

// server -> client, ~30 Hz
{ "type": "state", "t": 12.48, "wire": [[x,y,z], ...80], "tip": [x,y,z],
  "contact_force_n": 0.42, "at_target": false }
```

### 5.3 Rail mode

- State: the arc-length position s of the tip along the current path, the tip's roll angle φ, and the active edge.

- Push/pull changes s; rotate changes φ. The wire body is drawn along the centerline from the entry to s, with a small sinusoidal offset so it does not look like a perfect line.

- **Branch entry rule:** at a branch point, the tip enters the child branch whose direction is closest to the tip direction (the preset's tip angle, rolled by φ) if the angle between them is within 25°; otherwise it continues along the parent.

- **Scripted buckling:** pushing into a turn sharper than the preset allows, or pushing with the tip against a wall for more than 1 s, bows the wire into the larger vessel ("prolapse") and records an event.

- **Wall force proxy:** grows with push rate when the tip direction differs from the vessel direction by more than 30°.

### 5.4 Controls

| Input | Push/pull | Rotate | Fluoro (hold) | Contrast puff |
| --- | --- | --- | --- | --- |
| Keyboard | W / S | A / D | Space | C |
| Gamepad | Left stick Y | Right stick X | Right trigger | A button |
| WebXR controllers | Thumbstick Y | Thumbstick X | Trigger | Grip |

Apply a 0.15 dead zone to sticks. Fluoro is hold-to-activate so the radiation budget is never spent by accident.

### 5.5 Views

- **3D view:** translucent vessels, opaque wire, ghost trail of the planned route.

- **X-ray view (fluoro):** a 2D projection from a chosen C-arm angle. Draw the wire as a dark line; draw vessels only while a contrast puff is active (1.5 s fade), as a dark silhouette on a grey background. Implement as a shader with depth-based opacity; reading the real CT (digitally reconstructed radiographs) is a later upgrade.

- **Difficulty ladder:** beginner shows 3D always; intermediate dims 3D; expert shows only X-ray and contrast puffs.

### 5.6 Event log (input to scoring)

Record at 30 Hz: time, tip position, s, active edge, contact force, fluoro on/off. Record discrete events: wrong_branch, prolapse, back_out (s decreases by more than 20 mm), force_spike (force above threshold), contrast_puff, target_reached.

### 5.7 Acceptance criteria

- Rail mode reaches every target on every template case using the frontier routes.

- If the WebSocket fails or stalls for 2 s, the client switches to rail mode and shows a notice.

- Physics-mode frame-to-frame latency on the demo laptop is under 100 ms; if not, default to replay plus rail.

## 6. Scoring: risk and distance

Each attempt gets two scores: a **plan score** (was the chosen route a good one?) and a **drive score** (was it executed well?). Both come from formulas over the route measures in section 4 and the event log in section 5, and every number shown links back to its source measure.

### 6.1 Plan score

Checks run in this order; the first failing check caps the score.

| Step | Check | Result |
| --- | --- | --- |
| 1 | Feasible (passes all hard constraints)? | If not: plan score 0, show the violated constraint |
| 2 | Heavy risk crossings above the minimum available? | If yes: cap at 40, name the zone crossed and a safer alternative |
| 3 | On the Pareto frontier? | If not: cap at 80, name the route that dominates it |
| 4 | Regret at the player's own weights | Score from regret (below) |

Regret uses the normalised weighted cost S from section 4.8:

```latex
R = S(\text{player}) - \min_{\text{routes}} S, \qquad \text{PlanScore} = 100 \cdot \left(1 - \min\left(1, \frac{R}{R_{\max}}\right)\right)
```

where R_max is the regret of the worst feasible route. Also report the single measure that contributed most to R ("most of your penalty came from the 120° turn at the left subclavian").

### 6.2 Drive score

| Component | Formula | Weight |
| --- | --- | --- |
| Path fidelity | Mean distance from driven tip path to planned centerline; 0 mm → 100, ≥ 10 mm → 0 | 25% |
| Gentleness | Peak and cumulative contact force vs the frontier route's recorded values | 30% |
| Radiation | Fluoro seconds vs the route's estimated fluoro time; within estimate → 100 | 25% |
| Errors | −10 per wrong branch, −15 per prolapse, −5 per back-out (floor 0) | 20% |

Time is shown but not scored: rewarding speed teaches rushing and raises wall force.

```latex
\text{fidelity} = \frac{1}{N} \sum_{t=1}^{N} \min_{q \in \text{plan}} \lVert \text{tip}_t - q \rVert
```

### 6.3 Overall result

- Stars: 1 star for reaching the target, 2 for plan score ≥ 70 and drive score ≥ 60, 3 for both ≥ 85.

- Replay screen: the driven path over the best frontier route, with force spikes and wrong branches marked on the timeline.

### 6.4 Feedback text

Generate all feedback from templates filled with computed values, for example:

- "Route blocked: {vessel} narrows to {r_min} mm; {preset} needs {d_min} mm."

- "Your route was {ΔL} cm shorter but crossed {zone}. Route {B} avoids it."

- "You entered {wrong_vessel} {n} times; rotate the tip toward {target_vessel} before pushing at the branch."

An LLM may later rephrase this text for friendliness, but only if every number in its output appears in the computed results (reject and fall back to the template otherwise, as Scrub+ does with its grounding check).

### 6.5 Gamification rules

- **Radiation budget:** each case has a fluoro allowance; going over costs stars, not progress.

- **Unlock ladder:** low-tortuosity arch → type II → type III → bovine variant → whole-body planning cases.

- **Adaptive difficulty:** after two 3-star results, offer the next tier; after two 1-star results, suggest the guided mode.

- **Course use:** when instructors assign cases, grade on completion and effort, not on score, so no student is penalised by an assigned method or case difficulty.

### 6.6 Acceptance criteria

- Scores are reproducible: replaying the same event log gives identical scores.

- Unit tests cover each cap rule and each feedback template.

- Every number in the UI has a tooltip naming its formula.

## 7. User flows and screens

One case is one pass through five screens: Library → Plan → Compare → Drive → Results. The same screens run in the browser and, with WebXR, in AR.

### 7.1 Screens

| Screen | Shows | Key actions |
| --- | --- | --- |
| Library | Case cards: title, difficulty, "Physics" or "Planning only" badge, stars earned | Open case; import case.zip (drag and drop) |
| Case brief | Scenario card ("72-year-old, right carotid stenosis, Type III arch"), target, fluoro budget | Start planning |
| Plan | 3D vessels; entry and target markers; preset picker; live cost panel (length, sharpest turn, narrowest point, risk crossings) | Choose entry, choose preset, click branch points to build the route; warnings appear as the route is built |
| Compare | Frontier routes overlaid in distinct colours, the player's route highlighted, weight sliders, labels ("shortest," "gentlest") | Adjust weights; keep own route or switch to a frontier route |
| Drive | 3D or X-ray view, ghost trail, HUD: force meter, fluoro budget, distance to target | Push, rotate, fluoro, contrast puff; restart |
| Results | Plan score, drive score, stars, top feedback lines, replay timeline | Replay; retry; next case |

### 7.2 AR mode (WebXR)

- **Entry:** an "Enter AR" button appears only when navigator.xr supports immersive-ar; otherwise the button is hidden, never broken.

- **Placement:** hit-test a surface and place the vessel model at 50% scale (configurable to 1:1).

- **Manipulation:** grab to move, two-hand pinch or both grips to scale and rotate.

- **Plan in AR:** point and select a branch to add it to the route; the cost panel floats beside the model.

- **Drive in AR:** controllers map to push and rotate as in 5.4; the wire renders inside the translucent vessels.

- **Comfort:** keep a steady 72+ fps; drop to simplified meshes if frame time exceeds 14 ms.

### 7.3 Accessibility and robustness

- Every action has a keyboard path; no feature requires a headset, gamepad or webcam.

- Colour is never the only signal: frontier routes also differ in line pattern and label.

- A guided tutorial runs on the low-tortuosity arch with arrows and hints.

### 7.4 Three-minute demo script

- **0:00–0:20** Problem: simulators cost tens to hundreds of thousands of dollars and sit idle most of the year.

- **0:20–1:00** Plan: open the Type III arch case, build a route, watch live costs; the optimizer flags a 120° turn.

- **1:00–1:40** Compare: the frontier shows three routes; move the safety slider and the ranking changes.

- **1:40–2:20** Drive: physics wire in the arch, switch to X-ray view, puff contrast, reach the target.

- **2:20–2:45** Results: score, the one line of feedback that matters, replay against the best route.

- **2:45–3:00** Scale: import a case exported from 3D Slicer; close on the access gap.

## 8. Build plan

Build in eight phases, in order; each phase ends with a working app and passing tests, so the project is demoable at every stop. Phase 0 is a go/no-go gate for physics mode.

### Phase 0: Physics spike (gate)

- ☐ Install CathSim in an isolated Python 3.9 environment; run its manual-control command on phantom3.

- ☐ Measure steps per second over 60 s.

- ☐ Stream the 80 wire points to a blank three.js page over WebSocket.

Gate: ≥ 40 steps/s and < 100 ms latency → physics mode is in scope. Otherwise physics is replay-only and rail mode is primary.

### Phase 1: Case data

- ☐ Define the threadsim.case/1 schema (JSON Schema file) and the TypeScript types.

- ☐ Convert the four CathSim phantoms to case packages (simplified GLB, centerlines from VMTK, bca/lcca targets).

- ☐ Build one whole-body planning case from a public CT angiogram.

- ☐ Write the client loader and validator (section 3.5).

Acceptance: all five packages load and pass validation; a deliberately broken package produces each validation message.

### Phase 2: Render and plan

- ☐ three.js scene: translucent vessels, orbit controls, entry and target markers.

- ☐ Route builder: click branch points; live cost panel.

- ☐ Per-edge measures in a Web Worker.

Acceptance: measures match a NumPy reference within 0.1 mm and 0.5°; panel updates within one frame of each click.

### Phase 3: Optimizer

- ☐ Hard constraints, enumeration, cost vectors, frontier, labels, weighted ranking (section 4).

- ☐ Compare screen.

Acceptance: property test shows no dominated route on the frontier; a case with a forbidden zone never returns a route through it.

### Phase 4: Wire

- ☐ Rail mode with branch-entry rule and scripted prolapse.

- ☐ Physics client (if Phase 0 passed) with automatic fallback to rail.

- ☐ Replay player for recorded runs.

- ☐ X-ray view with contrast puffs.

Acceptance: section 5.7.

### Phase 5: Scoring and results

- ☐ Event log, plan score, drive score, stars, feedback templates, replay timeline.

Acceptance: section 6.6.

### Phase 6: Parametric generator and progression

- ☐ Arch generator (types I–III, bovine, tortuosity, risk zones) writing case packages.

- ☐ Unlock ladder and radiation budget.

Acceptance: generated cases pass validation; the same seed gives byte-identical packages.

### Phase 7: AR and import

- ☐ WebXR placement, manipulation, planning and driving (section 7.2).

- ☐ Drag-and-drop import of case.zip.

- ☐ 3D Slicer export script; one exported case committed as a fixture.

Acceptance: the Slicer fixture imports with no manual edits; AR runs at ≥ 72 fps on Quest 3 with the largest template.

### Phase 8: Hardening

- ☐ Playwright end-to-end test of the demo script (section 7.4) against the production build.

- ☐ Backup demo video recorded.

- ☐ Performance pass: initial load under 5 s on a laptop.

### Testing strategy

| Layer | Tool | What it proves |
| --- | --- | --- |
| Geometry and measures | Vitest + NumPy cross-check fixtures | Numbers are correct |
| Optimizer | Property tests | Frontier and constraints are sound |
| Scoring | Golden event logs | Scores are reproducible |
| Python physics bridge | pytest | Messages and fallback behave |
| Full flow | Playwright | The demo works end to end |

## 9. Constraints: licensing, privacy, regulation, claims

The hackathon build may use research-only components; a commercial product may not. Keep them separated from day one so the switch is a dependency change, not a rewrite.

### 9.1 Licenses

| Component | License | Commercial use | Rule for this project |
| --- | --- | --- | --- |
| CathSim code and phantoms | CC BY-NC-SA 4.0 | No, without the authors' permission | Separate process and directory; never copy its code or meshes into the client |
| MuJoCo, dm_control | Apache 2.0 | Yes | Basis for a future in-house wire model |
| stEVE | MIT | Yes | Optional alternative; needs SOFA |
| SOFA, BeamAdapter | LGPL (some SOFA parts GPL) | Yes, with conditions | Server-side only; avoid GPL parts |
| PyElastica | MIT | Yes | Research prototypes only |
| TotalSegmentator | Apache 2.0 code; total task free for any use; some subtasks licensed | Yes for total | Use the total task only |
| 3D Slicer, VMTK, three.js | Permissive | Yes | Keep notices |
| Vascular Model Repository models | Per-model license files | Unclear | Do not ship without checking each model |

Maintain THIRD_PARTY.md listing every dependency and asset with its license.

### 9.2 Privacy

- The client never uploads case packages; import and validation run in the browser.

- No DICOM import in version 1. Case packages contain no patient identifiers; the validator strips metadata.

- Server-side CT processing (later) requires de-identification, including defacing head scans, and data agreements.

- With schools and universities: FERPA applies; for under-13 users, COPPA. Data from school use may be used only for educational purposes unless agreements allow de-identified aggregate research.

### 9.3 Regulation

The FDA lists software intended for health care providers to use as educational tools for medical training as not a medical device. ThreadSim stays in that category only while it is not used to plan real patients' procedures. Do not add features that present a real patient's plan as clinical guidance.

### 9.4 Claims the product may and may not make

| May say | Must not say |
| --- | --- |
| "Decision trainer with simplified device mechanics" | "Realistic catheter simulation" |
| "Better simulated metrics on this route" | "Safer for patients" or "clinically validated" |
| "Risk weights are illustrative" | "Optimal route" without the trade-offs shown |
| "Built on CathSim (research use)" | Presenting CathSim's physics as the team's own |

### 9.5 Patents

Simbionix holds a US patent on patient-specific endovascular simulation from CT. A freedom-to-operate review by a patent attorney is required before commercial launch of patient-specific features.

## 10. Scaling and monetization

ThreadSim's opening is the frequency gap: simulators exist but trainees rarely get time on them. The business keeps trainee access free and charges institutions and device makers, because that is where simulation money is already spent.

### 10.1 The gap

- High-fidelity endovascular simulators historically cost about $200,000 in capital; a 2025 order of 12 compact Mentice units plus software came to $630,000.

- In a 2024 French survey, 58% of vascular surgeons had access to a simulation lab, but only 17% had sessions 1–3 times a year.

- A 2023 systematic review found simulation training reduced procedure and fluoroscopy times, while calling for stronger trials on clinical outcomes.

- ThreadSim targets the time between simulator sessions and the decisions made before a wire is touched. It does not replace haptic simulators.

### 10.2 Scaling path

| Dimension | Version 1 | Next | Main blocker |
| --- | --- | --- | --- |
| Anatomy | Templates + parametric arches | Slicer import, then server pipeline (CT → case package) | De-identification, dataset licenses |
| Physics | CathSim on 4 phantoms | In-house MuJoCo wire model (Apache 2.0) with automatic collision geometry | Engineering time; device calibration |
| Procedures | Arch to carotid / brachiocephalic | Renal, iliac crossover, coronary, neuro | Clinician review per procedure |
| Devices | 3 illustrative presets | Catheter over wire; manufacturer-calibrated libraries | Twist-capable physics |
| Platforms | Browser + WebXR | Physics in WebAssembly or cloud | Latency |
| Evidence | None | Face validity → expert vs novice → resident pre/post study → randomized transfer study | Clinician and resident time |
| Hardware (optional) | None | Near-infrared "Access" module mapping superficial forearm veins for access-site training | Shallow depth (about 3–5 mm); skin-tone variability |

### 10.3 Revenue models

| Model | Buyer | Offer | Priority |
| --- | --- | --- | --- |
| Device-company content | Medtech firms | Branded device presets and cases for physician onboarding | 1: Mentice earns most of its revenue from the medical device industry |
| Course or department license | Residency programs, simulation centres | Assignments, class reports, competency dashboards | 2: after a pilot with outcome data |
| Society and CME partnerships | Vascular, IR, cardiology societies | Pre-course preparation for hands-on workshops | 3: credibility and distribution |
| Grants | Foundations, global-health programs | Free deployment in low-resource training | Funds access, not profit |
| Individual premium | Trainees | Extra cases, analytics | Low; growth only |

Pricing hypothesis to test: $5–15 per enrolled student per year, sold per course or department (an 800-student course at $10 is $8,000, small enough to avoid campus-wide procurement).

### 10.4 Prerequisites for revenue

- Replace CathSim with a commercially licensable physics base, or license CathSim from its authors.

- Replace research-only phantoms with commercially licensed or generated anatomy.

- Pass institutional security review: LTI 1.3 for Canvas, a HECVAT and a VPAT for universities.

- Run a pilot that produces outcome evidence.

## 11. Rules for the AI developer

Follow the phases in section 8 in order, keep the app runnable after every phase, and treat the acceptance criteria as the definition of done.

### Do

- Read sections 3–6 fully before writing code; they define the data formats and formulas.

- Write the JSON Schema and TypeScript types for the case package first; generate fixtures from them.

- Implement every metric twice: once in TypeScript for the app, once in a small NumPy script for cross-checking; commit the comparison fixtures.

- Keep CathSim in physics/, in its own environment and process, communicating only over the WebSocket protocol in 5.2.

- Make every fallback automatic: physics → rail, WebXR → 3D view, gamepad → keyboard.

- Label illustrative values (wire presets, risk weights) as illustrative in the UI.

- Log performance (frame time, optimizer time, physics latency) to a metrics/ folder.

- When a requirement is ambiguous, choose the simpler option, record the choice in DECISIONS.md, and continue.

### Don't

- Don't use an AI model to compute routes, scores, measures or feedback numbers.

- Don't copy CathSim code or meshes into the client or into any commercial-track directory.

- Don't add DICOM import, server uploads, user accounts or analytics in version 1.

- Don't reward speed in scoring.

- Don't claim clinical realism or patient benefit anywhere in the UI or README.

- Don't block the app on optional hardware or services.

### Definition of done (version 1)

- ☐ Five or more cases load from the library: four physics phantoms and at least one planning case.

- ☐ Plan → Compare → Drive → Results works on every case, in rail mode at minimum.

- ☐ The optimizer returns a non-dominated frontier and handles "no safe route."

- ☐ Plan and drive scores are reproducible from saved event logs.

- ☐ All metric cross-checks pass; Playwright runs the demo script green.

- ☐ AR mode works on Quest 3 browser at ≥ 72 fps, or is hidden where unsupported.

- ☐ THIRD_PARTY.md, DECISIONS.md and a README with honest claims exist.

### Open questions for the human team

- Which public CT angiogram datasets have licenses that fit the intended use?

- Should the hackathon demo lead with physics mode (if Phase 0 passes) or rail mode?

- Who on the team reviews anatomy and scoring rules with a clinician before the demo?

## 12. Sources

CathSim (github.com/airvlab/cathsim), stEVE (github.com/lkarstensen/stEVE) and Scrub+ (github.com/avidnerd/hack-nc) were cloned and their code, configs, licenses and meshes read directly. CathSim was not executed.

**Physics and simulation**

- [CathSim paper](https://aitopics.org/doc/arxivorg:0F2C8ABB) · [CathSim author thesis (speed)](https://arxiv.org/pdf/2512.18081)

- [stEVE paper](https://www.sparc.tf.fau.de/2025/09/18/publication-of-the-steve-paper-in-computers-in-biology-and-medicine/) · [SOFA BeamAdapter](https://www.github.com/sofa-framework/BeamAdapter) · [MuJoCo license](https://cloudsmith.com/navigator/pypi/mujoco)

- [Seldinger technique simulator](https://rivic.ac.uk/research/Publication/real-time-seldinger-technique-simulation-complex-vascular-models.html)

**Anatomy and AR**

- [TotalSegmentator v2 classes](https://www.github.com/wasserth/TotalSegmentator/blob/master/resources/improvements_in_v2.md) · [TotalSegmentator subtasks and licenses](https://gitee.com/151706061/TotalSegmentator)

- [SlicerVMTK](https://github.com/vmtk/SlicerExtension-VMTK) · [OpenAnatomy glTF export](https://github.com/PerkLab/SlicerOpenAnatomy/blob/ce61de8995aebdbf0ff0e7293f6d41aef1019568/OpenAnatomyExport/OpenAnatomyExport.py)

- [vtk.js AR on headsets](https://kitware.com/create-medical-visualizations-on-augmented-reality-headsets-with-vtk-js) · [model-viewer](https://github.com/yiyix/model-viewer)

- [3D forearm vein reconstruction with NIR stereo](https://puma.ub.uni-stuttgart.de/bibtex/21abe24cfc379c0e2a65bfc62d52897d8/imt) · [NIR vein imaging depth](https://jbpe.ssau.ru/index.php/JBPE/article/download/9246/3432)

**Competitors and benchmark project**

- [Mentice VIST G7](https://www.mentice.com/news/mentice-launches-seventh-generation-platform-aimed-to-transform-endovascular-therapy) · [ANGIO Mentor](https://surgicalscience.com/simulators/angio-mentor/) · [CathLabVR](https://elevatehealth.net/solutions/brands/cathlabvr)

- [Scrub+ on Devpost](https://devpost.com/software/scrub-d67fm5)

**Cost, access and evidence**

- [EVToday 2008: simulator cost](https://evtoday.com/articles/2008-july/EVT0708_01-php) · [Mentice $630k order](https://www.mentice.com/news/mentice-has-received-a-630-000-usd-order-for-simulation-solutions-from-a-top-20-global-medtech-company)

- [France 2024 simulation survey](https://api-pubmed-ncbi.laibokeji.com/39013488) · [Gomaa et al. 2023 systematic review](https://pesquisa.bvsalud.org/bvsms/resource/pt/mdl-36906131)

- [Topalli et al. 2025: gamification](https://gcris2.cankaya.edu.tr/entities/publication/4d6a4d2a-a560-4cef-b37e-daa75b06f50a)

**Business and regulation**

- [Mentice Q2 2026 interim report](https://storage.mfn.se/3f22f8f6-ba4a-4586-a59f-509298f521d8/mentice-interim-report-2026-q2-eng-vfinal.pdf)

- [FDA: software functions that are not medical devices](https://www.fda.gov/medical-devices/device-software-functions-including-mobile-medical-applications/examples-mobile-apps-are-not-medical-devices)

- [Simbionix patent on patient-specific simulation](https://uk.3dsystems.com/press-releases/simbionix-revolutionary-patient-specific-simulation-procedure-rehersal-studio-receives-first-of-its-kind-us-patent)

- [VCU Canvas tool requirements (LTI 1.3, HECVAT, VPAT)](https://learningsystems.vcu.edu/canvas/canvas-3rd-party-tools/request-a-canvas-3rd-party-tool)