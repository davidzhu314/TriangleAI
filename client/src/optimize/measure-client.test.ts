import { describe, expect, it } from 'vitest';
import { loadFixtureY } from './fixture-y.testutil';
import { buildGraph } from './graph';
import { createMeasureWorker, type MeasurePort } from './measure-client';
import { createMeasureHandler, type MeasureRequest, type MeasureResponse } from './measure-protocol';
import { measureRoute } from './measure-route';

/**
 * A fake Worker that runs the real handler asynchronously, with a structured-clone round trip each
 * way, like postMessage.
 */
function fakePort(): MeasurePort & { sent: MeasureRequest[] } {
  const handle = createMeasureHandler();
  const port: MeasurePort & { sent: MeasureRequest[] } = {
    sent: [],
    onmessage: null,
    postMessage(message) {
      const msg = structuredClone(message);
      port.sent.push(msg);
      queueMicrotask(() => {
        const res: MeasureResponse = structuredClone(handle(msg));
        port.onmessage?.({ data: res } as MessageEvent<MeasureResponse>);
      });
    },
    terminate() {},
  };
  return port;
}

describe('measure Worker client', () => {
  const c = loadFixtureY();

  it('loads a case without its mesh and measures routes like the main thread', async () => {
    const port = fakePort();
    const m = createMeasureWorker(() => port);
    const loaded = await m.load(c);
    expect(loaded.edges).toBe(3);
    expect('mesh' in (port.sent[0] as { case: object }).case).toBe(false);
    const viaWorker = await m.measureRoute(['e_aorta', 'e_left']);
    expect(viaWorker).toEqual(measureRoute(buildGraph(c), ['e_aorta', 'e_left']));
  });

  it('answers concurrent calls by id', async () => {
    const m = createMeasureWorker(fakePort);
    await m.load(c);
    const [a, b, d] = await Promise.all([
      m.measureRoute(['e_aorta']),
      m.measureRoute(['e_aorta', 'e_right']),
      m.edgeMeasures('e_right'),
    ]);
    expect(a.cost.heavyCrossings).toBe(0);
    expect(b.cost.heavyCrossings).toBe(1);
    expect(d.zonesOnEdge).toEqual(['plaque_r']);
    expect(d.proximityClearanceM).toEqual({});
  });

  it('rejects bad requests and keeps working', async () => {
    const m = createMeasureWorker(fakePort);
    await expect(m.measureRoute(['e_aorta'])).rejects.toThrow(/no case loaded/);
    await m.load(c);
    await expect(m.measureRoute(['e_aorta', 'e_left'], { startNode: 'n_left' })).rejects.toThrow(/does not continue/);
    // the reverse walk, from the left target back to the entry, is a valid chain
    expect((await m.measureRoute(['e_left', 'e_aorta'], { startNode: 'n_left' })).cost.lengthM).toBeCloseTo(0.15, 6);
    expect((await m.measureRoute(['e_aorta'])).cost.lengthM).toBeCloseTo(0.1, 6);
  });
});
