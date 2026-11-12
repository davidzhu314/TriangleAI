# slicer/: 3D Slicer case export (spec §3.6)

These scripts run inside 3D Slicer with the SlicerVMTK extension. They are tested with Slicer 5.13.0 (preview 2026-11-05, revision fb80933, Intel build under Rosetta) and SlicerVMTK revision 23190ba. Never download or install Slicer from a script. On this machine:

```sh
SLICER="$HOME/Applications/3D Slicer 5.13.0 2026-11-05.app/Contents/MacOS/Slicer"
```

## The D3c fixture, `ts-s1404-cta`, from scratch

```sh
# 1. Fetch subject s1404's arterial masks (TotalSegmentator dataset v2.0.1, CC BY 4.0; THIRD_PARTY.md).
#    It uses HTTP range reads of the Zenodo zip, so the CT image and meta.csv are never downloaded.
python3 slicer/fetch_totalsegmentator.py s1404 /tmp/ts-s1404
# 2. Build the export inputs: the segmentation (one segment per vessel id) and the endpoint markups.
"$SLICER" --no-main-window --no-splash --python-script slicer/prepare_totalsegmentator.py -- \
  --masks /tmp/ts-s1404 --out slicer/cases/ts-s1404-cta
# 3. Export the case package.
"$SLICER" --no-main-window --no-splash --python-script slicer/export_case.py -- \
  --segmentation slicer/cases/ts-s1404-cta/vessels.seg.nrrd \
  --endpoints slicer/cases/ts-s1404-cta/endpoints.mrk.json \
  --meta slicer/cases/ts-s1404-cta/case-meta.json \
  --out client/public/cases/ts-s1404-cta --zip /tmp/ts-s1404-cta.zip
```

Step 3 alone reproduces the committed fixture byte for byte from the committed inputs in `slicer/cases/ts-s1404-cta/` (checked twice). Never hand-edit the output. Fix the script or the inputs, and export again.

## More subjects: `ts-s1336-cta`, `ts-s0727-cta`

The same three steps, with `s1336` or `s0727` in place of `s1404`, and `case-meta.json` from `slicer/cases/ts-<subject>-cta/`. Each exports byte-identical from its committed inputs. Subjects tried and skipped, all at step 2 or 3 with the scripts unchanged:
- **s0970:** exported, but the left carotid turn at its merged arch node (120.6°) has no safe route.
- **s0915:** the left iliac edge is disconnected.
- **s1082, s1395, s0903:** a vessel mask does not touch its parent vessel.
- **s0928, s0461:** a markup is beyond the 20 mm snap to a centerline end.

## Body context: `context.glb` for the real CT cases

```sh
# Vertebrae C7-L5, ribs, sternum, heart, and the major veins (a class missing for the subject is skipped and named).
python3 slicer/fetch_totalsegmentator.py s1404 /tmp/ts-s1404-context --context
"$SLICER" --no-main-window --no-splash --python-script slicer/export_context.py -- \
  --masks /tmp/ts-s1404-context --segmentation slicer/cases/ts-s1404-cta/context.seg.nrrd \
  --veins slicer/cases/ts-s1404-cta/veins.seg.nrrd --out client/public/cases/ts-s1404-cta/context.glb
```

With `--masks`, this builds the committed `context.seg.nrrd` (segments `bone` and `heart`) and `veins.seg.nrrd` (one segment per vein). Add `--veins-only` to build just `veins.seg.nrrd` and keep `context.seg.nrrd` as committed (how the veins were added). Leave out `--masks` to export again from the committed segmentations; the output is byte-identical.

The GLB is in mm and RAS, the frame of `vessels.glb`. It holds these nodes, about 1.1 MB in all:

| Node | Triangles | Extras |
| --- | --- | --- |
| `bone` | 34k | `{kind: "context", label}` |
| `heart` | 8k | `{kind: "context", label}` |
| `inferior_vena_cava` | 6k | `{kind: "vein", label}` |
| `superior_vena_cava` | 2.5k | `{kind: "vein", label}` |
| `l_iliac_vein`, `r_iliac_vein` | 3k each | `{kind: "vein", label}` |
| `l_brachiocephalic_vein`, `r_brachiocephalic_vein` | 2k each | `{kind: "vein", label}` |

The veins come from TotalSegmentator classes `inferior_vena_cava`, `superior_vena_cava`, `iliac_vena_left/right` and `brachiocephalic_vein_left/right`. All six are present for s1404, s1336 and s0727. Because the veins are a separate segmentation, `bone` and `heart` export exactly as before.

It is faint background only: no file of the case package names it, and the loader never reads it.

## Apex plan: `apex.json` for the real CT cases

The transapical planner (`#/case/<id>/apex`) needs three hand-marked valve hinge points and the LV apex. This dataset
labels the heart as one piece, so they can't come from the masks (DECISIONS.md, 2026-11-12). Per subject:

```sh
# 1. The planner's masks (heart, aorta, ribs, costal cartilages, sternum, lungs) and the CT, for marking only.
python3 slicer/fetch_totalsegmentator.py s1404 /tmp/ts-s1404-apex --apex
python3 slicer/fetch_totalsegmentator.py s1404 /tmp/ts-s1404-apex --ct
# 2. A person marks hinge:1-3 and apex, then presses "Save landmarks" (Slicer opens with its window).
"$SLICER" --python-script slicer/mark_apex.py -- \
  --ct /tmp/ts-s1404-apex/ct.nii.gz --masks /tmp/ts-s1404-apex \
  --landmarks slicer/cases/ts-s1404-cta/apex-landmarks.mrk.json
# 3. Export the geometry.
"$SLICER" --no-main-window --no-splash --python-script slicer/export_apex.py -- \
  --masks /tmp/ts-s1404-apex --landmarks slicer/cases/ts-s1404-cta/apex-landmarks.mrk.json \
  --out client/public/cases/ts-s1404-cta/apex.json
```

- **Hinge points** are the lowest point of each aortic cusp's attachment. The plane through them is the annulus plane, as in TAVR sizing. They're easiest to place in a double-oblique view across the aortic root: Ctrl+Alt drag rotates a slice.
- **Only positions are kept.** The CT stays in `/tmp`; the `.mrk.json` and `apex.json` hold positions only.
- **Running step 2 again** reopens the saved points to move.
- **Saving marks the points as placed by a person.** A file whose points are described `draft` was placed by a script, and the app labels its plan "Draft landmarks: not anatomy".
- **The export refuses to run** while any of the four points is unplaced.

## Inputs for any case

- **A segmentation:** one segment per vessel, each named by its ThreadSim vessel id (`aorta`, `bca`, `rcca`, …). Arterial segments only.
- **Markup points:** labelled `entry:<id>`, `target:<id>` or `end:<id>`. The one unselected point is the centerline source, normally the first entry. Place or move them in Slicer's Markups module.
- **`case-meta.json`:** the words, meaning title, scenario, difficulty, fluoro budget, the source dataset and license, and display names for vessels, entries and targets.

## What the export does

1. Unions the segments into one surface. SlicerVMTK **Extract Centerline** (`ExtractCenterlineLogic.preprocess` and `.extractCenterline`, cost 1/R) runs from the source to every other markup.
2. VMTK's branch extractor and merge (the same calls as Extract Centerline's curve tree) split the result into branches that share a point at each bifurcation. Those points become the graph nodes.
3. Markups snap to the nearest end node (within 20 mm).
4. Each edge is named by the segment most of its points lie in. It is resampled to about 1 mm, keeping VMTK's maximum inscribed sphere radius.
5. Each segment's smoothed closed surface becomes one GLB node named by its vessel id, decimated to under 90k triangles in total. The decimation is weighted by vessel (`DETAIL_WEIGHT`): more detail in the arch branches and carotids, less in the iliacs. It only applies when a case is over the cap.
6. It writes `case.json`, `centerlines.json` and `vessels.glb` in millimetres and RAS, and optionally zips them.

## Licenses

The masks in `slicer/cases/ts-*-cta/` are derived from the TotalSegmentator dataset (University Hospital Basel, CC BY 4.0; cite Wasserthal et al., Radiology: AI 2023, https://doi.org/10.5281/zenodo.10047263). The exported `case.json` carries the same attribution in `source.dataset`.
