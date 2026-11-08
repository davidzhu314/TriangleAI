# Third-party code, data and assets

One entry per dependency or asset: name · version · license · URL · where it is used. Append only. Datasets are recorded here before conversion, not after. Licenses below are from spec §9.1; confirm each version's license when you add it.

| Name | Version | License | URL | Where used |
| --- | --- | --- | --- | --- |
| CathSim code and phantoms | — | CC BY-NC-SA 4.0 (no commercial use without the authors' permission) | https://github.com/airvlab/cathsim | `physics/` only, separate process; never in `client/` |
| MuJoCo, dm_control | — | Apache 2.0 | — | `physics/` (via CathSim) |
| three.js (`three`, runtime; `@types/three`, dev) | 0.187.0 | MIT | https://threejs.org | `client/src/render/` |
| TotalSegmentator (total task only) | — | Apache 2.0 code; total task free for any use | — | `tools/` (offline), if a CTA case is built |
| 3D Slicer, SlicerVMTK | — | Permissive (keep notices) | — | `slicer/`, `tools/` |

Added in D1 (physics process only, `physics/requirements-sim.txt`; none of these reach `client/`):

| Name | Version | License | URL | Where used |
| --- | --- | --- | --- | --- |
| CathSim | commit adfabb2 (2024-11-13) | CC BY-NC-SA 4.0, plus the authors' TERMS.md | https://github.com/airvlab/cathsim | `physics/vendor/cathsim` (git-ignored clone), physics process only |
| MuJoCo | 2.3.7 | Apache 2.0 | https://github.com/google-deepmind/mujoco | physics process |
| dm_control | 1.0.14 | Apache 2.0 | https://github.com/google-deepmind/dm_control | physics process |
| PyTorch (CPU) | 2.0.1 | BSD-3-Clause | https://pytorch.org | physics process (imported by CathSim via stable-baselines3) |
| stable-baselines3 | 2.2.1 | MIT | https://github.com/DLR-RM/stable-baselines3 | physics process (imported by CathSim) |
| Gymnasium | 0.29.1 | MIT | https://github.com/Farama-Foundation/Gymnasium | physics process |
| trimesh | 3.23.3 | MIT | https://github.com/mikedh/trimesh | physics process |
| websockets | 13.1 | BSD-3-Clause | https://github.com/python-websockets/websockets | `physics/probe/probe_server.py` |
| three.js (CDN, probe page only) | 0.160.0 | MIT | https://threejs.org | `physics/probe/index.html` |
| Inter (variable, Latin subset, from `@fontsource-variable/inter`) | 5.3.0 | SIL OFL 1.1 | https://github.com/rsms/inter | `client/src/assets/fonts/`, licence alongside |

### Client runtime (D2)

| Name | Version | License | URL | Where used |
| --- | --- | --- | --- | --- |
| Ajv | 8.20.0 | MIT | https://github.com/ajv-validator/ajv | `client/src/case/validate.ts` (schema check, loaded on first use) |
| fast-deep-equal | 3.1.3 | MIT | https://github.com/epoberezkin/fast-deep-equal | via Ajv |
| fast-uri | 3.1.9 | BSD-3-Clause | https://github.com/fastify/fast-uri | via Ajv |
| json-schema-traverse | 1.0.0 | MIT | https://github.com/epoberezkin/json-schema-traverse | via Ajv |
| require-from-string | 2.0.2 | MIT | https://github.com/floatdrop/require-from-string | via Ajv |

### Phantom case packages (D3a)

| Name | Version | License | URL | Where used |
| --- | --- | --- | --- | --- |
| CathSim phantoms `low_tort`, `phantom2`, `phantom3`, `phantom4` (`visual.stl` meshes and `bca`/`lcca` target sites), converted by ThreadSim | commit adfabb2 (2024-11-13) | CC BY-NC-SA 4.0 (research and demo only; adaptations shared alike) | https://github.com/airvlab/cathsim | `physics/cases/<phantom>/` only. They are served to the browser at runtime by the physics process (D5) and never copied into `client/`. ThreadSim's changes: the frame was converted to RAS mm, the meshes simplified and split per vessel, and centerlines computed from the mesh. Each package carries `LICENSE.md` with this attribution. |
| NumPy | 1.25.2 | BSD-3-Clause | https://numpy.org | `physics/cases/convert_phantoms.py` (offline converter, physics environment only) |
| SciPy | 1.11.2 | BSD-3-Clause | https://scipy.org | `physics/cases/convert_phantoms.py` (distance transform, connected components, Dijkstra) |

### First 3D Slicer case (D3c), recorded before conversion

| Name | Version | License | URL | Where used |
| --- | --- | --- | --- | --- |
| TotalSegmentator dataset, small subset (University Hospital Basel). Subject `s1404`, CT angiography thorax-abdomen-pelvis, no pathology recorded. Only its arterial masks are used: aorta, brachiocephalic trunk, common carotids and iliac arteries. No CT image, age, sex or other metadata leaves `tools/`. | v2.0.1 (Zenodo record 10047263) | CC BY 4.0. Cite Wasserthal et al., "TotalSegmentator: robust segmentation of 104 anatomic structures in CT images", Radiology: AI 2023 | https://doi.org/10.5281/zenodo.10047263 | Converted with 3D Slicer + SlicerVMTK by `slicer/export_case.py`. The output mesh and centerlines are in `client/public/cases/ts-s1404-cta/` |
| TotalSegmentator dataset, small subset (University Hospital Basel). Subject `s1336`. Only its arterial masks are used: aorta, brachiocephalic trunk, common carotids, subclavians and iliac arteries. The CT image and `meta.csv` (age, sex, scanner) are never downloaded. | v2.0.1 (Zenodo record 10047263) | CC BY 4.0. Cite Wasserthal et al., "TotalSegmentator: robust segmentation of 104 anatomic structures in CT images", Radiology: AI 2023 | https://doi.org/10.5281/zenodo.10047263 | Converted with 3D Slicer + SlicerVMTK by `slicer/export_case.py`. The output mesh and centerlines are in `client/public/cases/ts-s1336-cta/` |
| TotalSegmentator dataset, small subset (University Hospital Basel). Subject `s0727`. Only its arterial masks are used: aorta, brachiocephalic trunk, common carotids, subclavians and iliac arteries. The CT image and `meta.csv` (age, sex, scanner) are never downloaded. | v2.0.1 (Zenodo record 10047263) | CC BY 4.0. Cite Wasserthal et al., "TotalSegmentator: robust segmentation of 104 anatomic structures in CT images", Radiology: AI 2023 | https://doi.org/10.5281/zenodo.10047263 | Converted with 3D Slicer + SlicerVMTK by `slicer/export_case.py`. The output mesh and centerlines are in `client/public/cases/ts-s0727-cta/` |
| TotalSegmentator dataset, small subset (University Hospital Basel): body context for subjects `s1404`, `s1336` and `s0727`. The masks are vertebrae C7 to L5, ribs 1 to 12 on both sides, sternum and heart, merged into a faint "bone" and "heart" mesh. The CT image and `meta.csv` are never downloaded. | v2.0.1 (Zenodo record 10047263) | CC BY 4.0. Cite Wasserthal et al., "TotalSegmentator: robust segmentation of 104 anatomic structures in CT images", Radiology: AI 2023 | https://doi.org/10.5281/zenodo.10047263 | Converted with 3D Slicer by `slicer/export_context.py`. The output is `client/public/cases/ts-*-cta/context.glb` |
| 3D Slicer | 5.13.0 preview 2026-11-05 (revision fb80933, Intel build) | BSD-style 3D Slicer license | https://www.slicer.org | `slicer/` (offline export only) |
| SlicerVMTK extension (Extract Centerline) | revision 23190ba | BSD-3-Clause (VMTK) | https://github.com/vmtk/SlicerExtension-VMTK | `slicer/` (offline export only) |
| ExtraMarkups extension | revision f5c833b | installed with Slicer; not used by the export | https://github.com/chir-set/SlicerExtraMarkups | — |

### Completeness pass (D7)

Licenses here were confirmed from each package's own metadata or license file (the npm `package.json` `license` field, the Python dist-info `LICENSE`/`COPYING`/`LICENCE` files and their classifiers), not guessed.

Physics process, the rest of `physics/requirements-sim.txt` (installed with CathSim; none reach `client/`):

| Name | Version | License | URL | Where used |
| --- | --- | --- | --- | --- |
| Pympler | 1.1 | Apache 2.0 | https://github.com/pympler/pympler | physics process (CathSim import) |
| PyYAML | 6.0.1 | MIT | https://pyyaml.org | physics process (CathSim config) |
| pyaml | 23.9.7 | WTFPL v2 | https://github.com/mk-fg/pretty-yaml | physics process (CathSim import) |
| mergedeep | 1.3.4 | MIT | https://github.com/clarketm/mergedeep | physics process (CathSim config) |
| Rtree | 1.0.1 | MIT | https://github.com/Toblerity/rtree | physics process (trimesh spatial index) |
| toolz | 0.12.0 | BSD-3-Clause | https://github.com/pytoolz/toolz | physics process (CathSim import) |
| Matplotlib | 3.7.2 | Matplotlib License (PSF-based) | https://matplotlib.org | physics process (CathSim import; never renders) |
| opencv-python | 4.8.0.76 | Apache 2.0 | https://github.com/opencv/opencv-python | physics process (CathSim import) |
| Rich | 13.5.2 | MIT | https://github.com/Textualize/rich | physics process (CathSim import) |
| tqdm | 4.66.1 | MPL-2.0 AND MIT | https://tqdm.github.io | physics process (CathSim import) |
| websockets | 13.1 | BSD-3-Clause | https://github.com/python-websockets/websockets | also `physics/server/` (D5) and its tests (`physics/requirements-test.txt`) |

Test and build tooling (never shipped in the app bundle):

| Name | Version | License | URL | Where used |
| --- | --- | --- | --- | --- |
| pytest | 8.4.2 | MIT | https://docs.pytest.org | `physics/requirements-test.txt`, `tests/crosscheck/requirements.txt` |
| NumPy | 2.3.4 | BSD-3-Clause | https://numpy.org | `tests/crosscheck/` (NumPy reference measures, test only) |
| TypeScript | 7.0.2 | Apache 2.0 | https://www.typescriptlang.org | dev: type check |
| Vite | 8.3.6 | MIT | https://vite.dev | dev: build and dev server |
| Vitest | 5.1.0 | MIT | https://vitest.dev | dev: unit tests |
| Playwright (`@playwright/test`) | 1.65.0 | Apache 2.0 | https://playwright.dev | dev: end-to-end tests |
| `@types/node` | 22.20.5 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | dev: types |

Shipped in the client build with no third-party license: the client runtime is exactly `ajv` (and its four dependencies above) and `three` (`pnpm list --prod`). The icons and empty-state art in `client/src/assets/` are drawn in-house (DESIGN.md, Iconography). The generated cases and `fixture-y` in `client/public/cases/` come from ThreadSim's own tools. The only third-party data in `client/public/` is `ts-s1404-cta`, `ts-s1336-cta` and `ts-s0727-cta`, with their `context.glb` (TotalSegmentator, CC BY 4.0, above). No CathSim or other share-alike asset is under `client/`.
Shipped in the client build with no third-party license: the client runtime is exactly `ajv` (and its four dependencies above) and `three` (`pnpm list --prod`). The icons and empty-state art in `client/src/assets/` are drawn in-house (DESIGN.md, Iconography). The generated cases and `fixture-y` in `client/public/cases/` come from ThreadSim's own tools. The only third-party data in `client/public/` is `ts-s1404-cta` (TotalSegmentator, CC BY 4.0, above). No CathSim or other share-alike asset is under `client/`.

### Realistic vascular asset (Gibran, staged, not in the client build)

| Name | Version | License | URL | Where used |
| --- | --- | --- | --- | --- |
| BodyParts3D / Anatomography (© DBCLS), via OrganUI Vessels `public/models/vessels.glb` | BodyParts3D 4.3 (FMA3.0); OrganUI commit `74be339badd85f1d3d93e585ed2a5a79c7679342`, GLB SHA-256 `d2dd9911…701d` | **CC BY-SA 2.1 Japan** (share-alike; commercial use allowed). OrganUI's MIT license covers its code only, not the model. Cite Mitsuhashi et al., NAR 37 (2009) D782–D785 | https://lifesciencedb.jp/bp3d/ · https://github.com/organui/vessels-3d | `assets/vascular/` only (31 structures split into 50 nodes, mm RAS, `prepare_vessels.py`). Not imported by `client/`; the license boundary is pending `team/requests/to-all-from-gibran-license-vascular-assets.md` |

## Hands and voice (integration branch, 2026-11-08)

| Name | Version | License | URL | Where used |
| --- | --- | --- | --- | --- |
| MediaPipe Tasks Vision (`@mediapipe/tasks-vision`, runtime; JS and its WASM runtime, served from the app, not a CDN) | 1.2.2 | Apache 2.0 (package metadata) | https://www.npmjs.com/package/@mediapipe/tasks-vision | Hand tracking for the hands input (`client/src/input/`, wired by Aroovee's screens) |
| MediaPipe Hand Landmarker model (`hand_landmarker.task`, float16, version 1: `hand_detector.tflite` + `hand_landmarks_detector.tflite`), SHA-256 `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1` | float16/1 | Apache 2.0 (MediaPipe Hand Landmarker model card) | https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task | `client/public/models/hand_landmarker.task`, loaded in the browser; no hand images leave the device |
