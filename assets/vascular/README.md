# assets/vascular: realistic vascular anatomy (staged, not wired in)

A whole-body reference mesh of the aorta, its main branches and the great veins. It's for realistic 3D context, and as a starting point for future case packages. **Nothing in the app reads this folder yet.** It's staged here, outside `client/`, until the team settles the license and the path (`team/requests/to-all-from-gibran-license-vascular-assets.md`).

## Files

| File | What it is |
| --- | --- |
| `bodyparts3d-aortic.glb` | 50 mesh nodes, 35,180 triangles, about 0.78 MB. Uncompressed glTF 2.0 with POSITION, NORMAL and indices. No materials, extras, extensions or node transforms. |
| `bodyparts3d-aortic.json` | Per-vessel metadata: id, name, `artery`/`vein`, side, source structure, FMA concept and BodyParts3D element ids, triangle count and bounds. Also the file's units, axes, scale and orientation, its provenance with hashes, the attribution, the changes made, and the limitations. |
| `prepare_vessels.py` | Rebuilds both files from the pinned source. The output is byte-identical. |
| `ATTRIBUTION.md`, `LICENSE.md` | Credit, the notice of changes, and the per-file licenses. |

## Conventions (the same as a case package's `vessels.glb`, spec §3.2)

- **Units:** millimetres. `asset.extras = { "units": "mm", "axes": "RAS" }`, the two keys David's privacy strip keeps.
- **Axes:** RAS. +x patient right, +y anterior, +z superior. The client converts once at load: `(x, y, z) → (−x, z, y) / 1000`, giving metres with Y up.
- **Origin:** BodyParts3D's own (z = 0 near the soles, x = 0 on the midline), not recentred. The bounds are about x ±280, y −10 to 155, z 470 to 1539 mm.
- **Nodes:** one per vessel and side, and the node name is the vessel id, as in `case.json`'s `vessels[].id`. Ids are snake_case:
  - `r_`/`l_` for a side (`r_femoral_arteries`, `l_carotid_arteries`);
  - no prefix on the midline (`aortic_arch`, `inferior_vena_cava`);
  - no prefix for the two pairs that touch across the midline and stay one node: `brachiocephalic_veins` and `common_iliac_veins` (side `both`).
- **Kinds:** `artery` | `vein`, the case schema's enum.
- **Attribution:** in `asset.copyright` and in the JSON.

## Contents

- **Arteries:**
  - the ascending aorta, arch, thoracic and abdominal aorta, and the brachiocephalic trunk;
  - right and left: carotids, vertebral, subclavian, axillary, brachial and radial arteries (radial access);
  - the celiac trunk, superior and inferior mesenteric arteries, and right and left renal arteries;
  - right and left common, internal and external iliac arteries, femoral arteries (femoral access) and deep femoral arteries.
- **Veins:**
  - the superior and inferior vena cava, and the brachiocephalic veins;
  - right and left: jugular, subclavian, axillary and renal veins;
  - the common iliac veins, and right and left internal and external iliac veins and femoral veins.

## Rebuild and check

```sh
pip install -r tests/crosscheck/requirements.txt                     # numpy
python assets/vascular/prepare_vessels.py                            # downloads the pinned OrganUI GLB + manifest, checks hashes
pnpm exec vitest run tests/engine/vascular-assets.test.ts            # conventions, attribution, orientation, scale
```

## Limitations

- **Reference body:** one adult reference body, not a patient. Unreviewed by a clinician.
- **Not a case package:** surface meshes only. There are no centerlines or radii, so no `centerlines.json` or `case.json`.
- **Simplified tubes:** open tubes, simplified upstream (OrganUI, meshoptimizer ratio 0.2). Small branches and organ vessels are omitted.
- **Uneven neck:** the external carotid and external jugular exist only on the right, and the left carotid has a gap at its division.
- **Aorta split:** OrganUI's cut between the thoracic and abdominal aorta is open, not capped.
- **Share-alike:** anything adapted from the mesh stays CC BY-SA 2.1 JP.
