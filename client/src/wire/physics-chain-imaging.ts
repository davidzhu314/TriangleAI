/**
 * Imaging for the chain simulation: what the trainee can know about the device, and what it costs. Pure state, no
 * rendering; the Drive screen draws from it (DECISIONS.md 2026-11-08, "Chain simulation").
 *
 * - **Fluoroscopy is press-and-hold.** While it is held, frames are captured at the selected pulse rate. Each frame is a
 *   snapshot of the device at that moment. Between frames, and when fluoro is off, nothing about the device updates.
 * - **Last-image-hold.** On release, the last frame becomes the held image with its capture time. It is frozen: moving
 *   the device afterwards never changes it, and `heldIsStale` says when the device has moved since it was captured.
 * - **Contrast is a separate resource.** An injection opacifies the vessels for `CONTRAST_WINDOW_S`; only frames
 *   captured while fluoro is held in that window show vessels.
 * - **Roadmap.** A roadmap can be stored from a contrast frame. It is a static vessel image with its capture time; it
 *   never refreshes and holds no device.
 * - **Resources.** Fluoro time, activations, frames, and a simulated exposure score in unitless units, not a dose.
 *   Contrast injections and simulated contrast units, not millilitres.
 *
 * Every number here is illustrative and labelled so on screen. No AI model computes any number here.
 */
import type { Vec3 } from '../contracts';
import type { DeviceId } from './physics-chain';

/** Pulse-rate presets (illustrative). Fewer frames per second: less simulated exposure, staler and noisier images. */
export const PULSE_PRESETS = {
  continuous: { fps: 30, noise: 1.0, label: 'Continuous (30 frames/s)' },
  p15: { fps: 15, noise: 1.2, label: 'Pulsed 15/s' },
  p7_5: { fps: 7.5, noise: 1.5, label: 'Pulsed 7.5/s' },
} as const;
export type PulseRate = keyof typeof PULSE_PRESETS;

/** Simulated exposure per frame (unitless; not a dose). */
export const EXPOSURE_UNITS_PER_FRAME = 1;
/** How long one injection keeps the vessels opacified, seconds (illustrative). */
export const CONTRAST_WINDOW_S = 1.5;
/** Simulated contrast per injection (unitless; not millilitres). */
export const CONTRAST_UNITS_PER_INJECTION = 1;
/** The device has moved since the held image once its tip or an inserted length changed by this much, metres. */
export const STALE_M = 0.0005;

/** What the device looked like when a frame was taken. */
export interface DeviceSnapshot {
  points: Record<DeviceId, Vec3[]>;
  tip: Vec3;
  inserted: Record<DeviceId, number>;
}

export interface ImageFrame {
  /** Capture time, seconds of simulation. */
  t: number;
  pulse: PulseRate;
  /** The vessels were opacified in this frame. */
  contrast: boolean;
  device: DeviceSnapshot;
}

export interface Roadmap {
  /** Capture time of the contrast frame it was stored from. */
  t: number;
}

export interface ImagingTotals {
  fluoroS: number;
  activations: number;
  frames: number;
  exposureUnits: number;
  contrastInjections: number;
  contrastUnits: number;
  roadmaps: number;
}

export interface ImagingInterval {
  from: number;
  to: number;
  pulse: PulseRate;
  frames: number;
}

export interface ImagingState {
  t: number;
  held: boolean;
  pulse: PulseRate;
  /** Time the next frame is due while fluoro is held. */
  nextFrameT: number;
  /** The newest frame while fluoro is held; null when it is off. */
  live: ImageFrame | null;
  /** The last-image-hold: frozen at release. */
  holdImage: ImageFrame | null;
  roadmap: Roadmap | null;
  contrastUntil: number;
  totals: ImagingTotals;
  intervals: ImagingInterval[];
}

export interface ImagingInput {
  fluoro: boolean;
  pulse: PulseRate;
  /** True on the frame the trainee injects contrast. */
  inject: boolean;
  /** True on the frame the trainee stores a roadmap. */
  storeRoadmap: boolean;
}

export type ImagingNotice = 'roadmap_needs_contrast_frame';

export function initialImaging(): ImagingState {
  return {
    t: 0,
    held: false,
    pulse: 'continuous',
    nextFrameT: 0,
    live: null,
    holdImage: null,
    roadmap: null,
    contrastUntil: -Infinity,
    totals: { fluoroS: 0, activations: 0, frames: 0, exposureUnits: 0, contrastInjections: 0, contrastUnits: 0, roadmaps: 0 },
    intervals: [],
  };
}

const copy = (d: DeviceSnapshot): DeviceSnapshot => ({
  points: { wire: d.points.wire.map((p) => [...p] as Vec3), catheter: d.points.catheter.map((p) => [...p] as Vec3) },
  tip: [...d.tip] as Vec3,
  inserted: { ...d.inserted },
});

/**
 * Advance imaging by `dt` to time `t`. `device` is the true device at `t`; it enters the state only through a frame.
 * Returns the frame captured this step, if any, and a notice when a request could not be met.
 */
export function stepImaging(prev: ImagingState, input: ImagingInput, device: DeviceSnapshot, t: number, dt: number): { state: ImagingState; frame: ImageFrame | null; notice: ImagingNotice | null } {
  const state: ImagingState = { ...prev, totals: { ...prev.totals }, intervals: prev.intervals.map((i) => ({ ...i })), t };
  let frame: ImageFrame | null = null;
  let notice: ImagingNotice | null = null;

  if (input.inject) {
    state.totals.contrastInjections += 1;
    state.totals.contrastUnits += CONTRAST_UNITS_PER_INJECTION;
    state.contrastUntil = t + CONTRAST_WINDOW_S;
  }

  if (input.fluoro) {
    if (!prev.held) {
      state.totals.activations += 1;
      state.intervals.push({ from: t - dt, to: t, pulse: input.pulse, frames: 0 });
      state.nextFrameT = t; // the first frame comes as soon as fluoro is pressed
    }
    state.held = true;
    state.pulse = input.pulse;
    state.totals.fluoroS += dt;
    const open = state.intervals.at(-1)!;
    open.to = t;
    if (t + 1e-9 >= state.nextFrameT) {
      frame = { t, pulse: input.pulse, contrast: t < state.contrastUntil, device: copy(device) };
      state.live = frame;
      state.totals.frames += 1;
      state.totals.exposureUnits += EXPOSURE_UNITS_PER_FRAME;
      open.frames += 1;
      state.nextFrameT = t + 1 / PULSE_PRESETS[input.pulse].fps;
    }
  } else if (prev.held) {
    // Release: the last frame becomes the held image, frozen with its capture time.
    state.held = false;
    state.holdImage = prev.live;
    state.live = null;
  }

  if (input.storeRoadmap) {
    const source = state.live ?? state.holdImage;
    if (source?.contrast) {
      state.roadmap = { t: source.t };
      state.totals.roadmaps += 1;
    } else notice = 'roadmap_needs_contrast_frame';
  }
  return { state, frame, notice };
}

/** Seconds since the held image was captured, or null with none. */
export function heldImageAge(s: ImagingState): number | null {
  return s.holdImage ? s.t - s.holdImage.t : null;
}

/** Whether the device has moved since the held image (so the image no longer shows where it is). */
export function heldIsStale(s: ImagingState, now: DeviceSnapshot): boolean {
  const img = s.holdImage;
  if (!img) return false;
  const d = img.device;
  const tipMoved = Math.hypot(now.tip[0] - d.tip[0], now.tip[1] - d.tip[1], now.tip[2] - d.tip[2]) > STALE_M;
  const fed = Math.abs(now.inserted.wire - d.inserted.wire) > STALE_M || Math.abs(now.inserted.catheter - d.inserted.catheter) > STALE_M;
  return tipMoved || fed;
}
