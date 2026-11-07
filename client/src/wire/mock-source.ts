/**
 * V1 MOCK wire source: the tip walks the planned path. Aroovee builds the Drive screen on it until
 * RailWireSource lands (V4). Screens still get sources only through select.ts, and only a
 * VITE_ENGINE=mock build may import this file (build guard: optimize/mock-guard.test.ts).
 *
 * - Tip speed = push × `speedMps`. Push is clamped to −1..1, so a half push walks at half speed
 *   and a negative push pulls back. With `autoWalk`, push is taken as 1.
 * - Rotate turns the roll angle at `rollRadPerS`.
 * - Fluoro and contrast puffs are recorded as given.
 * - Contact force is always 0, because the mock models none (no force proxy, no force_spike).
 * - It never takes a wrong branch or prolapses. It records `target_reached`, and records
 *   `back_out` once per retreat: when s falls more than 20 mm below the peak since the tip last
 *   moved forward. `toS` is s at the moment it crosses the threshold.
 * - Time is simulation time: every tick adds exactly 1/30 s, so the same inputs give the same
 *   EventLog. With `clock: 'manual'`, call `tick()` yourself (tests); otherwise a 30 Hz interval
 *   drives it.
 * - It reports mode 'rail', because WireMode has no mock value.
 */

import {
  BACK_OUT_THRESHOLD_M,
  EVENT_SAMPLE_HZ,
  clampControl,
  createEventLog,
  type ControlInput,
  type EventLog,
  type LoadedCase,
  type Unsubscribe,
  type Vec3,
  type WireFallback,
  type WireSource,
  type WireStartRequest,
  type WireState,
} from '../contracts';
import { cumulativeArclength, joinRoute, pointAt, subPolyline, type Point3 } from '../optimize/measures';

export interface MockWireOptions {
  /** Tip speed along the path at full push, m/s. Default 0.02. */
  speedMps?: number;
  /** Roll rate at full rotate, rad/s. Default π. */
  rollRadPerS?: number;
  /** Walk forward without any push. Default false. */
  autoWalk?: boolean;
  /** 'interval' (default) ticks at 30 Hz; 'manual' waits for tick(). */
  clock?: 'interval' | 'manual';
}

interface PathGeometry {
  points: Point3[];
  cs: Float64Array;
  lengthM: number;
  /** Arc length where each path edge ends. */
  edgeEnds: number[];
}

const DT = 1 / EVENT_SAMPLE_HZ;

export class MockWireSource implements WireSource {
  readonly mode = 'rail' as const;

  private readonly speed: number;
  private readonly rollRate: number;
  private readonly autoWalk: boolean;
  private readonly clock: 'interval' | 'manual';

  private stateListeners = new Set<(s: WireState) => void>();
  private fallbackListeners = new Set<(f: WireFallback) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;

  private req: WireStartRequest | null = null;
  private geom: PathGeometry | null = null;
  private log: EventLog | null = null;
  private input: ControlInput = { push: 0, rotate: 0, fluoro: false, contrastPuff: false };
  private puffPending = false;
  private t = 0;
  private s = 0;
  private peakS = 0;
  private retreating = false;
  private backOutFired = false;
  private roll = 0;
  private reached = false;
  private last: WireState | null = null;

  constructor(options: MockWireOptions = {}) {
    this.speed = options.speedMps ?? 0.02;
    this.rollRate = options.rollRadPerS ?? Math.PI;
    this.autoWalk = options.autoWalk ?? false;
    this.clock = options.clock ?? 'interval';
  }

  async start(request: WireStartRequest): Promise<void> {
    this.halt();
    this.req = request;
    this.geom = buildPath(request.case, request.entryId, request.path);
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
    this.t = 0;
    this.s = 0;
    this.peakS = 0;
    this.retreating = false;
    this.backOutFired = false;
    this.roll = 0;
    this.reached = false;
    this.record();
    if (this.clock === 'interval') this.timer = setInterval(() => this.tick(), 1000 / EVENT_SAMPLE_HZ);
  }

  control(input: ControlInput): void {
    this.input = {
      push: clampControl(input.push),
      rotate: clampControl(input.rotate),
      fluoro: input.fluoro,
      contrastPuff: input.contrastPuff,
    };
    if (input.contrastPuff) this.puffPending = true;
  }

  /** Advance one 1/30 s step of simulation time. */
  tick(): void {
    const g = this.geom;
    const log = this.log;
    if (!g || !log) return;
    this.t += DT;

    if (this.puffPending) {
      log.events.push({ t: this.t, kind: 'contrast_puff' });
      this.puffPending = false;
    }
    this.roll += this.input.rotate * this.rollRate * DT;

    const push = this.reached ? 0 : this.autoWalk ? 1 : this.input.push;
    const prevS = this.s;
    this.s = Math.min(Math.max(this.s + push * this.speed * DT, 0), g.lengthM);
    if (this.s > prevS) {
      // moving forward again starts a new retreat episode
      if (this.retreating) {
        this.retreating = false;
        this.backOutFired = false;
        this.peakS = prevS;
      }
      this.peakS = Math.max(this.peakS, this.s);
    } else if (this.s < prevS) {
      this.retreating = true;
    }
    if (!this.backOutFired && this.peakS - this.s > BACK_OUT_THRESHOLD_M) {
      log.events.push({ t: this.t, kind: 'back_out', fromS: this.peakS, toS: this.s });
      this.backOutFired = true;
    }
    if (!this.reached && this.s >= g.lengthM - 1e-12) {
      this.reached = true;
      log.events.push({ t: this.t, kind: 'target_reached', target: this.req!.targetId });
    }
    this.record();
  }

  async stop(): Promise<EventLog> {
    this.halt();
    if (!this.log) throw new Error('[THREADSIM_MOCK_WIRE] MockWireSource.stop: not started');
    const out = structuredClone(this.log);
    this.log = null;
    this.geom = null;
    this.req = null;
    return out;
  }

  onState(listener: (state: WireState) => void): Unsubscribe {
    this.stateListeners.add(listener);
    if (this.last) listener(this.last);
    return () => this.stateListeners.delete(listener);
  }

  /** Rail sources never fall back; kept for the interface. */
  onFallback(listener: (fallback: WireFallback) => void): Unsubscribe {
    this.fallbackListeners.add(listener);
    return () => this.fallbackListeners.delete(listener);
  }

  private halt(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private record(): void {
    const g = this.geom!;
    const tip = toVec3(pointAt(g.points, this.s, g.cs));
    const edge = this.req!.path[edgeIndexAt(g.edgeEnds, this.s)]!;
    const state: WireState = {
      mode: 'rail',
      t: this.t,
      wire: subPolyline(g.points, 0, this.s).map(toVec3),
      tip,
      s: this.s,
      edge,
      rollRad: this.roll,
      contactForceN: 0,
      fluoro: this.input.fluoro,
      atTarget: this.reached,
    };
    this.log!.samples.push({ t: this.t, tip: [...tip], s: this.s, edge, forceN: 0, fluoro: this.input.fluoro });
    this.last = state;
    for (const l of this.stateListeners) l(state);
  }
}

const toVec3 = (p: Point3): Vec3 => [p[0], p[1], p[2]];

function edgeIndexAt(edgeEnds: number[], s: number): number {
  for (let i = 0; i < edgeEnds.length; i++) if (s <= edgeEnds[i]!) return i;
  return edgeEnds.length - 1;
}

/** Orient the path's edges from the entry node and join them into one polyline (metres). */
function buildPath(c: LoadedCase, entryId: string, path: string[]): PathGeometry {
  const entry = c.entries.find((e) => e.id === entryId);
  if (!entry) throw new Error(`[THREADSIM_MOCK_WIRE] MockWireSource: unknown entry ${entryId}`);
  if (path.length === 0) throw new Error('[THREADSIM_MOCK_WIRE] MockWireSource: empty path');
  const byId = new Map(c.edges.map((e) => [e.id, e]));
  let at = entry.node;
  const polys: Point3[][] = [];
  const reversed: boolean[] = [];
  for (const id of path) {
    const e = byId.get(id);
    if (!e) throw new Error(`[THREADSIM_MOCK_WIRE] MockWireSource: unknown edge ${id}`);
    if (e.from === at) {
      reversed.push(false);
      at = e.to;
    } else if (e.to === at) {
      reversed.push(true);
      at = e.from;
    } else {
      throw new Error(`[THREADSIM_MOCK_WIRE] MockWireSource: edge ${id} does not continue from node ${at}`);
    }
    polys.push(e.points);
  }
  const { points, junctionS } = joinRoute(polys, reversed);
  const cs = cumulativeArclength(points);
  const lengthM = cs[cs.length - 1]!;
  return { points, cs, lengthM, edgeEnds: [...junctionS, lengthM] };
}
