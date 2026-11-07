/**
 * Optimizer entry point for the app. Import from here, never from ./mock.
 *
 * With VITE_ENGINE=mock, calls go to the V1 mock (fixture-y only, placeholder numbers). In a real
 * build the mock is not bundled. The real optimizer lands in V3; until then, a real build
 * rejects with an error saying so.
 */

import type { OptimizeRequest, OptimizeResult } from '../contracts';

export { engineMode, type EngineMode } from './engine-mode';

export async function optimize(request: OptimizeRequest): Promise<OptimizeResult> {
  if (import.meta.env.VITE_ENGINE === 'mock') {
    const { mockOptimize } = await import('./mock');
    return mockOptimize(request);
  }
  throw new Error('The real optimizer lands in V3. Build or run with VITE_ENGINE=mock to use the mock.');
}
