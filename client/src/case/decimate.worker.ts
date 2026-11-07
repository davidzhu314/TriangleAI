/**
 * Decimation Worker: keeps the mesh-budget fix (§3.5) off the main thread.
 * Start it through decimateInWorker() in decimate-client.ts.
 */
import { decimateGlb } from './decimate';
import type { DecimateRequest, DecimateResponse } from './decimate-client';

// The project compiles with the DOM lib, so type only the part of the worker scope used here.
interface WorkerScope {
  onmessage: ((event: MessageEvent<DecimateRequest>) => void) | null;
  postMessage(message: DecimateResponse, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
  try {
    const out = decimateGlb(new Uint8Array(event.data.glb), event.data.targetTriangles);
    const copy = out.slice().buffer;
    scope.postMessage({ ok: true, glb: copy }, [copy]);
  } catch (err) {
    scope.postMessage({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
};
