# Visual alignment of the anatomical model to each case

Written by `UPDATE_FIXTURES=1 pnpm exec vitest run tests/engine/vascular-alignment.test.ts` (Gibran, feature/vascular-integration).

**Model:** `assets/vascular/bodyparts3d-aortic.glb`, BodyParts3D 4.3 (CC BY-SA 2.1 JP). It's one reference body, in RAS mm with BodyParts3D's origin.

**Alignment:** model RAS mm to case RAS mm, as a similarity (uniform scale, rotation, translation), stored per case in `tests/fixtures/engine/vascular-alignment/<case>.json`. The renderer would apply the case's `RAS_MM_TO_YUP_M` after it, as for `vessels.glb`. It is fitted in two steps:
1. **Origins:** the points where the branch vessels both share leave the aorta.
2. **Closest points:** a refinement over every matched vessel. It's kept only when it covers more.

**Coverage:** the share of the case's centerline points, on matched vessels, with a model surface vertex within 2 × radius + 2 mm. **Excess** is the nearest-vertex distance minus the radius; the median is shown, capped at 40 mm.

| Case | Source | Scale | Rotation X, Y, Z (°) | Fit RMS (mm) | Coverage | Median excess (mm) |
| --- | --- | --- | --- | --- | --- | --- |
| `bovine` | generated | 0.966 | -2.4, 0.7, 12.2 | 9.6 | 43% | 12.9 |
| `low-tort` | generated | 0.943 | -1.6, 0.9, 12.2 | 14.5 | 67% | 2.0 |
| `ts-s0727-cta` | CT | 0.867 | 2.0, 3.4, -3.9 | 11.5 | 74% | 1.6 |
| `ts-s1336-cta` | CT | 0.952 | 0.1, -1.3, -1.3 | 14.5 | 75% | -0.3 |
| `ts-s1404-cta` | CT | 0.949 | -3.1, 0.2, 0.9 | 12.3 | 74% | 1.2 |
| `type-i-plaque` | generated | 0.933 | -2.4, 0.9, 16.4 | 11.4 | 46% | 9.8 |
| `type-ii` | generated | 0.958 | -2.9, 1.7, 15.7 | 10.8 | 42% | 13.3 |
| `type-ii-tortuous` | generated | 0.958 | -2.9, 1.7, 15.7 | 10.8 | 42% | 10.7 |
| `type-iii` | generated | 0.991 | -2.8, 1.6, 17.1 | 10.9 | 37% | 14.9 |

**Not aligned:** `fixture-y`. Fewer than 4 vessels map to the model (fixture-y is a synthetic Y).

**Reading it:**
- The real CT cases line up with the reference body at about three quarters coverage. The test holds them to at least 70%.
- The generated arches are parametric, not modelled on a body, so they line up less well. Their figures are recorded only, and a regeneration may not lose more than 2 points of coverage.
- Misalignment never reaches routes or scores: the alignment is render configuration only.
