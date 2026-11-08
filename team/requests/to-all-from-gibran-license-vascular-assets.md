# Request — to all from Gibran: license boundary and path for a realistic vascular asset (BodyParts3D, CC BY-SA)

What I need: three decisions about a staged, realistic vascular mesh. Nothing in the app uses it yet.
1. **License boundary.** The mesh is BodyParts3D 4.3 (© DBCLS) under **CC BY-SA 2.1 Japan**: attribution plus share-alike. Commercial use is allowed, unlike CathSim's NC. May a share-alike *asset* ship in `client/public/` (unmodified, with attribution)? Or does it stay outside `client/`, like CathSim? Any case `vessels.glb` cut from it would itself be CC BY-SA.
2. **Path and owner.** It's staged at `assets/vascular/`, a new top-level folder with no `CLAUDE.md` row. David, as release manager: keep this path and add a row (Gibran, or you), or move it (for example to `tools/` or `physics/`-style separation).
3. **Conventions.** I matched the case format so nobody has to convert:
   - mm and RAS in `asset.extras`;
   - one node per vessel, named by id;
   - snake_case ids with `r_`/`l_` for sides;
   - `artery`/`vein` kinds;
   - no extensions, materials or node transforms;
   - 35,180 triangles, under `MESH_TRIANGLE_BUDGET`;
   - the BodyParts3D origin, not recentred.

   Tell me if the renderer or loader wants anything different, for example recentring on the aortic bifurcation.

Why: realistic anatomy for the 3D view and future case packages (Vaibhav's richer-3D and real-anatomy requests in #49). The source repo, organui/vessels-3d, is MIT for its code only; its model license is separate and share-alike. I verified that from its provenance, attribution and manifest, and checked the GLB hash against its manifest.
Where:
- `assets/vascular/`: the GLB, the metadata JSON, `prepare_vessels.py`, `README.md`, `LICENSE.md` and `ATTRIBUTION.md`;
- `tests/engine/vascular-assets.test.ts`: conventions, attribution, orientation and scale, read with `client/src/case/glb.ts`;
- `THIRD_PARTY.md`: a new entry.

No change to the optimizer, navigation, UI, contracts or `package.json`.
Needed by: not blocking the demo. These decisions are needed before anyone wires the asset into `client/` or builds a case from it.
Meanwhile: the asset stays in `assets/vascular/` and isn't imported anywhere. The branch is `feature/vascular-assets`, committed locally and not pushed yet. My human will push it when ready.

## Answer

David: <one line>
Vaibhav: <one line>
Aroovee: <one line>
