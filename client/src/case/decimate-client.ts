/**
 * Run decimateGlb in a Web Worker (§3.5: "Decimate in a Web Worker"). Where Worker does not exist
 * (Node tests), it runs inline with the same function.
 */
import { decimateGlb } from './decimate';

export interface DecimateRequest {
  glb: ArrayBuffer;
  targetTriangles: number;
}

export type DecimateResponse = { ok: true; glb: ArrayBuffer } | { ok: false; message: string };

export type Decimator = (glb: Uint8Array, targetTriangles: number) => Promise<Uint8Array>;

export const decimateInWorker: Decimator = async (glb, targetTriangles) => {
  if (typeof Worker === 'undefined') return decimateGlb(glb, targetTriangles);
  const worker = new Worker(new URL('./decimate.worker.ts', import.meta.url), { type: 'module' });
  try {
    const response = await new Promise<DecimateResponse>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<DecimateResponse>) => resolve(e.data);
      worker.onerror = (e) => reject(new Error(e.message || 'the decimation worker failed'));
      const copy = glb.slice().buffer;
      const request: DecimateRequest = { glb: copy, targetTriangles };
      worker.postMessage(request, [copy]);
    });
    if (!response.ok) throw new Error(response.message);
    return new Uint8Array(response.glb);
  } finally {
    worker.terminate();
  }
};
