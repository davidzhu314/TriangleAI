# Attribution: vascular anatomy asset

**BodyParts3D / Anatomography, © The Database Center for Life Science (DBCLS).** Licensed under [Creative Commons Attribution-Share Alike 2.1 Japan](https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en) ([legal code](https://creativecommons.org/licenses/by-sa/2.1/jp/legalcode)). Adapted by OrganUI, then by ThreadSim.

- **Original database:** BodyParts3D / Anatomography 4.3 (object set 4.3, ontology tree FMA3.0), https://lifesciencedb.jp/bp3d/. The license is as stated by the [original service](https://lifesciencedb.jp/bp3d/info/index.html#License) for contour data and rendered images.
- **Citation:** Mitsuhashi N, et al. "BodyParts3D: 3D structure database for anatomical concepts." *Nucleic Acids Research* 37 (2009), D782–D785. https://doi.org/10.1093/nar/gkn613
- **First adaptation:** OrganUI Vessels, https://github.com/organui/vessels-3d, commit `74be339badd85f1d3d93e585ed2a5a79c7679342`, file `public/models/vessels.glb` (SHA-256 `d2dd99113eda9ccf39d8a9bff7d6c9d07252867cabdcaf7bc1c3454a2883701d`).
  - OrganUI's changes: selected 135 source meshes into 52 structures, split the descending aorta at the diaphragm, recentred and scaled, changed axes, welded and simplified the meshes (521,538 to 121,908 triangles), and converted OBJ to GLB.
  - Its meshes come from the [olivercase/body_parts_3d_api](https://github.com/olivercase/body_parts_3d_api) mirror at commit `fd527e6f4daf732fd814314d9257df5877b844bc`, hash-checked against the official 4.3 tables.
  - OrganUI's application code is MIT, and that does **not** relicense the model.
- **ThreadSim's changes (2026-11-07)** are made by `prepare_vessels.py` in this folder:
  - selected 31 of the 52 structures (the aorta and its branches to the neck, arms, viscera, kidneys and pelvis, the femoral arteries, and the great veins);
  - split left/right pairs into one node per side;
  - inverted OrganUI's recentre and scale, and converted to millimetres in RAS axes;
  - welded vertices, dropped degenerate triangles, and removed materials and extras.

  No anatomy was invented or reshaped.

Neither DBCLS, OrganUI nor the mirror author endorses ThreadSim. The source notes that the database can contain missing or incorrect anatomical representations, and no clinician has reviewed this asset.

When redistributing `bodyparts3d-aortic.glb`, `bodyparts3d-aortic.json`, or anything adapted from them (including screenshots), keep this attribution, the license link, and the notice of changes. Adapted material must also be shared under CC BY-SA 2.1 JP (or a compatible later version).
