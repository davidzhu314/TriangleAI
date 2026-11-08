/**
 * ReplayWireSource: plays a recorded CathSim run as a reference (spec §5.1). Physical, not interactive:
 * push and rotate are ignored; fluoro and contrast puffs are recorded as given.
 *
 * It plays only real runs served by the physics process: `/recorded-runs.json` (contracts
 * RecordedRuns) and the replay file it names for this phantom × target × preset. A replay file is a
 * JSON array of physics `state` messages (contracts PhysicsStateMessage) at 30 Hz of simulation time.
 * D4 recorded nothing (DECISIONS.md), so today `start` rejects with PhysicsFailure('server_unavailable')
 * and select.ts does not offer replay. Nothing here makes up frames.
 */
import {
  EVENT_SAMPLE_HZ,
  isPhysicsStateMessage,
  type ControlInput,
  type EventLog,
  type PhysicsStateMessage,
  type RecordedRuns,
  type Unsubscribe,
  type WireFallback,
  type WireSource,
  type WireStartRequest,
  type WireState,
} from '../contracts';
import { PHYSICS_ORIGIN, PhysicsFailure, PhysicsLog } from './physics-source';

export interface ReplayWireOptions {
  /** Default PHYSICS_ORIGIN. */
  origin?: string;
  fetch?: typeof fetch;
  /** 'interval' (default) plays at 30 Hz; 'manual' waits for tick(). */
  clock?: 'interval' | 'manual';
}

export class ReplayWireSource implements WireSource {
  readonly mode = 'replay' as const;

  private readonly origin: string;
  private readonly fetchFn: typeof fetch;
  private readonly clock: 'interval' | 'manual';
  private stateListeners = new Set<(s: WireState) => void>();
  private fallbackListeners = new Set<(f: WireFallback) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private drive: PhysicsLog | null = null;
  private frames: PhysicsStateMessage[] = [];
  private next = 0;

  constructor(options: ReplayWireOptions = {}) {
    this.origin = options.origin ?? PHYSICS_ORIGIN;
    this.fetchFn = options.fetch ?? ((...a) => globalThis.fetch(...a));
    this.clock = options.clock ?? 'interval';
  }

  async start(request: WireStartRequest): Promise<void> {
    this.halt();
    const phantom = request.case.physics.phantom;
    if (!phantom) throw new PhysicsFailure('server_unavailable');
    const runs = await this.getJson<RecordedRuns>(new URL('/recorded-runs.json', this.origin).href);
    const ref = runs?.replays?.find((r) => r.phantom === phantom && r.target === request.targetId && r.presetId === request.presetId);
    if (!ref) throw new PhysicsFailure('server_unavailable');
    const frames = await this.getJson<unknown>(new URL(ref.file, `${this.origin}/`).href);
    if (!Array.isArray(frames) || frames.length === 0 || !frames.every(isPhysicsStateMessage)) {
      throw new PhysicsFailure('server_unavailable');
    }
    this.frames = frames;
    this.next = 0;
    this.drive = new PhysicsLog('replay', request);
    this.tick();
    if (this.clock === 'interval') this.timer = setInterval(() => this.tick(), 1000 / EVENT_SAMPLE_HZ);
  }

  /** Play the next recorded frame; holds the last one at the end. */
  tick(): void {
    if (!this.drive || this.next >= this.frames.length) return;
    const state = this.drive.frame(this.frames[this.next++]!);
    for (const l of this.stateListeners) l(state);
  }

  control(input: ControlInput): void {
    this.drive?.control(input);
  }

  async stop(): Promise<EventLog> {
    this.halt();
    if (!this.drive) throw new Error('ReplayWireSource.stop: not started');
    const out = structuredClone(this.drive.log);
    this.drive = null;
    return out;
  }

  onState(listener: (state: WireState) => void): Unsubscribe {
    this.stateListeners.add(listener);
    if (this.drive?.last) listener(this.drive.last);
    return () => this.stateListeners.delete(listener);
  }

  /** select.ts fires fallbacks; kept for the interface. */
  onFallback(listener: (fallback: WireFallback) => void): Unsubscribe {
    this.fallbackListeners.add(listener);
    return () => this.fallbackListeners.delete(listener);
  }

  private async getJson<T>(url: string): Promise<T | null> {
    let res: Response;
    try {
      res = await this.fetchFn(url);
    } catch {
      throw new PhysicsFailure('server_unavailable');
    }
    if (!res.ok) return null;
    try {
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }

  private halt(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}
