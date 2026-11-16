/**
 * Scan-accuracy harness (Phase 0 of team/requests/to-david-and-vaibhav-from-aroovee-medical-accuracy.md).
 *
 * A case whose geometry we know is turned into a synthetic CT angiogram at a chosen resolution and noise level,
 * the image is segmented and traced back to centerlines with radii, and the result is scored against the truth:
 * voxel overlap, topology, wall distance, centerline offset, radius error, branch angles, and whether the route
 * engine still gives the same answers. Everything is arithmetic on voxels and the existing optimizer; no AI model.
 *
 * What the numbers are, and are not: errors of this classical pipeline on a clean synthetic image. A real scan
 * has bone, calcium, veins and motion, so its errors are at least these. Nothing here is a clinical claim.
 */
import type { LoadedCase } from '../../contracts';
import { hMax, truthOf, voxelCount, type Truth } from './grid';
import { compareRoutes, type Downstream } from './downstream';
import { acquire, gridFor, rasterize, type ScanSettings } from './phantom';
import { segmentAndTrace, type PipelineOptions } from './pipeline';
import { recoverEdges, recoveredCase, type RecoveredGeometry } from './recovered';
import { scoreGeometry, scoreVoxels, type GeometryScore, type VoxelScore } from './score';

export type { ScanSettings } from './phantom';
export type { PipelineOptions } from './pipeline';
export type { Downstream, TargetComparison } from './downstream';
export type { EdgeScore, GeometryScore, VoxelScore } from './score';
export { truthOf } from './grid';
export { compareRoutes } from './downstream';
export { recoveredCase, type RecoveredGeometry } from './recovered';
export { scoreGeometry } from './score';
export { scoreMesh, scoreMeshBytes, type MeshScore } from './mesh';

/** Above this many voxels a run is refused (memory: about six bytes a voxel). */
export const MAX_VOXELS = 140_000_000;

export const DEFAULT_SCAN: ScanSettings = { spacingMm: 1, sliceMm: 1, cnr: 10, smoothPasses: 0, seed: 1 };

export interface ScanAccuracy {
  caseId: string;
  settings: ScanSettings;
  grid: { nx: number; ny: number; nz: number; voxels: number };
  voxel: VoxelScore;
  geometry: GeometryScore;
  topology: {
    edges: number;
    edgesRecovered: number;
    missingEdges: string[];
    /** Marked ends (entries, targets, other vessel ends) with no vessel left near them. */
    lostEndpoints: string[];
    /** Marked ends cut off from the rest. */
    disconnected: string[];
  };
  downstream: Downstream;
  ms: number;
}

export class ScanTooLargeError extends Error {}

/** Scan a known case, run the pipeline on the image, and score the result against the case. */
export function runScanAccuracy(c: LoadedCase, settings: ScanSettings = DEFAULT_SCAN, options: PipelineOptions = {}): ScanAccuracy {
  const t0 = performance.now();
  const truth = truthOf(c);
  const g = gridFor(truth, settings);
  const voxels = voxelCount(g);
  if (voxels > MAX_VOXELS) throw new ScanTooLargeError(`${c.id}: ${voxels} voxels at ${settings.spacingMm} × ${settings.sliceMm} mm is over the ${MAX_VOXELS} limit`);
  const { mask, image } = acquire(rasterize(truth, g), g, settings);
  const seg = segmentAndTrace(mask, image, g, truth.endpoints, options);
  const geom = recoverEdges(truth, seg.tree, seg.root, seg.reached, 2 * hMax(g));
  return {
    caseId: c.id,
    settings,
    grid: { nx: g.nx, ny: g.ny, nz: g.nz, voxels },
    voxel: scoreVoxels(seg, truth),
    geometry: scoreGeometry(truth, geom),
    topology: { edges: truth.edges.length, edgesRecovered: geom.edges.size, missingEdges: geom.missingEdges, lostEndpoints: seg.lostEndpoints, disconnected: seg.disconnected },
    downstream: compareRoutes(c, recoveredCase(c, geom)),
    ms: Math.round(performance.now() - t0),
  };
}

/**
 * Score centerlines that another pipeline made from the same phantom (for example a Slicer export loaded with
 * loadCase), without voxels: centerline, radius and branch-angle errors, and the route comparison.
 * The other case must keep the true case's edge and node ids.
 */
export function scoreAgainstTruth(truthCase: LoadedCase, other: LoadedCase): { geometry: GeometryScore; downstream: Downstream; missingEdges: string[] } {
  const truth: Truth = truthOf(truthCase);
  const o = truthOf(other);
  const geom: RecoveredGeometry = {
    edges: new Map(o.edges.map((e) => [e.id, { id: e.id, pts: e.pts, radii: e.radii }])),
    nodes: o.nodes,
    missingEdges: truth.edges.filter((e) => !o.edges.some((x) => x.id === e.id)).map((e) => e.id),
  };
  return { geometry: scoreGeometry(truth, geom), downstream: compareRoutes(truthCase, other), missingEdges: geom.missingEdges };
}
