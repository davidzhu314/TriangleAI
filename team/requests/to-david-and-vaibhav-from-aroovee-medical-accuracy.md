# Request — to David and Vaibhav from Aroovee: user-supplied scans, 3D vessel segmentation and measured accuracy (after the demo)

What I need: a plan, then a build, that lets a user bring their own CTA (later MRA) scan, get a 3D vessel model that they can correct in Cathy, and see how accurate that model is. Every accuracy number must be measured against ground truth, not assumed. Below is a phased prompt for your Claude Code sessions. Please read it, adjust it and answer with your owners and order.
Why: today every case is either generated or one of three hand-checked TotalSegmentator subjects (`slicer/README.md`). Four of the subjects we tried failed at export (masks not touching, snap distance, unsafe arch node). So the pipeline works, but it isn't yet robust to arbitrary data, and nothing tells the user how far to trust the geometry or Cathy's answers about it.
Where: `slicer/`, `tools/`, `physics/server/`, `client/src/case/` (David); `client/src/optimize/`, `client/src/score/` and `client/src/input/voice/` facts (Vaibhav); `tests/engine/` (Gibran); the screens (me). Contract changes go through a to-all request.
Needed by: not blocking. Post-demo work, in phases.
Meanwhile: I'll mock the screens (an upload, a quality card, a correction tool) against a fake quality report until the contract lands.

**Update, 2026-11-15:** I built Phase 0 in my own lane, in `client/src/ui/scan-accuracy/` (see its README, `DECISIONS.md` 2026-11-15, and `metrics/aroovee/scan-accuracy/summary.md`). It scores a classical stand-in pipeline, not the Slicer export. What I still need from you: David, run the Slicer export on a phantom volume and score it with `scoreAgainstTruth`; Vaibhav, look at the junction finding (route verdicts change because branch take-off angles are off by 14 to 24°, and the engine's 5 mm steering window sits inside the aorta) and say whether take-off should be measured at the ostium for imported scans.

---

## The prompt (paste into your Claude Code session)

> You are planning and building the feature that lets Cathy turn a user's own scan into a case, and makes Cathy's geometry and answers measurably accurate. Read `CLAUDE.md`, `DECISIONS.md`, `slicer/README.md`, `client/src/contracts/index.ts` and this request first. Work in your own lane. Anything outside it is a request. Phase 0 comes first and gates the rest: **no accuracy claim ships before the harness that measures it**.

### What the three papers give us (and what they don't)

| Paper | Idea we take | Caveat |
| --- | --- | --- |
| **iVesseger** (Li et al., *Biomed. Signal Process. Control*, 2025) | Interactive 3D vessel segmentation in four steps: (1) pre-segment with a network; (2) the user clicks over- or under-segmented regions, and a **spatial grayscale ray** along the click finds the 3D point; (3) **local image enhancement** around that point; (4) **iterative fine segmentation** (their HCS-Net). Scored with Dice, MCC, **clDice** (topology), **Average Hausdorff Distance** and skeleton similarity (ESA/PDS). They report Dice and MCC above 0.94, faster than manual annotation. | Their headline numbers are on mouse-brain microscopy at 1 µm. On human data (MIDAS brain MRA, 0.5×0.5×0.8 mm; 3Dircadb liver CT, 1 mm), they validated mostly qualitatively. We take the **workflow and the metrics**, not their numbers. |
| **Wu et al.** (*J. Med. Imaging* 11(2):024002, 2024) | **Digital-phantom validation:** a vascular phantom with known geometry, a virtual scanner that images it at chosen spatial resolution and SNR, and the pipeline run on the result, so every error is measured against true values. Their key finding: **spatial resolution of the segmentation images is what matters**. SNR mattered little in their range. | A rat-kidney phantom and DCE-MRI. They say a human use needs a modified phantom. We already have one: our generator's known geometry. |
| **VascuViz** (Bhargava et al., *Nat. Methods*, 2022) | **Multimodal, multiscale co-registration:** the same vessels imaged in MRI, CT and optical, with one labelling step, so the modalities can be compared and fused. | Ex vivo murine tissue with special contrast agents. For us it's the *idea* of checking one modality against another (for example, CTA against MRA of the same subject). Stretch only. |

### What past simulators teach us, and where we can do better

| Simulator | What it does well (take it) | What it leaves open (improve on it) |
| --- | --- | --- |
| **CathSim** (AIR Lab; [docs](https://airvlab.github.io/cathsim/docs/introduction/); our `physics/` already runs it on MuJoCo) | The guidewire is a segmented body with a **softer tip**, joined by revolute or spherical joints, with capsule collisions: cheap and real-time. Vessel meshes are made collision-ready with **V-HACD convex hulls**. **Validated against hardware:** the simulator's force distribution was compared with a real robot's (Mann-Whitney test) on a half-body silicone phantom, and there were animal trials (pigs, brachiocephalic and left common carotid targets) under bi-planar X-ray. A 10-person novice user study rated anatomical accuracy highest (4.57/5) and **visual realism lowest (3.67/5)**. | **Anatomy comes from silicone phantoms, not patient scans**, so it's one fixed geometry. Its walls are rigid and blood is modelled as Newtonian, with **no sliding friction** in the actuation. Validation covers *forces*, not *geometry*. Convex decomposition can close narrow lumens and small branches, and the docs don't measure how much. → Our user-scan pipeline gives patient-specific anatomy. Phase 0 measures the **mesh-simplification error** (hull or decimated mesh vs. the mask). Our forces stay labelled a contact-load proxy. |
| **Pescio et al.** ([repo](https://github.com/matteopescio/A-simulation-environment-for-endovascular-interventions), MIT; *Int J CARS* 20:2259–2267, 2025) | SOFA with **BeamAdapter** (beam and Kirchhoff-rod catheters). **Deformable FEM aorta and aneurysm**, where the material model is a switch: Elastic, Ogden, Mooney-Rivlin, Neo-Hookean. A **centerline-based virtual fixture** (close to our rail mode). A clean **per-step log**: insertion speed and length, rotation, tip position and orientation, tip–wall force, force modulus, tip–target distance. | It loads a **"simplified" hand-made aorta mesh** and names no segmentation source. The README reports no validation or results (the paper is paywalled; we couldn't read it). → We feed the same ideas *our* scan-derived geometry. We adopt a matching log schema so our runs can be compared with theirs. We test whether the **wall material choice changes a route's verdict** (if it doesn't, rigid walls are fine for teaching, and we can say so with evidence). |
| **Paccia & Galasso** ([repo](https://github.com/AdrianoPaccia/Catheter_insertion_simulator)) | SOFA catheter insertion with a **bilateral haptic loop** (a Geomagic device over UDP), so the user *feels* the wall. It runs several anatomies (carotids, a midline cephalic vein, three artificial test models), i.e. **artificial models as a test set** next to real ones. | Thin documentation: an 11-line README, no licence, no metrics or results stated, and the geometry source isn't named. → Our version of "feel the wall" is the existing contact feedback plus hands input. Every anatomy we ship gets a documented source and a quality report (Phase 1). Artificial phantoms are our Phase 0 truth set. |

**Common gaps across all three that Cathy can close:** none of them goes from **an arbitrary user scan** to a simulator case; none reports **geometry accuracy against ground truth**; and none tells the trainee **how far to trust** the anatomy in front of them. That's this plan.

**Licence boundary, unchanged:** CathSim code and meshes stay in `physics/` and never go into `client/`. Pescio's code is MIT, so we can read it and adapt ideas with attribution in `THIRD_PARTY.md`. Paccia's has no licence, so it's ideas only, no code. SOFA itself (LGPL) would be a new runtime dependency → a request to David before anyone builds on it.

### Rules that do not move

- **The route engine computes every route, measure, score and number.** Cathy's LLM only words engine facts, behind the grounding check (`score/grounding.ts`). This doesn't change.
- **A segmentation network is a new kind of AI in the pipeline.** TotalSegmentator is already one, run offline, with its masks committed. Running a network on *user* data, or in the app, changes demo scope and possibly the licence boundary. → **File a to-all request before building Phase 2's network step.** Until then, the correction step is classical (region growing or level set in the enhanced local window), as iVesseger's steps 2–3 allow.
- **No clinical claims.** Accuracy numbers are "geometry error versus a synthetic phantom at X mm". Never "clinically accurate". The honesty line stays.
- **Patient data never enters the repo or Vercel.** Scans are processed on the user's machine (the local `physics/server` or a CLI in `tools/`). The client receives only the exported case package. Strip DICOM tags before anything is written. No uploads to any third party, and no scan data to `/api/cathy`.
- **Licences:** check the TotalSegmentator code and *weights* licences (some weights are non-commercial) and add the result to `THIRD_PARTY.md`. 3Dircadb and MIDAS, if used, are **test data only**, never shipped in `client/public/`.

### Phase 0: the accuracy harness (gates everything). David builds it, Vaibhav does the engine side, Gibran runs it in CI

1. **Phantom from our own generator (after Wu et al.).** `tools/generator` already knows every case's true centerlines and radii. Voxelize that truth into a synthetic CTA volume: vessel intensity, background, partial volume at the wall, Gaussian noise. Sweep spacing over {0.5, 0.8, 1.0, 1.5, 2.0} mm, slice thickness over {1, 2, 3} mm, and SNR over a few levels.
2. **Run the real pipeline on each volume:** pre-segmentation → `slicer/export_case.py` → a case package.
3. **Score it against truth, two layers:**
   - *Geometry:* Dice, MCC, clDice, AHD (mm), centerline distance (mean and max, mm), **radius error (% per vessel, and at the narrowest point)**, branch angle error (°), and topology (same vessels, same parents, no missing or extra branches).
   - *Mesh simplification (after CathSim's V-HACD hulls):* distance between the collision or decimated mesh and the mask's surface, and whether any lumen narrower than the wire closes or any small branch disappears. Do this for the meshes the rail wire and the physics wire actually use.
   - *Downstream (Vaibhav):* does the optimizer return the same frontier, the same best route and the same steerability verdict as on the true geometry? A route whose verdict flips under segmentation error is the number that matters most for teaching.
4. **Output:** `metrics/david/segmentation-accuracy.md` (a summary table per spacing) and a fixture set in `tests/fixtures/engine/` (Gibran). One `DECISIONS.md` line sets the **minimum scan resolution Cathy accepts**, taken from the table, not guessed.

Done when the harness runs from one command, the table exists, and a test in `tests/engine/` fails if a pipeline change makes any metric worse than its recorded baseline.

### Phase 1: user scan → case package (David)

1. **Input:** a CTA as DICOM or NIfTI, on the user's machine. The tool reads the spacing and refuses scans coarser than the Phase 0 minimum, with the reason.
2. **Pre-segmentation:** TotalSegmentator's vessel classes (as `fetch_totalsegmentator.py` and `prepare_totalsegmentator.py` already use them), run locally.
3. **Make the pipeline robust to the four failures in `slicer/README.md`:** masks not touching (bridge gaps under N voxels, and report it), markups beyond the 20 mm snap (re-place them automatically or ask the user), unsafe merged arch nodes (split them or report them), and disconnected edges.
4. **A quality report with every package (contract request):** for example `case.json.quality = { source: 'user-scan' | 'phantom' | 'dataset', spacingMm: [x,y,z], perVessel: { id, radiusUncertaintyMm, gapsBridged, correctedByUser }[], phantomBaseline: { spacingMm, radiusErrPct, centerlineErrMm } }`. Every value comes from the pipeline or the Phase 0 table.

Done when 5 or more TotalSegmentator subjects, including at least two of the ones that failed before, export through one command with a quality report, and the Phase 0 tests still pass.

### Phase 2: interactive correction, iVesseger-style (David: server; me: UI; Vaibhav: engine re-run)

1. In the case view, the user marks **"missing vessel here"** or **"not a vessel"** with a click on the 3D model or a slice view.
2. **Grayscale ray (iVesseger §3.2):** cast the click ray through the volume and the current mask. Pick the point where the ray's smoothed intensity profile says vessel but the mask says no (under-segmented), or the reverse (over-segmented).
3. **Local enhancement:** adjust intensities in a small window around the point (iVesseger §3.3).
4. **Local re-segmentation** in that window: classical first (see the rules above). Then re-extract the centerlines (SlicerVMTK) and re-export.
5. **The engine re-runs.** The UI shows the before/after diff of the geometry *and* of the frontier. The corrected vessel gets `correctedByUser: true`.
6. **Measure it:** on Phase 0 phantoms with deliberate mask errors, record Dice, clDice and AHD per click (iVesseger's per-iteration curve) and the clicks needed to recover the true frontier. That table goes in `metrics/`.

Done when a phantom with a cut branch is repaired in ≤ 5 clicks, back to the true frontier, with the curve recorded.

### Phase 3: engine measures that carry their uncertainty (Vaibhav)

1. **Radii** come from the mask's maximum inscribed sphere (VMTK), with ± from the voxel spacing and the Phase 0 radius error at that spacing.
2. **Robustness check:** re-run steerability and the frontier at the radius ± its uncertainty. If the verdict flips, the route gets a flag such as `geometryUncertain: true` (contract request), and Results and Cathy say so.
3. Branch angles and the narrowest point get the same treatment.

Done when every measure shown on screen for a user-scan case either carries its uncertainty or the flag, and the `tests/engine/` cases prove the flag trips on a phantom where it should.

### Phase 3b: physics fidelity, learning from CathSim and Pescio (David: physics; Vaibhav: comparison)

1. **One run log schema** across rail and physics, matching Pescio's fields: insertion length and speed, rotation, tip position and orientation, tip–wall contact load, tip–target distance. Commit summaries to `metrics/`, never raw high-rate logs.
2. **Rail vs. physics on the same phantom:** the tip path distance between them, and where they disagree. That's the honest size of "rail mode is a simplification".
3. **Wall sensitivity:** if the physics stays MuJoCo with rigid walls (as CathSim's does), run a stiffness sweep where possible. If a SOFA FEM scene is ever approved (as Pescio's is), run the material models over one phantom. The question is only whether **the route verdict or the contact-risk ranking changes**. Record the answer in `DECISIONS.md`.
4. **Friction:** CathSim leaves out sliding friction. Measure whether adding a simple sliding term changes push-to-tip transmission on the tortuous cases, and keep it only if it does.

Done when the rail-vs-physics and wall-sensitivity tables exist in `metrics/`, and every "simplified" label on screen points to them.

### Phase 4: Cathy's accuracy (Vaibhav: facts; me: screens; David: the server prompt)

1. **`cathyFacts` gains the quality fields:** source, spacing, corrected vessels, uncertain routes.
2. **New template lines,** engine-built, for "How sure are you?", "Where did this model come from?" and "Was anything corrected?". For example: "This model is from a scan with 1.5 mm slices; at that spacing, radii measured on our phantoms were off by up to {radiusErrPct}%." Every number is a placeholder filled from facts.
3. **Grounding check:** when facts contain an uncertainty flag, an LLM answer that leaves it out fails and falls back to the template. Claude can reword a caveat but not drop it.
4. **Screens (me):** a Quality card on the Case brief, "Corrected by you" badges on vessels, and an uncertainty marker on Plan and Results.
5. **Visual realism (CathSim's lowest-rated item, 3.67/5; me):** draw the user-scan model from the same corrected mask the engine measures, with its body context (bones, heart, veins) from the same scan. What the trainee sees is then what the engine measured, never a prettier stand-in.

Done when e2e tests with a stubbed `/api/cathy` show that an answer omitting the caveat is rejected, and every number on the Quality card traces to a contract field.

### Phase 5 (stretch): cross-modality check, after VascuViz

For a subject with both CTA and MRA, register them (rigid, then affine), segment each, and report the agreement (Dice, centerline distance) on the Quality card as a second, independent check. Plan only. Don't build it before Phases 0–4 are done.

### Deployment

- **Where things run:** Vercel serves the client and `/api/cathy` only. Scan processing runs locally (the `physics/server` endpoint or a `tools/` CLI). If a hosted segmentation service is ever wanted, that's a to-all scope, privacy and licence request first.
- **Flags:** `VITE_USER_SCANS` is off by default. The import UI shows only when the local server reports the segmentation capability.
- **CI:** the Phase 0 harness on a small phantom set (two spacings) on every PR touching `slicer/`, `tools/`, `optimize/` or `score/`. The full sweep runs nightly or by hand, and its summary goes in `metrics/`.
- **Contracts:** one to-all request for `quality` plus `geometryUncertain`, before Phase 1 ends. `CONTRACTS_VERSION` bumps once.
- **Records:** a `DECISIONS.md` line for the minimum resolution, the classical-vs-network correction choice, and the licence results. A handoff per phase.

### Owners at a glance

| Phase | David | Vaibhav | Aroovee | Gibran |
| --- | --- | --- | --- | --- |
| 0 Harness | phantom voxelizer, pipeline runs | downstream frontier/steerability comparison | — | CI test, fixtures |
| 1 User scans | import CLI, robustness, quality report | — | upload + Quality card (mock first) | export tests on new subjects |
| 2 Correction | ray pick, enhancement, local re-seg, re-export | frontier re-run + diff | click tool, before/after view | per-click curve check |
| 3 Uncertainty | radius ± from VMTK | robustness check, flag | markers on Plan/Results | flag-trips tests |
| 3b Physics | log schema, wall/friction sweeps | rail-vs-physics comparison | "simplified" labels link to the tables | fidelity checks in CI |
| 4 Cathy | server prompt keeps caveats | facts + templates + grounding rule | Cathy box, badges | e2e/crosscheck |

## Answer

David: 
Vaibhav: 
