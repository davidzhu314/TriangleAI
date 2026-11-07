# physics/cases — CathSim phantom case packages (D3a)

The four CathSim arch phantoms (`low_tort`, `phantom2`, `phantom3`, `phantom4`) as standard ThreadSim case packages (`case.json`, `centerlines.json`, `vessels.glb`; spec §3.2), plus a `LICENSE.md` in each folder.

**License boundary:**
- These are adaptations of CathSim (CC BY-NC-SA 4.0).
- They stay in `physics/` and reach the browser only at runtime, served by the local physics process (D5).
- Never copy them into `client/` or `client/public/`, and never list them in `client/public/cases/index.json`.
- `tools/phantom-cases.test.ts` checks that boundary.

## Rebuild

```sh
physics/.venv/bin/python physics/cases/convert_phantoms.py            # all four, also writes metrics/david/d3a/SUMMARY.md
physics/.venv/bin/python physics/cases/convert_phantoms.py phantom3   # one
```

This needs the CathSim clone at `physics/vendor/cathsim` (see `physics/README.md`). It also needs numpy, scipy and trimesh from `requirements-sim.txt`. Commit the output as written: do not hand-edit the JSON or the GLB.

## What is in a package

- **Frame:** RAS millimetres. CathSim world metres are mapped `(x, y, z) → (−x, z, y) × 1000` (`cathsim_m_to_ras_mm` in `physics/wire_protocol.py`). The client then maps RAS mm to Y-up metres with `(x, y, z) → (−x, z, y) / 1000`. Together these are the identity, so D5 can send CathSim world positions as they are and they overlay the mesh.
- **Mesh:** CathSim's `visual.stl`, simplified to under 60k triangles and split into one node per vessel (`aorta`, `bca`, `lcca`) by the nearest centerline point. `low_tort` is already under the cap and is not simplified.
- **Graph:** one entry, `inlet`, at the centre of the phantom's inlet, near CathSim's insertion point at the world origin. Two targets, `bca` and `lcca`, at CathSim's own target sites. Branch nodes at the LCCA and BCA origins.
- **Centerlines:** computed from the mesh, because CathSim ships none (method in the converter's docstring and `DECISIONS.md`). Every centerline point is checked to be enclosed by the vessel wall.
- `physics.available` is true with the phantom id. `loadCase` allows physics only when the package arrives from the physics process (`origin: 'physics'`).
