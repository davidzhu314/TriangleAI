/**
 * Optimizer entry point for the app. Import from here, never from ./mock.
 *
 * - measureRoute (V2) and the optimizer (V3) are REAL, either on the main thread (buildGraph +
 *   measureRoute / optimizeCase) or in a Web Worker (createMeasureWorker()).
 * - optimize(request, case): with VITE_ENGINE=mock, it returns the V1 mock (fixture-y only,
 *   placeholder numbers) and the mock is the only thing the flag switches. In a real build the
 *   mock is not bundled and the real optimizer runs on the given LoadedCase.
 * - createRanker(frontier)(weights) re-ranks for each slider move (spec §4.8).
 */

import type { LoadedCase, OptimizeRequest, OptimizeResult } from '../contracts';
import { buildGraph, type RouteGraph } from './graph';
import { optimizeCase, RouteEnumerator } from './optimizer';

export { engineMode, type EngineMode } from './engine-mode';
export { buildGraph, type EdgeMeasures, type GraphEdge, type RouteGraph } from './graph';
export { measureRoute, orientRoute, RouteError, type MeasureRouteOptions, type OrientedRoute } from './measure-route';
export { createMeasureWorker, type MeasurePort, type MeasureWorkerClient } from './measure-client';
export { DEG_PER_TURN, FLUORO_S_PER_CM, FLUORO_S_PER_TURN, PROXIMITY_SCALE_M } from './constants';
export { getPreset, PRESET_IDS, WIRE_PRESETS } from './presets';
export { isSafe, LARGE_GRAPH_EDGES, optimizeCase, RouteEnumerator, routeFor, routeId } from './optimizer';
export { dominates, frontierLabels, LABEL_MEASURE, paretoFrontier } from './frontier';
export { createRanker, measureRanges, normalisedCost, normaliseWeights, rankRoutes, weightedScore, type MeasureRanges } from './rank';
export { DFS_PATH_CAP, simplePaths, YEN_K, yenKShortest, type GraphPath } from './paths';

const cache = new WeakMap<LoadedCase, { graph: RouteGraph; enumerator: RouteEnumerator }>();

export async function optimize(request: OptimizeRequest, loadedCase?: LoadedCase): Promise<OptimizeResult> {
  if (import.meta.env.VITE_ENGINE === 'mock') {
    const { mockOptimize } = await import('./mock');
    return mockOptimize(request);
  }
  if (!loadedCase) throw new Error('optimize: pass the LoadedCase (or use createMeasureWorker().optimize).');
  let entry = cache.get(loadedCase);
  if (!entry) {
    const graph = buildGraph(loadedCase);
    entry = { graph, enumerator: new RouteEnumerator(graph) };
    cache.set(loadedCase, entry);
  }
  return optimizeCase(entry.graph, request, entry.enumerator);
}
