# Scan accuracy: what a scan at each resolution does to the geometry and to the routes

Made by `client/src/ui/scan-accuracy/sweep.test.ts`; every number is in `results.json` beside this file. Do not edit by hand: run the sweep again.

**What was done.** Each bundled case is its own ground truth (its centerlines and radii). The harness draws it as a synthetic CT angiogram at the stated voxel size and noise, runs a classical pipeline on the image (half-maximum threshold, connected vessels, minimum-cost centerlines, radii from rays through the image), and compares what comes back with the case. Then the unchanged route engine runs on both and its answers are compared.

**How to read it.** These are errors of this pipeline on a clean synthetic image: no bone, calcium, veins or motion. A real scan at the same resolution will do no better. Nothing here is a clinical accuracy claim.

- *Dice, clDice, wall distance:* overlap of the segmentation with the true lumen, whether the centerlines stay inside each other, and the average distance between the two walls.
- *Centerline offset, radius error, narrowest point:* scored away from junctions (where vessels overlap, the lumen has one middle and the case file has two).
- *Angle error at node:* the direction a vessel leaves a branch point over the engine's 5 mm window. For a branch off the aorta that window is inside the aorta, where no scan sees the branch. *At ostium:* the same where the branch leaves its parent, which a scan can see.
- *Vessels kept:* edges of the case the scan still has. *Same frontier / same best route:* targets where the engine gives the same answer on the scanned geometry. *Verdict flips:* candidate routes whose feasible / not feasible verdict changed, or that vanished.

## Headline: the worst anatomy case at each setting

Over low-tort, type-iii and ts-s1404-cta. Counts are summed over the three.

| In-plane mm | Slice mm | CNR | Worst centerline offset mm | Worst mean radius err. % | Worst narrowest pt. err. % | Vessels lost | Same frontier | Verdict flips |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.5 | 1 | 10 | 0.13 | 2.2 | 9 | 0 | 3 of 6 | 16 of 42 |
| 0.5 | 2 | 10 | 0.26 | 2.7 | 26 | 0 | 3 of 6 | 14 of 42 |
| 0.5 | 3 | 10 | 0.49 | 3.4 | 100 | 0 | 2 of 6 | 18 of 42 |
| 0.8 | 1 | 10 | 0.13 | 3.4 | 14 | 0 | 2 of 6 | 12 of 42 |
| 0.8 | 2 | 10 | 0.26 | 3.8 | 22 | 0 | 4 of 6 | 16 of 42 |
| 0.8 | 3 | 10 | 0.48 | 4.2 | 67 | 1 | 1 of 6 | 35 of 42 |
| 1 | 1 | 10 | 0.13 | 4.3 | 18 | 0 | 2 of 6 | 17 of 42 |
| 1 | 2 | 10 | 0.27 | 4.6 | 33 | 0 | 3 of 6 | 18 of 42 |
| 1 | 3 | 10 | 0.49 | 5.1 | 49 | 0 | 2 of 6 | 22 of 42 |
| 1.5 | 1 | 10 | 0.17 | 6.4 | 37 | 0 | 1 of 6 | 21 of 42 |
| 1.5 | 2 | 10 | 0.26 | 6.8 | 60 | 0 | 2 of 6 | 28 of 42 |
| 1.5 | 3 | 10 | 0.48 | 7.0 | 100 | 0 | 2 of 6 | 28 of 42 |
| 2 | 1 | 10 | 0.37 | 7.8 | 55 | 2 | 1 of 6 | 27 of 42 |
| 2 | 2 | 10 | 0.41 | 9.9 | 85 | 1 | 1 of 6 | 25 of 42 |
| 2 | 3 | 10 | 0.57 | 9.9 | 100 | 2 | 2 of 6 | 36 of 42 |
| 0.8 | 1 | 5 | 0.14 | 5.7 | 29 | 0 | 2 of 6 | 21 of 42 |
| 0.8 | 1 | 20 | 0.13 | 2.2 | 9 | 0 | 2 of 6 | 13 of 42 |
| 1.5 | 2 | 5 | 0.27 | 8.9 | 100 | 3 | 2 of 6 | 32 of 42 |
| 1.5 | 2 | 20 | 0.26 | 5.0 | 48 | 0 | 2 of 6 | 28 of 42 |

## The vessel mesh against the lumen

How far each case's shipped mesh (`vessels.glb`) sits from the lumen its centerlines and radii describe, and what the app's own decimator does to that. No scan is involved. For the three CT-derived cases the centerlines were measured from the mesh, so this checks that the two agree; for generated cases it checks the mesh builder. The largest distances (around 10 to 13 mm, inside) are at junctions, where a branch's tube runs on into its parent: that is how the meshes are built, not a fault in the wall.

| Case | Mesh | Triangles | Mean dist. mm | p95 mm | Max mm | Bias mm (− = inside) | Over 1 mm inside, % |
| --- | --- | --- | --- | --- | --- | --- | --- |
| fixture-y | as shipped | 6720 | 0.63 | 5.65 | 9.53 | -0.63 | 10.0 |
| fixture-y | 50% of triangles | 3344 | 0.63 | 5.51 | 9.53 | -0.63 | 9.5 |
| fixture-y | 25% of triangles | 1679 | 0.61 | 4.76 | 9.01 | -0.61 | 7.9 |
| fixture-y | 10% of triangles | 671 | 0.73 | 3.52 | 9.61 | -0.73 | 15.6 |
| low-tort | as shipped | 37024 | 0.33 | 1.57 | 12.83 | -0.33 | 5.8 |
| low-tort | 50% of triangles | 18500 | 0.39 | 1.89 | 12.69 | -0.39 | 6.5 |
| low-tort | 25% of triangles | 9256 | 0.44 | 1.59 | 12.64 | -0.44 | 6.1 |
| low-tort | 10% of triangles | 3702 | 0.68 | 1.98 | 12.45 | -0.68 | 15.7 |
| type-iii | as shipped | 60448 | 0.25 | 0.77 | 12.79 | -0.25 | 4.8 |
| type-iii | 50% of triangles | 30210 | 0.31 | 1.30 | 12.66 | -0.31 | 5.5 |
| type-iii | 25% of triangles | 15112 | 0.39 | 1.20 | 12.51 | -0.39 | 5.5 |
| type-iii | 10% of triangles | 6041 | 0.63 | 1.74 | 11.92 | -0.63 | 16.6 |
| ts-s1404-cta | as shipped | 78432 | 0.51 | 1.83 | 11.01 | 0.40 | 1.7 |
| ts-s1404-cta | 50% of triangles | 39179 | 0.50 | 1.82 | 11.01 | 0.35 | 1.8 |
| ts-s1404-cta | 25% of triangles | 19595 | 0.48 | 1.74 | 10.93 | 0.30 | 1.7 |
| ts-s1404-cta | 10% of triangles | 7836 | 0.55 | 1.80 | 10.81 | 0.13 | 3.4 |

## fixture-y

| In-plane mm | Slice mm | CNR | Dice | clDice | Wall dist. mm | Centerline offset mm | Radius err. % (mean / p95) | Narrowest pt. err. % | Angle err. at node ° (mean / max) | Angle err. at ostium ° (mean / max) | Vessels kept | Same frontier | Same best route | Verdict flips |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.5 | 1 | 10 | 0.994 | 1.000 | 0.25 | 0.01 | 1.3 / 2.7 | -3.2 | 6 / 10 | 2 / 2 | 3 of 3 | 1 of 2 | 2 of 2 | 1 of 3 |
| 0.5 | 2 | 10 | 0.992 | 1.000 | 0.34 | 0.01 | 1.7 / 3.9 | -2.2 | 10 / 20 | 2 / 3 | 3 of 3 | 1 of 2 | 2 of 2 | 1 of 3 |
| 0.5 | 3 | 10 | 0.992 | 1.000 | 0.44 | 0.02 | 2.8 / 8.8 | -9.0 | 12 / 28 | 2 / 3 | 3 of 3 | 1 of 2 | 2 of 2 | 1 of 3 |
| 0.8 | 1 | 10 | 0.991 | 1.000 | 0.36 | 0.02 | 2.2 / 4.0 | -3.5 | 6 / 10 | 1 / 2 | 3 of 3 | 1 of 2 | 2 of 2 | 1 of 3 |
| 0.8 | 2 | 10 | 0.990 | 1.000 | 0.41 | 0.03 | 2.6 / 5.7 | -5.6 | 7 / 14 | 1 / 1 | 3 of 3 | 1 of 2 | 2 of 2 | 1 of 3 |
| 0.8 | 3 | 10 | 0.989 | 1.000 | 0.49 | 0.03 | 3.1 / 7.0 | 3.4 | 10 / 17 | 1 / 1 | 3 of 3 | 1 of 2 | 2 of 2 | 1 of 3 |
| 1 | 1 | 10 | 0.988 | 1.000 | 0.42 | 0.03 | 2.5 / 6.0 | -6.1 | 4 / 7 | 2 / 2 | 3 of 3 | 2 of 2 | 2 of 2 | 0 of 3 |
| 1 | 2 | 10 | 0.987 | 1.000 | 0.47 | 0.02 | 2.9 / 6.7 | -3.5 | 8 / 13 | 1 / 1 | 3 of 3 | 1 of 2 | 2 of 2 | 1 of 3 |
| 1 | 3 | 10 | 0.986 | 1.000 | 0.53 | 0.03 | 3.6 / 8.6 | -6.0 | 10 / 19 | 0 / 1 | 3 of 3 | 1 of 2 | 2 of 2 | 1 of 3 |
| 1.5 | 1 | 10 | 0.983 | 1.000 | 0.63 | 0.03 | 3.7 / 7.8 | -7.4 | 8 / 12 | 2 / 2 | 3 of 3 | 1 of 2 | 2 of 2 | 1 of 3 |
| 1.5 | 2 | 10 | 0.982 | 1.000 | 0.67 | 0.04 | 4.2 / 8.6 | -5.7 | 8 / 15 | 1 / 1 | 3 of 3 | 1 of 2 | 2 of 2 | 1 of 3 |
| 1.5 | 3 | 10 | 0.981 | 1.000 | 0.70 | 0.04 | 4.3 / 9.4 | -7.8 | 11 / 23 | 2 / 2 | 3 of 3 | 1 of 2 | 2 of 2 | 1 of 3 |
| 2 | 1 | 10 | 0.975 | 1.000 | 0.83 | 0.04 | 5.0 / 9.9 | -4.1 | 5 / 8 | 2 / 2 | 3 of 3 | 2 of 2 | 2 of 2 | 0 of 3 |
| 2 | 2 | 10 | 0.973 | 1.000 | 0.94 | 0.06 | 5.4 / 9.8 | -9.2 | 5 / 6 | 1 / 2 | 3 of 3 | 2 of 2 | 2 of 2 | 0 of 3 |
| 2 | 3 | 10 | 0.972 | 1.000 | 0.97 | 0.06 | 6.4 / 13.6 | 0.5 | 11 / 22 | 1 / 2 | 3 of 3 | 1 of 2 | 2 of 2 | 1 of 3 |
| 0.8 | 1 | 5 | 0.989 | 1.000 | 0.36 | 0.03 | 3.1 / 5.9 | -4.6 | 7 / 15 | 2 / 4 | 3 of 3 | 1 of 2 | 2 of 2 | 1 of 3 |
| 0.8 | 1 | 20 | 0.996 | 1.000 | 0.35 | 0.02 | 1.3 / 2.3 | -2.3 | 7 / 14 | 2 / 3 | 3 of 3 | 1 of 2 | 2 of 2 | 1 of 3 |
| 1.5 | 2 | 5 | 0.979 | 1.000 | 0.70 | 0.07 | 6.8 / 13.2 | -8.4 | 7 / 12 | 2 / 2 | 3 of 3 | 1 of 2 | 2 of 2 | 1 of 3 |
| 1.5 | 2 | 20 | 0.990 | 1.000 | 0.67 | 0.03 | 2.9 / 5.9 | -4.9 | 11 / 18 | 3 / 3 | 3 of 3 | 1 of 2 | 2 of 2 | 1 of 3 |

## low-tort

| In-plane mm | Slice mm | CNR | Dice | clDice | Wall dist. mm | Centerline offset mm | Radius err. % (mean / p95) | Narrowest pt. err. % | Angle err. at node ° (mean / max) | Angle err. at ostium ° (mean / max) | Vessels kept | Same frontier | Same best route | Verdict flips |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.5 | 1 | 10 | 0.993 | 1.000 | 0.23 | 0.02 | 1.9 / 5.1 | -7.5 | 10 / 53 | 3 / 8 | 11 of 11 | 2 of 2 | 2 of 2 | 0 of 6 |
| 0.5 | 2 | 10 | 0.991 | 1.000 | 0.31 | 0.04 | 2.4 / 8.5 | -26.5 | 11 / 56 | 4 / 10 | 11 of 11 | 2 of 2 | 2 of 2 | 0 of 6 |
| 0.5 | 3 | 10 | 0.989 | 0.999 | 0.43 | 0.08 | 3.4 / 12.4 | -100.0 | 18 / 75 | 6 / 19 | 11 of 11 | 2 of 2 | 2 of 2 | 0 of 6 |
| 0.8 | 1 | 10 | 0.990 | 1.000 | 0.34 | 0.03 | 2.8 / 5.6 | -12.6 | 10 / 52 | 3 / 4 | 11 of 11 | 2 of 2 | 2 of 2 | 0 of 6 |
| 0.8 | 2 | 10 | 0.988 | 1.000 | 0.39 | 0.05 | 3.3 / 9.8 | -22.2 | 10 / 55 | 4 / 15 | 11 of 11 | 2 of 2 | 2 of 2 | 0 of 6 |
| 0.8 | 3 | 10 | 0.987 | 0.995 | 0.47 | 0.08 | 4.1 / 12.6 | -67.0 | 19 / 72 | 6 / 17 | 11 of 11 | 1 of 2 | 2 of 2 | 1 of 6 |
| 1 | 1 | 10 | 0.988 | 1.000 | 0.42 | 0.03 | 3.5 / 7.1 | -9.4 | 8 / 50 | 4 / 12 | 11 of 11 | 1 of 2 | 1 of 2 | 3 of 6 |
| 1 | 2 | 10 | 0.986 | 1.000 | 0.45 | 0.05 | 3.9 / 9.5 | -33.3 | 10 / 56 | 4 / 15 | 11 of 11 | 2 of 2 | 2 of 2 | 0 of 6 |
| 1 | 3 | 10 | 0.984 | 0.997 | 0.51 | 0.09 | 4.7 / 13.5 | -49.0 | 11 / 55 | 6 / 18 | 11 of 11 | 2 of 2 | 2 of 2 | 0 of 6 |
| 1.5 | 1 | 10 | 0.982 | 1.000 | 0.59 | 0.05 | 4.9 / 9.1 | -36.5 | 21 / 58 | 4 / 10 | 11 of 11 | 1 of 2 | 1 of 2 | 3 of 6 |
| 1.5 | 2 | 10 | 0.981 | 1.000 | 0.63 | 0.06 | 5.5 / 12.1 | -59.8 | 10 / 52 | 4 / 14 | 11 of 11 | 2 of 2 | 2 of 2 | 0 of 6 |
| 1.5 | 3 | 10 | 0.979 | 0.996 | 0.67 | 0.10 | 6.3 / 15.9 | -100.0 | 19 / 77 | 6 / 17 | 11 of 11 | 2 of 2 | 2 of 2 | 0 of 6 |
| 2 | 1 | 10 | 0.978 | 1.000 | 0.76 | 0.08 | 6.7 / 13.0 | -37.7 | 21 / 86 | 8 / 18 | 11 of 11 | 1 of 2 | 1 of 2 | 3 of 6 |
| 2 | 2 | 10 | 0.976 | 1.000 | 0.83 | 0.08 | 7.5 / 15.2 | -84.9 | 11 / 54 | 5 / 18 | 11 of 11 | 1 of 2 | 1 of 2 | 3 of 6 |
| 2 | 3 | 10 | 0.974 | 0.996 | 0.84 | 0.11 | 8.3 / 21.4 | -100.0 | 19 / 72 | 7 / 21 | 11 of 11 | 2 of 2 | 2 of 2 | 0 of 6 |
| 0.8 | 1 | 5 | 0.988 | 1.000 | 0.35 | 0.04 | 4.4 / 8.2 | -15.9 | 10 / 54 | 3 / 11 | 11 of 11 | 2 of 2 | 2 of 2 | 0 of 6 |
| 0.8 | 1 | 20 | 0.995 | 1.000 | 0.33 | 0.02 | 1.8 / 3.9 | -9.1 | 10 / 53 | 3 / 9 | 11 of 11 | 2 of 2 | 2 of 2 | 0 of 6 |
| 1.5 | 2 | 5 | 0.976 | 0.998 | 0.68 | 0.08 | 8.9 / 15.7 | -100.0 | 6 / 16 | 3 / 3 | 10 of 11 | 2 of 2 | 2 of 2 | 0 of 6 |
| 1.5 | 2 | 20 | 0.990 | 0.999 | 0.62 | 0.05 | 4.0 / 10.0 | -47.6 | 10 / 52 | 5 / 16 | 11 of 11 | 2 of 2 | 2 of 2 | 0 of 6 |

## type-iii

| In-plane mm | Slice mm | CNR | Dice | clDice | Wall dist. mm | Centerline offset mm | Radius err. % (mean / p95) | Narrowest pt. err. % | Angle err. at node ° (mean / max) | Angle err. at ostium ° (mean / max) | Vessels kept | Same frontier | Same best route | Verdict flips |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.5 | 1 | 10 | 0.992 | 1.000 | 0.23 | 0.06 | 2.2 / 4.8 | -8.7 | 21 / 57 | 11 / 37 | 11 of 11 | 1 of 2 | 1 of 2 | 6 of 24 |
| 0.5 | 2 | 10 | 0.990 | 1.000 | 0.32 | 0.13 | 2.7 / 5.6 | -16.6 | 24 / 63 | 20 / 49 | 11 of 11 | 1 of 2 | 1 of 2 | 4 of 24 |
| 0.5 | 3 | 10 | 0.988 | 1.000 | 0.44 | 0.26 | 3.2 / 7.7 | -22.9 | 19 / 54 | 21 / 52 | 11 of 11 | 0 of 2 | 0 of 2 | 8 of 24 |
| 0.8 | 1 | 10 | 0.988 | 1.000 | 0.34 | 0.06 | 3.4 / 7.5 | -13.8 | 23 / 106 | 19 / 50 | 11 of 11 | 0 of 2 | 2 of 2 | 4 of 24 |
| 0.8 | 2 | 10 | 0.987 | 1.000 | 0.39 | 0.14 | 3.8 / 8.1 | -21.3 | 17 / 46 | 14 / 41 | 11 of 11 | 2 of 2 | 1 of 2 | 4 of 24 |
| 0.8 | 3 | 10 | 0.985 | 1.000 | 0.48 | 0.29 | 4.2 / 9.4 | -32.1 | 27 / 50 | 14 / 36 | 10 of 11 | 0 of 2 | 0 of 2 | 24 of 24 |
| 1 | 1 | 10 | 0.986 | 1.000 | 0.42 | 0.09 | 4.3 / 9.8 | -17.9 | 14 / 45 | 12 / 38 | 11 of 11 | 1 of 2 | 2 of 2 | 6 of 24 |
| 1 | 2 | 10 | 0.984 | 1.000 | 0.45 | 0.14 | 4.6 / 8.8 | -24.4 | 15 / 47 | 14 / 45 | 11 of 11 | 1 of 2 | 2 of 2 | 6 of 24 |
| 1 | 3 | 10 | 0.982 | 1.000 | 0.53 | 0.26 | 5.1 / 10.6 | -25.8 | 19 / 45 | 14 / 42 | 11 of 11 | 0 of 2 | 0 of 2 | 10 of 24 |
| 1.5 | 1 | 10 | 0.980 | 1.000 | 0.59 | 0.12 | 6.4 / 15.5 | -19.1 | 21 / 79 | 14 / 36 | 11 of 11 | 0 of 2 | 0 of 2 | 10 of 24 |
| 1.5 | 2 | 10 | 0.978 | 0.999 | 0.63 | 0.17 | 6.8 / 16.2 | -33.6 | 15 / 46 | 13 / 38 | 11 of 11 | 0 of 2 | 0 of 2 | 16 of 24 |
| 1.5 | 3 | 10 | 0.975 | 1.000 | 0.67 | 0.27 | 7.0 / 16.3 | -61.1 | 16 / 46 | 14 / 40 | 11 of 11 | 0 of 2 | 0 of 2 | 16 of 24 |
| 2 | 1 | 10 | 0.974 | 0.998 | 0.75 | 0.19 | 7.8 / 17.7 | -54.7 | 18 / 80 | 14 / 37 | 10 of 11 | 0 of 2 | 0 of 2 | 12 of 24 |
| 2 | 2 | 10 | 0.972 | 0.995 | 0.82 | 0.20 | 9.9 / 25.6 | -74.0 | 16 / 43 | 14 / 38 | 11 of 11 | 0 of 2 | 0 of 2 | 10 of 24 |
| 2 | 3 | 10 | 0.971 | 0.995 | 0.84 | 0.30 | 9.9 / 24.2 | -100.0 | 24 / 56 | 17 / 44 | 10 of 11 | 0 of 2 | 0 of 2 | 24 of 24 |
| 0.8 | 1 | 5 | 0.986 | 1.000 | 0.35 | 0.09 | 5.7 / 13.7 | -29.3 | 17 / 48 | 21 / 49 | 11 of 11 | 0 of 2 | 1 of 2 | 13 of 24 |
| 0.8 | 1 | 20 | 0.994 | 1.000 | 0.33 | 0.07 | 2.2 / 5.3 | -9.3 | 14 / 43 | 12 / 35 | 11 of 11 | 0 of 2 | 2 of 2 | 5 of 24 |
| 1.5 | 2 | 5 | 0.972 | 0.984 | 0.78 | 0.23 | 8.4 / 15.2 | – | 12 / 39 | 13 / 36 | 9 of 11 | 0 of 2 | 0 of 2 | 20 of 24 |
| 1.5 | 2 | 20 | 0.989 | 0.999 | 0.62 | 0.16 | 5.0 / 13.0 | -39.1 | 15 / 47 | 14 / 37 | 11 of 11 | 0 of 2 | 0 of 2 | 16 of 24 |

## ts-s1404-cta

| In-plane mm | Slice mm | CNR | Dice | clDice | Wall dist. mm | Centerline offset mm | Radius err. % (mean / p95) | Narrowest pt. err. % | Angle err. at node ° (mean / max) | Angle err. at ostium ° (mean / max) | Vessels kept | Same frontier | Same best route | Verdict flips |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.5 | 1 | 10 | 0.992 | 1.000 | 0.24 | 0.13 | 1.7 / 3.6 | 3.9 | 17 / 48 | – | 9 of 9 | 0 of 2 | 0 of 2 | 10 of 12 |
| 0.5 | 2 | 10 | 0.988 | 1.000 | 0.36 | 0.26 | 2.4 / 6.0 | -1.5 | 19 / 46 | – | 9 of 9 | 0 of 2 | 0 of 2 | 10 of 12 |
| 0.5 | 3 | 10 | 0.986 | 1.000 | 0.50 | 0.49 | 3.2 / 9.2 | -35.4 | 21 / 43 | – | 9 of 9 | 0 of 2 | 0 of 2 | 10 of 12 |
| 0.8 | 1 | 10 | 0.988 | 1.000 | 0.34 | 0.13 | 2.4 / 4.9 | -5.3 | 14 / 41 | – | 9 of 9 | 0 of 2 | 1 of 2 | 8 of 12 |
| 0.8 | 2 | 10 | 0.985 | 1.000 | 0.42 | 0.26 | 3.0 / 6.8 | -13.3 | 30 / 147 | – | 9 of 9 | 0 of 2 | 0 of 2 | 12 of 12 |
| 0.8 | 3 | 10 | 0.982 | 1.000 | 0.54 | 0.48 | 3.8 / 10.3 | -26.2 | 21 / 47 | – | 9 of 9 | 0 of 2 | 0 of 2 | 10 of 12 |
| 1 | 1 | 10 | 0.986 | 1.000 | 0.41 | 0.13 | 2.9 / 5.3 | -1.6 | 16 / 51 | – | 9 of 9 | 0 of 2 | 1 of 2 | 8 of 12 |
| 1 | 2 | 10 | 0.983 | 1.000 | 0.47 | 0.27 | 3.5 / 7.3 | -14.4 | 22 / 60 | – | 9 of 9 | 0 of 2 | 0 of 2 | 12 of 12 |
| 1 | 3 | 10 | 0.980 | 1.000 | 0.57 | 0.49 | 4.3 / 10.9 | -49.3 | 23 / 53 | – | 9 of 9 | 0 of 2 | 0 of 2 | 12 of 12 |
| 1.5 | 1 | 10 | 0.981 | 1.000 | 0.57 | 0.17 | 3.9 / 7.3 | -6.0 | 17 / 48 | – | 9 of 9 | 0 of 2 | 1 of 2 | 8 of 12 |
| 1.5 | 2 | 10 | 0.978 | 1.000 | 0.63 | 0.26 | 4.7 / 9.4 | -14.2 | 24 / 81 | – | 9 of 9 | 0 of 2 | 0 of 2 | 12 of 12 |
| 1.5 | 3 | 10 | 0.974 | 1.000 | 0.69 | 0.48 | 5.4 / 12.0 | 0.1 | 26 / 81 | – | 9 of 9 | 0 of 2 | 0 of 2 | 12 of 12 |
| 2 | 1 | 10 | 0.975 | 1.000 | 0.73 | 0.37 | 5.2 / 9.4 | -8.9 | 20 / 51 | – | 8 of 9 | 0 of 2 | 0 of 2 | 12 of 12 |
| 2 | 2 | 10 | 0.971 | 0.999 | 0.81 | 0.41 | 5.9 / 11.3 | -33.1 | 22 / 73 | – | 8 of 9 | 0 of 2 | 0 of 2 | 12 of 12 |
| 2 | 3 | 10 | 0.969 | 0.999 | 0.85 | 0.57 | 6.6 / 13.9 | -57.3 | 21 / 74 | – | 8 of 9 | 0 of 2 | 0 of 2 | 12 of 12 |
| 0.8 | 1 | 5 | 0.987 | 1.000 | 0.35 | 0.14 | 3.6 / 6.9 | -15.2 | 15 / 45 | – | 9 of 9 | 0 of 2 | 1 of 2 | 8 of 12 |
| 0.8 | 1 | 20 | 0.994 | 1.000 | 0.33 | 0.13 | 1.5 / 3.1 | -1.3 | 14 / 45 | – | 9 of 9 | 0 of 2 | 1 of 2 | 8 of 12 |
| 1.5 | 2 | 5 | 0.975 | 1.000 | 0.67 | 0.27 | 7.3 / 13.9 | -42.1 | 20 / 52 | – | 9 of 9 | 0 of 2 | 0 of 2 | 12 of 12 |
| 1.5 | 2 | 20 | 0.989 | 1.000 | 0.62 | 0.26 | 3.1 / 6.5 | -14.1 | 22 / 71 | – | 9 of 9 | 0 of 2 | 0 of 2 | 12 of 12 |
