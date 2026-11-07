/**
 * Main-thread client for the measure Worker.
 *
 *   const measurer = createMeasureWorker();
 *   await measurer.load(loadedCase);
 *   const m = await measurer.measureRoute(['e_aorta', 'e_left']);   // RouteMeasures
 *
 * Calls resolve in the order they were sent. A rejected call means the request was bad (unknown
 * edge, a chain that doesn't connect, no case loaded); the Worker keeps running.
 */

import type { LoadedCase, RouteMeasures } from '../contracts';
import { stripMesh, type EdgeMeasuresMessage, type MeasureRequest, type MeasureResponse } from './measure-protocol';
import type { MeasureRouteOptions } from './measure-route';

/** The part of Worker the client uses, so tests can pass a fake. */
export interface MeasurePort {
  postMessage(message: MeasureRequest): void;
  onmessage: ((event: MessageEvent<MeasureResponse>) => void) | null;
  terminate(): void;
}

export interface MeasureWorkerClient {
  /** Build the graph for a case. Resolves with the build time on the Worker, ms. */
  load(c: LoadedCase): Promise<{ edges: number; buildMs: number }>;
  measureRoute(edges: readonly string[], options?: MeasureRouteOptions): Promise<RouteMeasures>;
  edgeMeasures(edge: string): Promise<EdgeMeasuresMessage>;
  terminate(): void;
}

const defaultPort = (): MeasurePort =>
  new Worker(new URL('./measure.worker.ts', import.meta.url), { type: 'module' }) as unknown as MeasurePort;

type Distribute<T> = T extends unknown ? Omit<T, 'id'> : never;

export function createMeasureWorker(createPort: () => MeasurePort = defaultPort): MeasureWorkerClient {
  const port = createPort();
  let nextId = 1;
  const pending = new Map<number, { resolve: (r: MeasureResponse) => void }>();
  port.onmessage = (event) => {
    const p = pending.get(event.data.id);
    if (!p) return;
    pending.delete(event.data.id);
    p.resolve(event.data);
  };

  async function send(msg: Distribute<MeasureRequest>): Promise<MeasureResponse> {
    const id = nextId++;
    const done = new Promise<MeasureResponse>((resolve) => pending.set(id, { resolve }));
    port.postMessage({ ...msg, id } as MeasureRequest);
    const res = await done;
    if (!res.ok) throw new Error(res.error);
    return res;
  }

  return {
    async load(c) {
      const res = await send({ type: 'load', case: stripMesh(c) });
      if (res.ok && res.type === 'load') return { edges: res.edges, buildMs: res.buildMs };
      throw new Error('unexpected response');
    },
    async measureRoute(edges, options) {
      const msg: Distribute<MeasureRequest> = options
        ? { type: 'measureRoute', edges: [...edges], options }
        : { type: 'measureRoute', edges: [...edges] };
      const res = await send(msg);
      if (res.ok && res.type === 'measureRoute') return res.result;
      throw new Error('unexpected response');
    },
    async edgeMeasures(edge) {
      const res = await send({ type: 'edgeMeasures', edge });
      if (res.ok && res.type === 'edgeMeasures') return res.result;
      throw new Error('unexpected response');
    },
    terminate() {
      port.terminate();
      pending.clear();
    },
  };
}
