/**
 * Measure Worker: builds the vessel graph off the main thread and answers measureRoute calls.
 * Start it with createMeasureWorker() from client/src/optimize.
 */

import { createMeasureHandler, type MeasureRequest, type MeasureResponse } from './measure-protocol';

// The project compiles with the DOM lib, so type only the part of the worker scope used here.
interface WorkerScope {
  onmessage: ((event: MessageEvent<MeasureRequest>) => void) | null;
  postMessage(message: MeasureResponse): void;
}

const handle = createMeasureHandler();
const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
  scope.postMessage(handle(event.data));
};
