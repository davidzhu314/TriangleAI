/**
 * RailWireSource: the rail wire as a WireSource (spec §5.1, §5.3, §5.6). It wraps the pure
 * `step` in ./rail. Every tick advances simulation time by exactly 1/EVENT_SAMPLE_HZ and writes
 * one 30 Hz sample, so the same control sequence gives the same EventLog.
 *
 * Rail never falls back, so onFallback never fires. Screens get a source from select.ts (David),
 * never by importing this file directly.
 */

import {
  EVENT_SAMPLE_HZ,
  clampControl,
  createEventLog,
  type ControlInput,
  type EventLog,
  type Unsubscribe,
  type Vec3,
  type WireFallback,
  type WireSource,
  type WireStartRequest,
  type WireState,
} from '../contracts';
import type { Point3 } from '../optimize/measures';
import { createRailModel, initialRailState, railBody, railEdge, railTip, step, type RailModel, type RailState } from './rail';
import { railAutopilot } from './rail-autopilot';

export interface RailWireOptions {
  /** 'interval' (default) ticks at 30 Hz; 'manual' waits for tick(). */
  clock?: 'interval' | 'manual';
  /** Ignore push and rotate and drive the planned path (demos). Fluoro and contrast still pass through. */
  autoDrive?: boolean;
}

export const RAIL_DT_S = 1 / EVENT_SAMPLE_HZ;

const toVec3 = (p: Point3): Vec3 => [p[0], p[1], p[2]];

export class RailWireSource implements WireSource {
  readonly mode = 'rail' as const;

  private readonly clock: 'interval' | 'manual';
  private readonly autoDrive: boolean;
  private stateListeners = new Set<(s: WireState) => void>();
  private fallbackListeners = new Set<(f: WireFallback) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private model: RailModel | null = null;
  private state: RailState | null = null;
  private log: EventLog | null = null;
  private input: ControlInput = { push: 0, rotate: 0, fluoro: false, contrastPuff: false };
  private puffPending = false;
  private last: WireState | null = null;

  constructor(options: RailWireOptions = {}) {
    this.clock = options.clock ?? 'interval';
    this.autoDrive = options.autoDrive ?? false;
  }

  async start(request: WireStartRequest): Promise<void> {
    this.halt();
    this.model = createRailModel(request.case, request.entryId, request.targetId, request.presetId, request.path);
    this.state = initialRailState(this.model);
    this.log = createEventLog({
      mode: 'rail',
      caseId: request.case.id,
      entryId: request.entryId,
      targetId: request.targetId,
      presetId: request.presetId,
      path: request.path,
    });
    this.input = { push: 0, rotate: 0, fluoro: false, contrastPuff: false };
    this.puffPending = false;
    this.emit();
    if (this.clock === 'interval') this.timer = setInterval(() => this.tick(), 1000 / EVENT_SAMPLE_HZ);
  }

  control(input: ControlInput): void {
    this.input = { push: clampControl(input.push), rotate: clampControl(input.rotate), fluoro: input.fluoro, contrastPuff: input.contrastPuff };
    if (input.contrastPuff) this.puffPending = true;
  }

  /** Advance one 1/30 s step of simulation time. */
  tick(): void {
    if (!this.model || !this.state || !this.log) return;
    const drive = this.autoDrive ? railAutopilot(this.model, this.state, RAIL_DT_S, this.input.fluoro) : this.input;
    const input: ControlInput = { ...drive, fluoro: this.input.fluoro, contrastPuff: this.puffPending };
    this.puffPending = false;
    const res = step(this.model, this.state, input, RAIL_DT_S);
    this.state = res.state;
    this.log.events.push(...res.events);
    this.emit();
  }

  /**
   * The drive so far, as a copy: what Cathy's mid-drive answers need (`driveAssist` takes a partial log).
   * Null before start and after stop. Copying a few thousand samples is fine for a voice command, not per frame.
   */
  logSoFar(): EventLog | null {
    return this.log ? structuredClone(this.log) : null;
  }

  async stop(): Promise<EventLog> {
    this.halt();
    if (!this.log) throw new Error('RailWireSource.stop: not started');
    const out = structuredClone(this.log);
    this.log = null;
    this.state = null;
    this.model = null;
    return out;
  }

  onState(listener: (state: WireState) => void): Unsubscribe {
    this.stateListeners.add(listener);
    if (this.last) listener(this.last);
    return () => this.stateListeners.delete(listener);
  }

  /** Rail never falls back; kept for the interface. */
  onFallback(listener: (fallback: WireFallback) => void): Unsubscribe {
    this.fallbackListeners.add(listener);
    return () => this.fallbackListeners.delete(listener);
  }

  private halt(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private emit(): void {
    const m = this.model!;
    const st = this.state!;
    const tip = toVec3(railTip(m, st));
    const edge = railEdge(m, st);
    const ws: WireState = {
      mode: 'rail',
      t: st.t,
      wire: railBody(m, st).map(toVec3),
      tip,
      s: st.s,
      edge,
      rollRad: st.rollRad,
      contactForceN: st.forceN,
      fluoro: st.fluoro,
      atTarget: st.atTarget,
    };
    this.log!.samples.push({ t: st.t, tip: [...tip], s: st.s, edge, forceN: st.forceN, fluoro: st.fluoro });
    this.last = ws;
    for (const l of this.stateListeners) l(ws);
  }
}

/**
 * Run a whole drive offline: a pure replay of an input log through `step`, at 30 Hz. Each input
 * is one tick. Returns the same EventLog RailWireSource would write.
 */
export function replayRail(request: WireStartRequest, inputs: readonly ControlInput[]): EventLog {
  const model = createRailModel(request.case, request.entryId, request.targetId, request.presetId, request.path);
  let state = initialRailState(model);
  const log = createEventLog({
    mode: 'rail',
    caseId: request.case.id,
    entryId: request.entryId,
    targetId: request.targetId,
    presetId: request.presetId,
    path: request.path,
  });
  const sample = () => {
    const tip = toVec3(railTip(model, state));
    log.samples.push({ t: state.t, tip, s: state.s, edge: railEdge(model, state), forceN: state.forceN, fluoro: state.fluoro });
  };
  sample();
  for (const input of inputs) {
    const res = step(model, state, input, RAIL_DT_S);
    state = res.state;
    log.events.push(...res.events);
    sample();
  }
  return log;
}

/**
 * The drive so far from any wire source that can give it (the rail wire can; a source without `logSoFar`
 * gives null, and the screen answers without Cathy's drive lines). For voice and assistant hookups.
 */
export function wireLogSoFar(source: unknown): EventLog | null {
  const f = (source as { logSoFar?: unknown } | null)?.logSoFar;
  return typeof f === 'function' ? ((f as () => EventLog | null).call(source) ?? null) : null;
}
