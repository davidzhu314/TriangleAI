# Scan-accuracy harness

Phase 0 of `team/requests/to-david-and-vaibhav-from-aroovee-medical-accuracy.md`: measure what a scan at a given resolution does to a case's geometry and to the route engine's answers, before anything claims accuracy.

It is test and analysis code. Nothing in the app imports it, and it shows no numbers on screen.

## What it does

1. **Truth** (`grid.ts`): a bundled case's own centerlines and radii, as tapered capsules.
2. **Phantom** (`phantom.ts`): a synthetic CT angiogram of that lumen at a chosen in-plane spacing, slice thickness and noise, with partial volume at the wall (after Wu et al., *J. Med. Imaging* 2024).
3. **Pipeline** (`pipeline.ts`): half-maximum threshold → the vessels connected to the marked ends → wall distance → a centerline tree of minimum-cost paths → branches joined to their parent along the branch's own axis → radii as the largest circle that fits each cross-section, from rays through the image. No AI model.
4. **Match** (`recovered.ts`): recovered stretches are matched to the case's edges by which marked ends lie beyond them, and a recovered `LoadedCase` is built with the true case's ids.
5. **Score** (`score.ts`, `downstream.ts`): Dice, MCC, clDice, average Hausdorff distance (the measures iVesseger reports: Li et al., 2025), centerline offset, radius error, branch angles, lost vessels; then the unchanged optimizer on both cases: same frontier, same best route, verdict flips.
6. **Mesh** (`mesh.ts`): how far a case's shipped `vessels.glb` sits from the lumen its centerlines describe, and what the app's decimator does to that. No scan involved.

## Run it

```sh
# The harness's tests and baseline (part of the normal unit run, about 4 s):
pnpm exec vitest run client/src/ui/scan-accuracy/scan-accuracy.test.ts

# The full sweep; writes metrics/aroovee/scan-accuracy/summary.md, results.json and mesh.json (about 6 minutes):
SCAN_SWEEP=1 pnpm exec vitest run client/src/ui/scan-accuracy/sweep.test.ts
```

In PowerShell, set the variable first: `$env:SCAN_SWEEP = '1'`.

## Score another pipeline

`scoreAgainstTruth(truthCase, otherCase)` scores any centerlines made from the same phantom, with the same edge and node ids: for example a Slicer and VMTK export of a phantom volume, loaded with `loadCase`. It gives the centerline, radius and angle errors and the route comparison, with no voxels needed.

## Limits

- The image is clean: no bone, calcium, veins, motion or scanner blur. Real scans do no better than these numbers.
- The pipeline is a classical stand-in written for this harness. It is not David's Slicer export; that one can be scored with `scoreAgainstTruth`.
- Every bundled case is a tree. A graph with a loop would lose one edge of the loop.
- Offsets and radii are scored away from junctions, where overlapping vessels have one lumen but two centerlines in the case file.
- Nothing here is a clinical accuracy claim.
