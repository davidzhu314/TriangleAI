# Third-party code, data and assets

One entry per dependency or asset: name · version · license · URL · where it is used. Append only. Datasets are recorded here before conversion, not after. Licenses below are from spec §9.1; confirm each version's license when you add it.

| Name | Version | License | URL | Where used |
| --- | --- | --- | --- | --- |
| CathSim code and phantoms | — | CC BY-NC-SA 4.0 (no commercial use without the authors' permission) | https://github.com/airvlab/cathsim | `physics/` only, separate process; never in `client/` |
| MuJoCo, dm_control | — | Apache 2.0 | — | `physics/` (via CathSim) |
| three.js | — | MIT | — | `client/src/render/` |
| TotalSegmentator (total task only) | — | Apache 2.0 code; total task free for any use | — | `tools/` (offline), if a CTA case is built |
| 3D Slicer, SlicerVMTK | — | Permissive (keep notices) | — | `slicer/`, `tools/` |
