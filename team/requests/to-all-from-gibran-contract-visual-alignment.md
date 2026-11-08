# Request — to all from Gibran: a visual alignment for the anatomical model (contract proposal)

What I need: agreement on one small, render-only contract before anyone wires the BodyParts3D model (`assets/vascular/bodyparts3d-aortic.glb`) into the 3D views. I've touched neither of your components. The reference implementation and its checks are in my folders, on branch `feature/vascular-integration`.

Why: the model and the cases are both RAS millimetres, but in different frames. Each case uses its own origin, while the model uses BodyParts3D's, with z near the soles. Today, `VITE_ANATOMY_GLB` with `VITE_ANATOMY_FRAME=ras-mm` would place the model by `RAS_MM_TO_YUP_M` alone, so it would sit roughly half a metre to a metre and a half from the case. Each case needs its own alignment, set apart from the case data.

## The proposal

**1. A visual alignment per case, configuration only.** It maps model RAS mm to case RAS mm with a similarity: `p_case = s · R · p_model + t`.
```ts
interface VisualAlignment {
  schema: 'threadsim.visual-alignment/1';
  caseId: string;
  model: string;               // path of the GLB it aligns
  scale: number;               // uniform
  rotationDeg: [number, number, number];   // X, then Y, then Z, about RAS axes: R = Rz · Ry · Rx
  translationMm: [number, number, number];
  method: 'landmark-fit' | 'manual';
  landmarks?: Record<string, string[]>;    // case vessel id → model node ids it was fitted on
}
```
- It never enters `case.json`, `LoadedCase` or any engine input. Planning, comparison, driving and scoring can't see it, and a test now enforces that.
- **Where it lives (David to decide):** next to the model, as `assets/vascular/alignment/<caseId>.json`, or in `client/public/anatomy/`, served with the model. The reviewed values are in `tests/fixtures/engine/vascular-alignment/` today; they move once you pick a path.
- **Contract or not (David):** I'd keep it out of `client/src/contracts/`, because it's render configuration. If you'd rather have it typed there, it's the interface above, with a `CONTRACTS_VERSION` bump.

**2. The renderer composes it (Aroovee).** In `render/anatomy-config.ts` and `anatomy-layer.ts`: `toWorld = RAS_MM_TO_YUP_M · alignment(case)`. The column-major 4×4 is `alignmentMatrix()` in `tests/engine/vascular-alignment.testutil.ts`; copy or move it, it's 15 lines.
- **No alignment for a case:** the layer should not show the model there. Hide it and say "No alignment for this case" in the panel, rather than fitting it to the case bounds the way the placeholder is.
- **Optional:** show the recorded coverage in the panel, for example "Reference body, about 75% matched", so a poor fit isn't taken as the patient's anatomy.

**3. Checks (done, mine):** `tests/engine/vascular-alignment.test.ts`, 42 tests, about 7 s.
- **One frame:** every case's route geometry is its `centerlines.json` under `rasMmToYupM`, and `mesh.toWorld` is `RAS_MM_TO_YUP_M`. The route trace and `vessels.glb` share a frame.
- **The check works:** each case's own mesh covers 100% of its centerlines, and a 20 mm shift drops that to 38–74%, which the test catches.
- **Laterality:** the right carotid is on the right in every case, and stays there after alignment (det > 0, no mirror).
- **Recorded alignments:** each is proper and sane (scale 0.5–2, turns ≤ 45°, ≥ 3 landmarks), and no worse than recorded (−2 points). The three CT cases must cover at least 70%; they record 74–75%.
- **Isolation:** no file in `optimize`, `score`, `case`, `contracts` or `wire/rail*` imports the renderer, the anatomy layer or the model. The case schema has no alignment field.
- **Report:** `metrics/gibran/vascular-alignment.md`, with every case's fit.

## Asks
- **David:**
  - the alignment's path;
  - contract or config;
  - whether `assets/vascular/` is the model's home (the open licence request, `to-all-from-gibran-license-vascular-assets.md`).
- **Aroovee:**
  - composing `toWorld · alignment` in the anatomy layer;
  - hiding the model on cases with no alignment;
  - whether you want the coverage figure in the panel.
- **Vaibhav:** nothing to do. I'd like a yes that the engine stays blind to it; the isolation test is in `tests/engine/`.

Needed by: before any branch wires the real model into `client/`. Not blocking the demo: the app still loads the placeholder.
Meanwhile: nothing merges. `feature/vascular-integration` holds only my folders (tests, fixtures, metrics) and this request.

## Answer

David: <one line>
Aroovee: <one line>
Vaibhav: <one line>
