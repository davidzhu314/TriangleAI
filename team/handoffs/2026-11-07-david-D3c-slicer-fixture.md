# Handoff — David D3c: first 3D Slicer fixture

What landed:
- **`client/public/cases/ts-s1404-cta/`** (`case.json`, `centerlines.json`, `vessels.glb`), listed in `cases/index.json` just before `fixture-y`.
- **`slicer/`:**
  - `fetch_totalsegmentator.py`;
  - `prepare_totalsegmentator.py`;
  - `export_case.py` (the spec §3.6 export);
  - `README.md`;
  - the committed export inputs in `slicer/cases/ts-s1404-cta/`: `vessels.seg.nrrd`, `endpoints.mrk.json`, `case-meta.json`.
- **`tools/slicer-case.test.ts`**.

How to use: it is a bundled case, so the Library lists it. To reproduce: see `slicer/README.md`, step 3.
Who switches:
- **Aroovee:** the §7.4 import beat can use `ts-s1404-cta` (a real CT angiogram, planning only), loaded as a zip of its three files.
- **Vaibhav and Gibran:** see the notes below.

Mock replaced: none
Contracts version after this handoff: unchanged (1)
Tests: `pnpm test` and `pytest physics` are green. `tools/slicer-case.test.ts` covers:
- schema;
- CT source with CC BY 4.0 and attribution;
- mm and RAS in both case.json and the GLB;
- `loadCase` with no validation results at all, planning only;
- the same from a zip;
- every entry reaching every target;
- one radius per point, all above 0;
- 0.9–1.1 mm spacing;
- edges ending on their nodes;
- GLB nodes named by vessel id;
- triangles at most 100k;
- only schema keys, with no patient fields;
- catalog position.

New dependencies: none in the app. Slicer 5.13.0 and SlicerVMTK are offline tools, recorded in `THIRD_PARTY.md`.
Decisions logged: "D3c: first 3D Slicer export, `ts-s1404-cta` (planning only)"

## Case

- **id:** `ts-s1404-cta`, "CT angiogram, groin to carotid (planning only)".
- **Entries:** `fem_r`, `fem_l`. **Targets:** `rcca`, `lcca`.
- **Vessels:** aorta, bca, rcca, lcca, r_subclavian, l_subclavian, r_iliac, l_iliac.
- **Graph:** 10 nodes and 9 edges. Each edge runs about 1 mm per point, with radii from VMTK's inscribed sphere.

## Source and license

TotalSegmentator dataset v2.0.1 (small subset), subject s1404.
- **Data:** a CT angiogram of thorax, abdomen and pelvis from University Hospital Basel, with no pathology recorded. Only the arterial masks are used.
- **License:** CC BY 4.0, https://doi.org/10.5281/zenodo.10047263. Cite Wasserthal et al., Radiology: AI 2023. `THIRD_PARTY.md` recorded it before conversion.
- **De-identification:** only the eight arterial masks are fetched, through HTTP range reads. The CT image and `meta.csv` (age, sex, scanner) are never downloaded. The `.seg.nrrd` holds only geometry and segment names.

## Versions

- **3D Slicer:** 5.13.0 preview 2026-11-05, revision fb80933, Intel build, run headless under Rosetta.
- **SlicerVMTK:** revision 23190ba. Confirmed with `isExtensionInstalled('SlicerVMTK') == True` before any conversion.

## How it was exported

1. `fetch_totalsegmentator.py s1404` fetched the masks.
2. `prepare_totalsegmentator.py`, in Slicer, built the segmentation (one segment per vessel id) and placed endpoint markups at each vessel's far end along its lumen.
3. `export_case.py`, in Slicer:
   - unions the segments into one surface;
   - runs SlicerVMTK Extract Centerline from `entry:fem_r`, then VMTK's branch extractor and merge;
   - snaps the markups to the end nodes;
   - names edges by segment majority and resamples them to 1 mm;
   - writes one GLB node per segment surface, decimated to under 90k triangles.

## Proof of no manual edits

- **Exact output:** the committed files are exactly the export's output. A second run gave byte-identical `case.json`, `centerlines.json` and `vessels.glb`.
- **Loads clean:** `loadCase` returns `ok` with an empty validation list.
- **Matches the masks:** every centerline point lies inside the source masks, and each node is within about 1 mm of its markup.

## Known gaps

- **Merged arch node:** VMTK merges the closely spaced arch bifurcation regions into one node, `n_b2`, with five edges (aorta in, brachiocephalic, left carotid, left subclavian, aortic root). The routes still follow the real centerline.
- **Steerability:** for Vaibhav and Gibran. On this real anatomy, V3's frontier includes routes that `steerableAt` rejects. The brachiocephalic takeoff of 35.9° is steerable only with soft angled, and the left carotid takeoff of 72.7° only with Standard J. This is the case the pending `cannot_steer` constraint would fix, and it is a good real-anatomy cross-check.
- **Other gaps:** there are no risk zones and no radial entries. The subclavians stop at the edge of the scan. There is no `anatomy` block, so the case is outside the ladder.
- **Not done here:** D7, which reproduces this fixture and adds licensing polish.
