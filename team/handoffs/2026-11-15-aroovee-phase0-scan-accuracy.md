# Handoff — Aroovee: Phase 0, the scan-accuracy harness (2026-11-15)

**What landed:** `client/src/ui/scan-accuracy/`: a harness that draws a bundled case as a synthetic CT angiogram, runs a classical segmentation and centerline pipeline on it, and scores the result against the case, including whether the route engine still gives the same answers. Test and analysis code only; the app does not import it.

**Run it:** `pnpm exec vitest run client/src/ui/scan-accuracy/scan-accuracy.test.ts` (5 tests, about 4 s, in the normal unit run). The sweep: `SCAN_SWEEP=1 pnpm exec vitest run client/src/ui/scan-accuracy/sweep.test.ts` (about 5 minutes), which writes `metrics/aroovee/scan-accuracy/summary.md` and `results.json`.

**Findings:** in `DECISIONS.md` (2026-11-15) and the summary. In short: geometry away from junctions is good at 1 mm; thick slices close the thinnest vessels; route verdicts are limited by branch take-off angles at junctions, not by resolution.

**For David:** export a phantom through Slicer and VMTK and score it with `scoreAgainstTruth(truthCase, exportedCase)`. The stand-in pipeline here is not yours, so its numbers say nothing about your export yet.

**For Vaibhav:** the engine reads take-off over 5 mm from the node. For branches off the aorta that is inside the aorta's lumen. Should imported scans measure take-off at the ostium, or flag those verdicts as uncertain?

**For Gibran:** the baseline test lives beside the code, not in `tests/engine/`. Move or mirror it if you want it in your lane.

**Not done:** Phases 1 to 5 of the request. No screens. No contract change. The image model has no bone, calcium, veins or scanner blur.
