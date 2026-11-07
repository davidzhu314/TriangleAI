# CathSim phantom `phantom2` — license and attribution

This case package is an adaptation of the `phantom2` phantom from **CathSim** (https://github.com/airvlab/cathsim, commit adfabb2),
licensed under **CC BY-NC-SA 4.0** (https://creativecommons.org/licenses/by-nc-sa/4.0/). Research and demo use only;
no commercial use without the CathSim authors' permission. See also CathSim's TERMS.md.

Changes made by ThreadSim (`physics/cases/convert_phantoms.py`):
- coordinates converted from CathSim's world frame (metres) to RAS millimetres;
- `visual.stl` simplified to under 60,000 triangles and split into one mesh per vessel;
- centerlines and radii computed from the mesh; entry at the phantom inlet; targets at CathSim's `bca` and `lcca` sites.

This adaptation is shared under the same license (CC BY-NC-SA 4.0). It is served to the browser only by the local
physics process and is not part of the ThreadSim client bundle.
