/**
 * Optimizer entry point for the app. Import from here, never from ./mock.
 *
 * - measureRoute (V2) is REAL in every build: buildGraph + measureRoute on the main thread, or
 *   createMeasureWorker() to run them in a Web Worker.
 * - optimize(): with VITE_ENGINE=mock, calls go to the V1 mock (fixture-y only, placeholder
 *   numbers). In a real build the mock is not bundled, and the call rejects until the real
 *   optimizer lands in V3.
 */

import type { OptimizeRequest, OptimizeResult } from '../contracts';

export { engineMode, type EngineMode } from './engine-mode';
export { buildGraph, type EdgeMeasures, type GraphEdge, type RouteGraph } from './graph';
export { measureRoute, orientRoute, RouteError, type MeasureRouteOptions, type OrientedRoute } from './measure-route';
export { createMeasureWorker, type MeasurePort, type MeasureWorkerClient } from './measure-client';
export { DEG_PER_TURN, FLUORO_S_PER_CM, FLUORO_S_PER_TURN, PROXIMITY_SCALE_M } from './constants';

export async function optimize(request: OptimizeRequest): Promise<OptimizeResult> {
  if (import.meta.env.VITE_ENGINE === 'mock') {
    const { mockOptimize } = await import('./mock');
    return mockOptimize(request);
  }
  throw new Error('The real optimizer lands in V3. Build or run with VITE_ENGINE=mock to use the mock.');
}
