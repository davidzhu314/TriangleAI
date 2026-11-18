# Heart access module

Bringing a catheter into the heart: transapical entry and the comparison routes, scored alike. Built in phases (see `docs/MESH_INVENTORY.md`, `docs/ASSUMPTIONS.md` and `DECISIONS.md`). Research and education only: no number here predicts a patient outcome.

## Phase 1, step 1: the template heart fitted into a CT case

The heart (`client/public/hearts/kcl-average/heart.glb`, a shape-model average) and the CT cases (real subjects with ribs, veins and arteries, but one unlabelled heart surface) were different patients in different frames. The fit places the template heart where the CT case's heart is, so every route can be compared on one body.

| File | What it does |
| --- | --- |
| `geometry.ts` | Vectors, 4×4 matrices, RAS mm ↔ Y-up m, a point grid for nearest-neighbour queries, Horn's closed-form similarity fit |
| `heart.ts` | Loads the template (decoded with three.js, as the Heart tab does) and a CT case's heart surface, context meshes and aortic root, all in RAS mm |
| `fit.ts` | `fitHeart`: rotation, one uniform scale and translation, by trimmed two-way ICP anchored on the aortic root and the ascending aorta. `scoreFit`: the metrics and the verdict for any placement |
| `render.ts` | Front, side and top views as SVG, for checking a fit by eye |
| `fit.test.ts` | Checks the committed fits; refits on request |

**Output:** `client/public/cases/<case>/heart-fit.json` (schema `cathy.heart-fit/1`): the matrix from template RAS mm to case RAS mm, the same move in Y-up metres for three.js, the metrics, a verdict (`good` or `approximate`, with reasons) and the starting rotations tried. Review pictures and a summary are in `metrics/aroovee/access-phase1/`.

**Run:**

```sh
pnpm exec vitest run client/src/heart-access/fit.test.ts                    # checks the committed fits (under a second)
HEART_FIT=check pnpm exec vitest run client/src/heart-access/fit.test.ts    # fits again; matrices must match (about 2 min)
HEART_FIT=write pnpm exec vitest run client/src/heart-access/fit.test.ts    # fits again and rewrites the files and pictures
```

**What a fit is and is not:** the template keeps its shape. Chamber sizes, wall thickness and valve positions are the template's, placed and scaled into the patient. Where the patient's heart is shaped differently, the fit says so in its verdict instead of stretching the template (which would also change wall thickness, a number the access zone depends on).

## Phase 1, step 2: the chest of the primary patient

`chest.ts` loads `client/public/cases/ts-s1404-cta/chest.glb` (built by `tools/chestgen` from the subject's own masks): both lungs, each rib, the costal cartilages and the sternum, in RAS mm. `chest.test.ts` checks that every part is present, the frame matches the case, the anatomy is in place, no speck strays, and the fitted heart sits inside the chest with its apex by the left 5th and 6th ribs.

```sh
pnpm exec vitest run client/src/heart-access/chest.test.ts
CHEST=write pnpm exec vitest run client/src/heart-access/chest.test.ts   # also the picture and chest.json in metrics/aroovee/access-phase1/
```

## Phase 1, step 3: the LV, coronaries, access zone and PFO septum

| File | What it does |
| --- | --- |
| `scene.ts` | One patient: the case, the fitted heart, its chest, the split LV, the generated coronaries and the two targets |
| `lv.ts` | Splits the LV wall into outer and inner faces, measures wall thickness, fits planes |
| `coronary.ts` | Generates the LAD, two diagonals and the pericardium [ASSUMPTION] |
| `access-zone.ts` | The four rules, per outer vertex and target; the entry line and its intercostal space |
| `septum.ts` | The parametric PFO septum [ASSUMPTION] |

```sh
pnpm exec vitest run client/src/heart-access/                                     # everything (about 15 s)
ACCESS=write pnpm exec vitest run client/src/heart-access/access-zone.test.ts      # also the heat maps and zone.json
```

Every threshold is a named constant with a row in `docs/ASSUMPTIONS.md`. The zone reports why each point is ruled out, so a heat map shows which rule cuts where.
