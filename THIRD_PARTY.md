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
| 3D Slicer | 5.13.0 preview 2026-11-05 (revision fb80933, Intel build) | BSD-style 3D Slicer license | https://www.slicer.org | `slicer/` (offline export only) |
| SlicerVMTK extension (Extract Centerline) | revision 23190ba | BSD-3-Clause (VMTK) | https://github.com/vmtk/SlicerExtension-VMTK | `slicer/` (offline export only) |
| ExtraMarkups extension | revision f5c833b | installed with Slicer; not used by the export | https://github.com/chir-set/SlicerExtraMarkups | — |
