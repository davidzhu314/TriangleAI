/**
 * PhysicsWireSource: the live CathSim wire over the spec §5.2 WebSocket (spec §5.1, §5.2, §5.6).
 *
 * The physics process (physics/server/, localhost only) sends `state` at about 30 Hz; `t` is
 * simulation time, so each state becomes one EventLog sample. Positions are CathSim world metres,
 * which is the loaded case's Y-up frame (D3a), and are used unchanged.
 *
 * It does not swap itself for rail. When the socket fails, closes, or stalls it reports a
 * `PhysicsFailure` (from `start`, or through `onFailure` mid-drive) and select.ts does the fallback.
 * Screens never import this file; they get sources from select.ts.
 */
import {
  PHYSICS_WS_PATH,
  WIRE_STALL_TIMEOUT_MS,
  clampControl,
  createEventLog,
  isPhysicsStateMessage,
  type ControlInput,
  type EventLog,
  type PhantomTargetId,
  type PhysicsClientMessage,
  type PhysicsStateMessage,
  type Unsubscribe,
  type WireFallback,
  type WireFallbackReason,
  type WireMode,
  type WireSource,
  type WireStartRequest,
  type WireState,
} from '../contracts';
import { PhysicsTrack } from './physics-track';

/** The physics process: one localhost port for HTTP case serving and the `/wire` socket. */
export const PHYSICS_ORIGIN = 'http://127.0.0.1:8765';
/** Phantom case list, the same shape as cases/index.json: `{ cases: [{ id, path }] }`. */
export const PHYSICS_CASES_URL = `${PHYSICS_ORIGIN}/cases/index.json`;
/**
 * Building a CathSim drive takes 0.8–3.5 s on the D1 laptop (metrics/david/d5/), longer than the 2 s
 * stall rule, so the first state gets this long. Once states flow, WIRE_STALL_TIMEOUT_MS applies.
 */
export const PHYSICS_START_TIMEOUT_MS = 10_000;
/** The server closes with 1013 ("try again later") when CathSim is not available. */
export const CLOSE_SERVER_UNAVAILABLE = 1013;

const TARGETS: readonly PhantomTargetId[] = ['bca', 'lcca'];

export class PhysicsFailure extends Error {
  constructor(readonly reason: WireFallbackReason) {
    super(`physics wire: ${reason}`);
    this.name = 'PhysicsFailure';
  }
}

type SocketCtor = new (url: string) => WebSocket;

export interface PhysicsWireOptions {
  /** Default PHYSICS_ORIGIN. */
  origin?: string;
  /** Default the global WebSocket (tests inject a fake). */
  WebSocketImpl?: SocketCtor;
  /** Default WIRE_STALL_TIMEOUT_MS. */
  stallMs?: number;
  /** Default PHYSICS_START_TIMEOUT_MS. */
  startTimeoutMs?: number;
}

/** Wire state and EventLog bookkeeping shared by the physics and replay sources. */
export class PhysicsLog {
  readonly log: EventLog;
  private readonly track: PhysicsTrack;
  fluoro = false;
  t = 0;
  last: WireState | null = null;

  constructor(
    readonly mode: Exclude<WireMode, 'rail'>,
    request: WireStartRequest,
  ) {
    this.track = new PhysicsTrack(request.case, request.path, request.targetId);
    this.log = createEventLog({
      mode,
      caseId: request.case.id,
      entryId: request.entryId,
      targetId: request.targetId,
      presetId: request.presetId,
      path: request.path,
    });
  }

  control(input: ControlInput): void {
    this.fluoro = input.fluoro;
    if (input.contrastPuff) this.log.events.push({ t: this.t, kind: 'contrast_puff' });
  }

  /** Record one frame and return the WireState to emit. */
  frame(m: PhysicsStateMessage): WireState {
    this.t = m.t;
    const { s, edge, events } = this.track.update(m.t, m.tip, m.contact_force_n, m.at_target);
    this.log.events.push(...events);
    this.log.samples.push({ t: m.t, tip: [...m.tip], s, edge, forceN: m.contact_force_n, fluoro: this.fluoro });
    this.last = {
      mode: this.mode,
      t: m.t,
      wire: m.wire.map((p) => [...p]),
      tip: [...m.tip],
      s,
      edge,
      contactForceN: m.contact_force_n,
      fluoro: this.fluoro,
      atTarget: m.at_target,
    };
    return this.last;
  }
}

export class PhysicsWireSource implements WireSource {
  readonly mode = 'physics' as const;

  private readonly url: string;
  private readonly Socket: SocketCtor;
  private readonly stallMs: number;
  private readonly startTimeoutMs: number;
  private stateListeners = new Set<(s: WireState) => void>();
  private fallbackListeners = new Set<(f: WireFallback) => void>();
  private failureListeners = new Set<(reason: WireFallbackReason, t: number) => void>();
  private ws: WebSocket | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private drive: PhysicsLog | null = null;
  private lastMessageAt = 0;
  private started = false;
  private ended = false;
  private sent = { push: NaN, rotate: NaN };

  constructor(options: PhysicsWireOptions = {}) {
    const origin = new URL(options.origin ?? PHYSICS_ORIGIN);
    origin.protocol = origin.protocol === 'https:' ? 'wss:' : 'ws:';
    origin.pathname = PHYSICS_WS_PATH;
    this.url = origin.href;
    this.Socket = options.WebSocketImpl ?? (globalThis.WebSocket as SocketCtor);
    this.stallMs = options.stallMs ?? WIRE_STALL_TIMEOUT_MS;
    this.startTimeoutMs = options.startTimeoutMs ?? PHYSICS_START_TIMEOUT_MS;
  }

  /** Resolves on the first state. Rejects with PhysicsFailure when the process cannot drive. */
  start(request: WireStartRequest): Promise<void> {
    const phantom = request.case.physics.phantom;
    const target = request.targetId as PhantomTargetId;
    if (!request.case.physics.available || !phantom || !TARGETS.includes(target)) {
      return Promise.reject(new PhysicsFailure('server_unavailable'));
    }
    this.drive = new PhysicsLog('physics', request);
    this.started = false;
    this.ended = false;
    this.sent = { push: NaN, rotate: NaN };

    return new Promise<void>((resolve, reject) => {
      const fail = (reason: WireFallbackReason) => {
        if (this.ended) return;
        this.ended = true;
        this.teardown();
        if (!this.started) reject(new PhysicsFailure(reason));
        else for (const l of this.failureListeners) l(reason, this.drive?.t ?? 0);
      };

      let ws: WebSocket;
      try {
        ws = new this.Socket(this.url);
      } catch {
        fail('socket_failed');
        return;
      }
      this.ws = ws;
      this.lastMessageAt = Date.now();
      this.watchdog = setInterval(() => {
        const limit = this.started ? this.stallMs : this.startTimeoutMs;
        if (Date.now() - this.lastMessageAt > limit) fail('socket_stalled');
      }, Math.min(250, this.stallMs / 4));

      ws.onopen = () => this.send({ type: 'start', phantom, target, preset: request.presetId });
      ws.onerror = () => fail('socket_failed');
      ws.onclose = (ev: CloseEvent) => fail(ev.code === CLOSE_SERVER_UNAVAILABLE ? 'server_unavailable' : 'socket_failed');
      ws.onmessage = (ev: MessageEvent) => {
        if (this.ended || !this.drive) return;
        let m: unknown;
        try {
          m = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (!isPhysicsStateMessage(m)) return;
        this.lastMessageAt = Date.now();
        const state = this.drive.frame(m);
        for (const l of this.stateListeners) l(state);
        if (!this.started) {
          this.started = true;
          resolve();
        }
      };
    });
  }

  control(input: ControlInput): void {
    if (!this.drive || this.ended) return;
    const push = clampControl(input.push);
    const rotate = clampControl(input.rotate);
    this.drive.control({ push, rotate, fluoro: input.fluoro, contrastPuff: input.contrastPuff });
    if (push !== this.sent.push || rotate !== this.sent.rotate) {
      if (this.send({ type: 'control', push, rotate })) this.sent = { push, rotate };
    }
  }

  async stop(): Promise<EventLog> {
    if (!this.drive) throw new Error('PhysicsWireSource.stop: not started');
    if (!this.ended) {
      this.ended = true;
      this.send({ type: 'stop' });
      this.teardown();
    }
    const out = structuredClone(this.drive.log);
    this.drive = null;
    return out;
  }

  onState(listener: (state: WireState) => void): Unsubscribe {
    this.stateListeners.add(listener);
    if (this.drive?.last) listener(this.drive.last);
    return () => this.stateListeners.delete(listener);
  }

  /** select.ts fires fallbacks, not this source; kept for the interface. */
  onFallback(listener: (fallback: WireFallback) => void): Unsubscribe {
    this.fallbackListeners.add(listener);
    return () => this.fallbackListeners.delete(listener);
  }

  /** The socket failed, closed or stalled after the drive started. `t` is the last simulation time. */
  onFailure(listener: (reason: WireFallbackReason, t: number) => void): Unsubscribe {
    this.failureListeners.add(listener);
    return () => this.failureListeners.delete(listener);
  }

  private send(m: PhysicsClientMessage): boolean {
    if (!this.ws || this.ws.readyState !== 1 /* OPEN */) return false;
    this.ws.send(JSON.stringify(m));
    return true;
  }

  private teardown(): void {
    if (this.watchdog !== null) clearInterval(this.watchdog);
    this.watchdog = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
      try {
        ws.close();
      } catch {
        // already closed
      }
    }
  }
}
