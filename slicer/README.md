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
python3 slicer/fetch_totalsegmentator.py s1404 /tmp/ts-s1404-context --context   # vertebrae C7-L5, ribs, sternum, heart
"$SLICER" --no-main-window --no-splash --python-script slicer/export_context.py -- \
  --masks /tmp/ts-s1404-context --segmentation slicer/cases/ts-s1404-cta/context.seg.nrrd \
  --out client/public/cases/ts-s1404-cta/context.glb
```

The first two arguments build the committed `context.seg.nrrd` (segments `bone` and `heart`). Leave out `--masks` to export again from it; the output is byte-identical. The GLB is in mm and RAS, the frame of `vessels.glb`. Nodes `bone` (34k triangles) and `heart` (8k), with extras `{kind: "context", label}`, about 0.75 MB. It is faint background only: no file of the case package names it, and the loader never reads it.

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
