# Mesh inventory for the access module (Phase 0)

Written 2026-11-16 from `feature/heart-m0` at `ebe049d` (PR #111, not yet on main). Nothing here was renamed or edited; this file only reads David's files and maps their names.

## 1. David's heart mesh

| | |
| --- | --- |
| File | `client/public/hearts/kcl-average/heart.glb` (2.3 MB), listed in `client/public/hearts/index.json` |
| Built by | `tools/heartgen` (Python, offline). `provenance.json` beside the GLB records every step |
| Source | King's College London average four-chamber heart, Rodero et al. 2021 (Zenodo 4593739), **CC BY 4.0** |
| Stage | "M0: raw label surfaces of the template. No repair, remeshing, landmarks or generated valves yet" |
| Loaded by | `client/src/heart/viewer.ts` (three.js `GLTFLoader` with the meshopt decoder), drawn by `client/src/heart/index.ts`, coloured by `client/src/heart/parts.ts` |
| Units | **metres** |
| Axes | **Y-up: +x patient left, +y superior, +z anterior**, baked into the vertices. The same frame as a loaded case (`rasMmToYupM` in `client/src/contracts/case.ts`) |
| Origin | The template's own scanner origin, near the middle of the heart. **Not registered to any case** (see section 5) |
| Encoding | `EXT_meshopt_compression` and `KHR_mesh_quantization`: positions are normalized 16-bit integers, placed by each node's scale and translation. `client/src/case/glb.ts` (`readTriMeshes`) does not read meshopt, so non-three.js code needs a decoder or an uncompressed copy |
| Whole heart | 129 × 125 × 108 mm (x −69..60, y −54..71, z −52..56 mm), 388,106 triangles |
| Phases | One static shape. No systole or diastole states, no morph targets, no animation |

### Every node

Hierarchy: `heart` → four groups → meshes. Each mesh node carries `extras`: `display_name`, `description`, `group`, `measurements` (empty at M0).

| Node | Kind | Triangles | Extent, mm (x, y, z) | What it is |
| --- | --- | --- | --- | --- |
| `heart` | root | – | – | extras: `case`, `title`, `stage` |
| `chambers` | group | – | – | |
| `la` | mesh | 59,280 | −49..19, −1..65, −52..−9 | Left atrium **wall**, with the pulmonary veins merged in (KCL labels 3, 18–22) |
| `ra` | mesh | 61,676 | −69..−16, −22..51, −39..37 | Right atrium **wall**, with both venae cavae merged in (labels 4, 23, 24) |
| `myocardium` | group | – | – | |
| `lv_myocardium` | mesh | 104,390 | −24..60, −52..39, −45..43 | Left ventricle muscle, septum included: one closed surface with the outer (epicardial) and inner (endocardial) faces together |
| `rv_wall` | mesh | 89,122 | −53..34, −54..47, −15..56 | Right ventricle free wall |
| `great_vessels` | group | – | – | |
| `aorta` | mesh | 39,220 | −43..4, 17..71, −14..29 | Aortic root and ascending aorta only (54 mm tall). No arch, no branches |
| `pulmonary_trunk` | mesh | 12,424 | −17..21, 34..55, 2..39 | Pulmonary trunk |
| `valves` | group | – | – | |
| `mv_plane` | mesh | 4,892 | −10..17, −1..26, −35..−11 | Mitral valve **position only**: a flat cap. No leaflets |
| `tv_plane` | mesh | 7,338 | −48..−17, −19..15, −11..20 | Tricuspid valve position only |
| `av_plane` | mesh | 5,022 | −21..3, 17..36, −13..12 | Aortic valve position only. No cusps |
| `pv_plane` | mesh | 4,742 | −15..18, 35..45, 9..37 | Pulmonary valve position only |

`parts.ts` also names `la_appendage`, `aorta_root` and a `subvalvular` group ("Under the valves"). None of them is in the file yet; they are placeholders for later heartgen milestones.

### Are valves, papillary muscles and chordae separate parts?

- **Valves:** separate nodes, but only as flat position markers. No leaflets, no cusps, no open or closed state.
- **Papillary muscles:** not present. The template's LV inner surface is smooth.
- **Chordae:** not present.
- **Coronary arteries, pericardium, septal detail (fossa ovalis, PFO):** not present.
- **Blood cavities:** not separate meshes. A cavity is the space inside a wall surface, closed by the valve planes.

## 2. Other anatomy already in the repo

| File | Where | Nodes | Units, axes | Notes |
| --- | --- | --- | --- | --- |
| `vessels.glb` | every case, `client/public/cases/<id>/` | one node per vessel id: `aorta`, `bca`, `rcca`, `lcca`, `r_subclavian`, `l_subclavian`, `r_iliac`, `l_iliac` | mm, RAS in the file; the loader maps to metres Y-up | Arteries only. With `centerlines.json` (points and inscribed radii) this is the graph the wire drives on |
| `chest.glb` | `ts-s1404-cta` only (2026-11-18) | `lung_left`, `lung_right`, `rib_left_1..12`, `rib_right_1..12`, `costal_cartilages`, `sternum` | mm, RAS (no node transforms) | TotalSegmentator v2.0.1, CC BY 4.0; built by `tools/chestgen`. Frame checked against `context.glb` (1.0 mm) |
| `context.glb` | the three CT cases (`ts-s1404-cta`, `ts-s1336-cta`, `ts-s0727-cta`) | `bone` (vertebrae C7–L5, ribs, sternum, one mesh), `heart` (one mesh), `inferior_vena_cava`, `superior_vena_cava`, `l_iliac_vein`, `r_iliac_vein`, `l_brachiocephalic_vein`, `r_brachiocephalic_vein` | mm, RAS | TotalSegmentator v2.0.1 subjects, CC BY 4.0. Ribs are not separate; veins are display meshes with no centerlines |
| `apex.json` | none committed | – | mm, RAS | `slicer/export_apex.py` writes it (needs 3D Slicer, lung and rib masks, four hand-marked landmarks). `client/src/apex` and the Apex plan screen read it. **No bundled case ships one**, so the Apex plan screen has nothing to show today |
| `assets/vascular/` | repo root, outside `client/` | BodyParts3D mesh, staged | – | CC BY-SA 2.1 JP; share-alike, so keep it out of client builds unless that licence is accepted |

## 3. Name mapping: this prompt's parts → what exists

Source tags: **segmented** (from a scan), **template** (the KCL shape model), **generated** (built by rule), **[ASSUMPTION]** (a default, listed in `docs/ASSUMPTIONS.md`).

| Part the access module uses | Existing name | Source | Status |
| --- | --- | --- | --- |
| `lv_myocardium` | `lv_myocardium` | template | **Have.** Epicardial and endocardial faces are one surface; they must be split to get wall thickness and an epicardial access zone |
| `lv_cavity` | inner faces of `lv_myocardium` (`leftVentricle().inner`) | generated | **Partly** (2026-11-18): the inner wall is split out; not yet closed into a volume |
| `rv_myocardium` | `rv_wall` | template | Have |
| `la` | `la` (wall, veins merged) | template | Have. Cavity to derive as for the LV |
| `ra` | `ra` (wall, cavae merged) | template | Have. IVC and SVC are not separate from it |
| `aorta` (root, ascending) | `aorta` | template | Have, 54 mm only |
| `aorta` (arch, descending), `brachiocephalic`, `carotid_*`, `subclavian_*`, `iliac_*` | case vessels `aorta`, `bca`, `rcca`, `lcca`, `r_subclavian`, `l_subclavian`, `r_iliac`, `l_iliac` | segmented (CT cases) or generated | Have, **in a case's frame, not the heart's** (section 5) |
| `av_annulus`, `av_axis` | `av_plane` | template | **Partly:** centre and normal can be fitted to the flat cap |
| `av_cusp_*` (leaflets, open and closed) | – | generated | **To add** |
| `mv_annulus`, `mv_axis` | `mv_plane` | template | Partly, as above |
| `mv_anterior_leaflet`, `mv_posterior_leaflet` | – | generated | **To add** |
| `chordae_mv` | – | generated, [ASSUMPTION] | **To add** |
| `lv_papillary_anterolateral`, `lv_papillary_posteromedial` | – | generated, [ASSUMPTION] | **To add** |
| `lad`, `diagonals` | `generateCoronaries()` in `client/src/heart-access/coronary.ts` | generated, [ASSUMPTION] | **Have** (2026-11-18): centerlines with radii, computed per scene |
| `lv_wall_thickness` (per vertex) | `leftVentricle().thicknessMm` in `lv.ts` | generated (measured from the template) | **Have** (2026-11-18), per outer vertex |
| `apical_access_zone` | `accessZone()` in `access-zone.ts` | generated | **Have** (2026-11-18), per target, with the reason each point is ruled out |
| `pericardium` | `pericardium()` in `coronary.ts` (over the LV only) | generated, [ASSUMPTION] | **Have** (2026-11-18) |
| `ribs` | `rib_left_1..12`, `rib_right_1..12` in `chest.glb` (`ts-s1404-cta`) | segmented | **Have** (2026-11-18), one node per rib |
| `costal_cartilages`, `sternum` | `costal_cartilages`, `sternum` in `chest.glb` | segmented | **Have** (2026-11-18) |
| `intercostal_4..7` | computed per entry line (`EntryLine.space` in `access-zone.ts`) | generated | **Have** (2026-11-18), as labels, not meshes |
| `chest_wall` (skin) | – | segmented | **To add:** TotalSegmentator has no skin class; the body outline needs the CT image or a body-mask class |
| `lung_left` (lingula included) | `lung_left` in `chest.glb` (upper and lower lobes merged) | segmented | **Have** (2026-11-18) for `ts-s1404-cta`. The lingula is part of the upper lobe mask, not separate |
| `septum_primum`, `septum_secundum`, `fossa_ovalis`, `eustachian_valve` | `pfoSeptum()` in `septum.ts` | generated, [ASSUMPTION] | **Have** (2026-11-18), parametric, as point samples and a tunnel line |
| `ivc`, `svc`, `femoral_vein_*` | `inferior_vena_cava`, `superior_vena_cava`, `*_iliac_vein` in `context.glb` | segmented | **Partly:** display meshes, no centerlines, so the wire cannot drive in them yet |
| `tv_*`, `pv_*`, `pulmonary_trunk` | `tv_plane`, `pv_plane`, `pulmonary_trunk` | template | Have (position only for the valves); not needed by the listed scenarios |

**Summary:** of the parts the scenarios need inside the heart, the walls and the valve positions exist. Everything a catheter can snag on or must avoid (leaflets, chordae, papillary muscles, coronaries), the path from skin to apex (ribs as separate parts, lung, pericardium), the PFO septum, and any cardiac motion are to add.

## 4. What Cathy already has to reuse

| Need | Existing code | Notes |
| --- | --- | --- |
| Wire and catheter model | `client/src/wire/rail.ts` (deterministic rail model on the centerline graph), `client/src/wire/physics-chain.ts` (browser chain of links: guidewire inside a catheter, tip shape, wall contact, torsion), `physics/` (Python process) | One interface for all: `WireSource` in `client/src/contracts/wire.ts`. `client/src/wire/select.ts` picks the source |
| Controls | `ControlInput` (`push`, `rotate`, `fluoro`, `contrastPuff`, optional `device`), keyboard in `client/src/ui/drive/input.ts`, hands and voice in `client/src/input/` | No bend axis yet. Adding one is a contract change |
| Recording and replay | `EventLog` (`client/src/contracts/events.ts`), `client/src/wire/replay-source.ts`, `client/src/render/replay-view.ts` | Seeded and replayable already |
| Imaging views | Simulated fluoroscopy and contrast in `client/src/render/drive-view.ts` and `client/src/wire/physics-chain-imaging.ts`; 3D scene in `scene3d.ts`; body context in `anatomy-layer.ts` | No echo view |
| AR | `client/src/render/ar.ts`, `ar-math.ts` (WebXR; unverified on a headset) | |
| Route cost vector and Pareto frontier | `client/src/optimize/` (`optimizer.ts`, `frontier.ts`, `rank.ts`, `measures/`) | Deterministic and explainable; the route report card should reuse `paretoFrontier` |
| Scoring | `client/src/score/` (plan score, drive score, feedback templates, replay marks) | |
| Vascular access comparison | `client/src/access` and the Access check screen: transfemoral, subclavian and carotid routes to the aortic root, narrowest diameter and sharpest bend against a sheath size | Already most of Scenario F's "access-site fit" |
| Transapical entry planning | `client/src/apex` and the Apex plan screen: candidate puncture points, coaxial angle to the valve axis, rib and lung checks, a Pareto frontier | Needs `apex.json`, which no bundled case has |
| Heart viewer | `client/src/heart/` (PR #111): parts list, Solid / See-through / X-ray modes | |
| Mesh utilities | `client/src/case/glb.ts`, `decimate.ts` | No BVH library in the project. `three-mesh-bvh` would be a new runtime dependency |
| Study records | `client/src/ui/study` (procedure log against the plan, transapical fields) | |

## 5. Things that change the plan

1. **Resolved 2026-11-17: the template is fitted into each CT case** (`client/src/heart-access/`, `heart-fit.json` per case; primary patient `ts-s1404-cta`; see `DECISIONS.md`). Originally: **The heart and the cases are different patients.** The heart is a shape-model average in its own frame. The CT cases are three TotalSegmentator subjects whose heart is a single unlabelled mesh. "Compare routes on the same patient" needs one of: (a) register the template heart into a CT case (fit to the case's `heart` mesh and aortic root); (b) build a synthetic torso and vessel tree around the template heart; (c) segment a four-chamber heart from a CT with chamber labels. This decides Phases 1 and 4.
2. **No leaflets, chordae or papillary muscles.** Scenarios A and B score snagging on exactly these. They will be generated, so every clearance number near them rests on an assumption.
3. **No cardiac motion.** One static phase: runs are static until heartgen produces a second phase, and reports must say so.
4. **No venous centerlines.** The PFO baseline needs a drivable path from the femoral vein to the right atrium.
5. **The heart GLB is meshopt-compressed.** Collision and wall-thickness code outside three.js needs a decoded copy.
6. **`apex.json` is missing** from every bundled case, so the existing Apex plan screen is empty on this machine.
7. **The heart branch is not on main.** This work is branched from `feature/heart-m0` and should land after PR #111.

## 6. Baseline before any change (2026-11-16, `aroovee/access-phase0` at `ebe049d`)

| Check | Result |
| --- | --- |
| Typecheck (`tsc`) | passes |
| Unit tests (`vitest run`) | 1,479 passed, 5 skipped, 2 todo, in 97 files. One file (`client/src/optimize/mock.test.ts`) failed with an OneDrive file-lock error (`EBUSY`) in the full run and passed when run alone |
| Production build (`pnpm build`) | passes |
| Browser tests (`playwright test`, 2 workers) | 131 passed, 1 skipped, of 132 (9.2 minutes) |
| Python tests (`pytest physics`) | not run: the physics environment is not installed on this machine |
