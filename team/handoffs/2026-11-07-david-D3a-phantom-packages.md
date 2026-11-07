# Handoff — David D3a: CathSim phantom case packages

What landed:
- **Four packages** in `physics/cases/`: `low_tort`, `phantom2`, `phantom3` and `phantom4`. Each has `case.json`, `centerlines.json`, `vessels.glb` and `LICENSE.md`, follows `threadsim.case/1` (RAS mm), and uses `source.kind` `cathsim`, `source.license` `CC BY-NC-SA 4.0` and `physics: { available: true, phantom: <id> }`.
- **Converter:** `physics/cases/convert_phantoms.py` (physics environment only; it needs the CathSim clone), plus `physics/cases/README.md`.
- **Frame function:** `cathsim_m_to_ras_mm` in `physics/wire_protocol.py`, with pytest.
- **Measurements:** `metrics/david/d3a/SUMMARY.md`.

| Package | Source triangles | GLB triangles | Centerline points | Entry offset from CathSim insertion point | Loader results |
| --- | --- | --- | --- | --- | --- |
| `low_tort` | 17,593 | 17,593 (kept whole) | 191 | 5.8 mm | none |
| `phantom2` | 120,065 | 57,993 | 217 | 4.4 mm | 1 units warning: the arch's largest radius is 21.2 mm, just over 7–20 mm. That is real geometry, not a units problem. |
| `phantom3` | 196,732 | 58,000 | 195 | 2.4 mm | none |
| `phantom4` | 189,506 | 57,999 | 217 | 5.5 mm | none |

Each graph has:
- **Entry:** `inlet` (descending aorta).
- **Targets:** `bca` and `lcca`, placed exactly on CathSim's target sites.
- **Branch nodes:** at the LCCA and BCA origins.
- **Edges:** `e_aorta`, `e_arch`, `e_bca` and `e_lcca`.
- **Vessels:** `aorta`, `bca` and `lcca`, one GLB node each.

How the centerlines were obtained: CathSim ships no centerlines or path data, and VMTK and Slicer are not available, so they are computed from CathSim's own geometry (`visual.stl`, the insertion point at the world origin, and the `bca`/`lcca` sites). The method is a voxel lumen, then a minimal path weighted by 1/r², then smoothing and resampling at 1 mm, then radius as distance to the mesh. Full details are in the converter's docstring and `DECISIONS.md` ("D3a centerlines").
- **Enclosure:** every centerline point is checked to be enclosed by the vessel wall. The converter refuses to write otherwise.
- **Centring:** the opposite-wall ratio, where 1 is centred, has a median of 0.94, 0.89, 0.87 and 0.92. The worst samples are at branch origins.
- **Reproducible:** two runs give identical bytes.
- **Not hand-edited:** nothing was edited after export.

Frame: the packages are RAS mm, from `cathsim_m_to_ras_mm`: (x, y, z) → (−x, z, y) × 1000. Combined with the client's map, CathSim world metres are exactly the client's Y-up metres. This resolves D1's provisional frame line.

THIRD_PARTY.md: a "Phantom case packages (D3a)" section, written before the conversion ran, gives the CathSim name, commit, CC BY-NC-SA 4.0 and URL, where the packages live and what ThreadSim changed. NumPy and SciPy are listed as converter dependencies. Each package's `LICENSE.md` repeats the attribution and the ShareAlike terms.

Proof:
- **`loadCase`:** `tools/phantom-cases.test.ts` (30 tests, in CI) loads each package through `loadCase` with `origin: 'physics'`. Results: `ok: true`, no errors, `planningOnly: false`, physics allowed for the right phantom, both targets reachable, and no privacy, graph, radii or axes results.
- **Planning only otherwise:** the same files loaded as an import are planning only.
- **Package checks:**
  - schema;
  - one radius per point, all > 0;
  - points 0.7–1.3 mm apart;
  - edges end on their nodes;
  - GLB under 60k triangles, one node per vessel, `units: mm`, `axes: RAS`.
- **License boundary:** no `.stl` and no phantom GLB under `client/`, no `cathsim` case.json under `client/`, and none of the phantoms in `client/public/cases/index.json`.
- **glTF validator:** all four GLBs pass the Khronos validator with 0 errors and 0 warnings.
- **Suites:** `pnpm test` gives 606 passed; `pytest physics` gives 10 passed.

Who switches:
- **David (D5):**
  - Serve `physics/cases/<id>/` over HTTP with its `LICENSE.md`; the client loads it with `{ kind: 'url', origin: 'physics' }`.
  - Send wire positions as CathSim world metres, with no RAS step: `ras_mm_to_yup_m(cathsim_m_to_ras_mm(p)) == p`.
  - The probe's `ras_mm_to_yup_m(world)` was wrong for this frame and must not be reused.
- **Aroovee:** phantom cases have one entry, `inlet` ("Phantom inlet (descending aorta)"), not `fem_*` or `rad_*`, so the entry-icon picker needs a fallback for it.
- **Vaibhav:** the phantom packages work with `buildGraph`, `measureRoute` and the optimizer like any case. The D4 arch constraint will key on these target ids (`bca`, `lcca`).

Mock replaced: none.
Contracts version after this handoff: unchanged (1). `cannot_steer` not implemented (waiting on Aroovee).
New dependencies: none added. The converter uses numpy, scipy and trimesh, already pinned in `physics/requirements-sim.txt`.
Decisions logged: D3a phantom frame (resolves the provisional line); centerlines computed from the mesh instead of VMTK; mesh simplification.
Known gaps:
- Centerlines come from the mesh, not VMTK. They are close to centred along vessels and less so at branch origins.
- Only the `inlet`→`bca` and `inlet`→`lcca` paths are modelled. The subclavian, aortic root and other branches are in the mesh (assigned to the nearest vessel node) but are not graph edges.
- phantom2 gets a units warning: its arch radius is 21.2 mm, outside 7–20 mm. That is geometry, not units.
- The vessel split of the mesh is by nearest centerline point, so it is approximate at the junctions.
- Vertex clustering is cruder than quadric simplification.
- The converter does not run in CI (it needs the git-ignored CathSim clone). CI checks the committed output.
- **D3c is still blocked: 3D Slicer is not installed.**
