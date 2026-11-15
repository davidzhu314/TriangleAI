# heartgen

An offline Python pipeline that builds the multi-part heart shown in Cathy's Heart tab (`#/heart`). Nothing here ships to the browser except the files `publish` copies to `client/public/hearts/`.

For education only. Not a clinical device; measurements are illustrative, never diagnostic.

## Build the template heart (M0)

```sh
cd tools/heartgen
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt

# The King's College London average heart (CC BY 4.0, 58 MB). Extract it in its own folder; it is data only.
mkdir -p .cache/kcl-average
curl -L -o .cache/average.tar.gz https://zenodo.org/api/records/4593739/files/average.tar.gz/content
tar -xzf .cache/average.tar.gz -C .cache/kcl-average

.venv/bin/python -m heartgen template .cache/kcl-average/average.vtk \
  --case kcl-average --title "Average adult heart (shape model)" --source-note sources/kcl-average.json
.venv/bin/python -m heartgen publish kcl-average
```

`template` writes `out/<case>/heart.glb` and `provenance.json`; `publish` copies them to `client/public/hearts/<case>/` and lists the heart in `client/public/hearts/index.json`.

## What a heart is

- `heart.glb`: metres, Y-up (+x patient left, +y superior, +z anterior), meshopt-compressed. `heart` → group nodes (`chambers`, `myocardium`, `great_vessels`, `valves`, `subvalvular`) → one named mesh per part. Each mesh's `extras` holds `display_name`, `description`, `group` and `measurements`; the Heart tab shows those words and colours the part from a design token by mesh name.
- `provenance.json`: source and license, tools, frames and matrices, parts and triangle counts.

Inside the pipeline everything is millimetres in RAS (+x right, +y anterior, +z superior), as in Cathy's case packages.

## Milestones

M0 (this) shows the template's raw label surfaces. M1 adds repair, smoothing, landmarks and baked shading; M2 the four valves with leaflets; see `DECISIONS.md`.
