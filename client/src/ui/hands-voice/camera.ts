/**
 * The camera side of hands-free input: the front camera into MediaPipe's HandLandmarker, then Vaibhav's gesture
 * machine. Everything runs in this browser: frames never leave the device. MediaPipe's WASM and the hand model are
 * served from the app (David: @mediapipe/tasks-vision 1.2.2, client/public/models/hand_landmarker.task), no CDN.
 */
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import { createGestureMachine, type GestureOutput, type HandFrame } from '../../input';
import { toHandObservations } from './observations';

export interface HandTracker {
  stop(): void;
}

export type TrackerError = 'no-camera' | 'denied' | 'model';

/**
 * Open the camera into `video`, track hands, and call `onGesture` once per new video frame. Resolves once tracking
 * runs; rejects with a TrackerError the caller can put in words.
 */
export async function startHandTracking(video: HTMLVideoElement, onGesture: (g: GestureOutput) => void): Promise<HandTracker> {
  if (!navigator.mediaDevices?.getUserMedia) throw 'no-camera' satisfies TrackerError;
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
  } catch (e) {
    throw (e instanceof DOMException && e.name === 'NotAllowedError' ? 'denied' : 'no-camera') satisfies TrackerError;
  }
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play().catch(() => undefined);

  let landmarker: import('@mediapipe/tasks-vision').HandLandmarker;
  try {
    const { HandLandmarker } = await import('@mediapipe/tasks-vision');
    const options = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}models/hand_landmarker.task`, delegate },
      runningMode: 'VIDEO' as const,
      numHands: 2,
    });
    const fileset = { wasmLoaderPath, wasmBinaryPath };
    landmarker = await HandLandmarker.createFromOptions(fileset, options('GPU')).catch(() => HandLandmarker.createFromOptions(fileset, options('CPU')));
  } catch {
    for (const t of stream.getTracks()) t.stop();
    throw 'model' satisfies TrackerError;
  }

  // The camera is un-mirrored; the machine flips x once so poses and the pointer work in the selfie view.
  const machine = createGestureMachine({ dominant: 'Right', mirrored: true });
  let raf = 0;
  let lastTime = -1;
  let stopped = false;
  const loop = (): void => {
    if (stopped) return;
    if (video.readyState >= 2 && video.currentTime !== lastTime) {
      lastTime = video.currentTime;
      const tMs = video.currentTime * 1000; // the frame's own time, never a clock (the machine's rule)
      const result = landmarker.detectForVideo(video, performance.now());
      const frame: HandFrame = { tMs, hands: toHandObservations(result) };
      onGesture(machine.step(frame));
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      landmarker.close();
      for (const t of stream.getTracks()) t.stop();
      video.srcObject = null;
    },
  };
}

/**
 * Under automation only (navigator.webdriver): feed recorded frames to a fresh gesture machine, so a test can
 * drive the same pipeline with a real recorded hand when there is no camera.
 */
export function feedFrames(onGesture: (g: GestureOutput) => void): (frame: HandFrame) => void {
  const machine = createGestureMachine({ dominant: 'Right', mirrored: true });
  return (frame) => onGesture(machine.step(frame));
}
