/**
 * The app's only wire factory (spec §5.1, §5.7). Screens call `selectWireSource(case)` and never
 * construct a concrete source.
 *
 * - A phantom served by the physics process (`origin: 'physics'`, `physics.available`) drives on
 *   live CathSim physics. If the socket fails, closes with "server_unavailable", or stalls for
 *   WIRE_STALL_TIMEOUT_MS (2 s), the drive switches to rail and `onFallback` fires once with the reason.
 *   Rail restarts the drive from the entry; the log `stop()` returns is rail's.
 * - Every other case drives on rail, which never fires `onFallback`.
 * - Replay is not offered: there are no recorded runs (D4, DECISIONS.md).
 * - The V1 mock wire is not reachable from here, even under VITE_ENGINE=mock (rail exists).
 * - Dev switch, off by default: `?wire=chain` in the page URL drives every case on the browser chain simulation
 *   (physics-chain-source.ts), loaded only then, for trying it before a screen draws its imaging states.
 */
import type {
  ControlInput,
  EventLog,
  LoadedCase,
  Unsubscribe,
  WireFallback,
  WireFallbackReason,
  WireMode,
  WireSource,
  WireStartRequest,
  WireState,
} from '../contracts';
import { PhysicsFailure, PhysicsWireSource, type PhysicsWireOptions } from './physics-source';
import { RailWireSource } from './rail-source';

export interface SelectWireOptions extends PhysicsWireOptions {
  /** The fallback source. Default `new RailWireSource()`. */
  rail?: () => WireSource;
}

export async function selectWireSource(c: LoadedCase, options: SelectWireOptions = {}): Promise<WireSource> {
  const rail = options.rail ?? (() => new RailWireSource());
  if (chainRequested()) {
    const { ChainWireSource } = await import('./physics-chain-source');
    return new ChainWireSource();
  }
  if (c.origin === 'physics' && c.physics.available && c.physics.phantom) {
    return new FallbackWireSource(new PhysicsWireSource(options), rail);
  }
  return rail();
}

/** The `?wire=chain` dev switch. */
function chainRequested(): boolean {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).get('wire') === 'chain';
  } catch {
    return false;
  }
}

/** Physics first; rail after a failure. Listeners stay subscribed across the switch. */
class FallbackWireSource implements WireSource {
  private current: WireSource;
  private request: WireStartRequest | null = null;
  private detach: Unsubscribe = () => {};
  private stateListeners = new Set<(s: WireState) => void>();
  private fallbackListeners = new Set<(f: WireFallback) => void>();
  private switching: Promise<void> | null = null;

  constructor(
    private readonly physics: PhysicsWireSource,
    private readonly makeRail: () => WireSource,
  ) {
    this.current = physics;
    this.follow(physics);
    physics.onFailure((reason, t) => void this.toRail(reason, t));
  }

  get mode(): WireMode {
    return this.current.mode;
  }

  async start(request: WireStartRequest): Promise<void> {
    this.request = request;
    if (this.current !== this.physics) return this.current.start(request);
    try {
      await this.physics.start(request);
    } catch (e) {
      if (!(e instanceof PhysicsFailure)) throw e;
      await this.toRail(e.reason, 0);
    }
  }

  control(input: ControlInput): void {
    this.current.control(input);
  }

  async stop(): Promise<EventLog> {
    if (this.switching) await this.switching;
    return this.current.stop();
  }

  onState(listener: (state: WireState) => void): Unsubscribe {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onFallback(listener: (fallback: WireFallback) => void): Unsubscribe {
    this.fallbackListeners.add(listener);
    return () => this.fallbackListeners.delete(listener);
  }

  private follow(source: WireSource): void {
    this.detach();
    this.detach = source.onState((s) => {
      for (const l of this.stateListeners) l(s);
    });
  }

  private toRail(reason: WireFallbackReason, t: number): Promise<void> {
    if (this.current !== this.physics || !this.request) return this.switching ?? Promise.resolve();
    const rail = this.makeRail();
    this.current = rail;
    this.follow(rail);
    const request = this.request;
    this.switching = rail.start(request).then(() => {
      const f: WireFallback = { from: 'physics', to: 'rail', reason, t };
      for (const l of this.fallbackListeners) l(f);
    });
    return this.switching;
  }
}
