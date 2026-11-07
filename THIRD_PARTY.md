# Third-party code, data and assets

One entry per dependency or asset: name · version · license · URL · where it is used. Append only. Datasets are recorded here before conversion, not after. Licenses below are from spec §9.1; confirm each version's license when you add it.

| Name | Version | License | URL | Where used |
| --- | --- | --- | --- | --- |
| CathSim code and phantoms | — | CC BY-NC-SA 4.0 (no commercial use without the authors' permission) | https://github.com/airvlab/cathsim | `physics/` only, separate process; never in `client/` |
| MuJoCo, dm_control | — | Apache 2.0 | — | `physics/` (via CathSim) |
| three.js | — | MIT | — | `client/src/render/` |
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
