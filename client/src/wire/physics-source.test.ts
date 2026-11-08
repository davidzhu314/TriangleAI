/**
 * PhysicsWireSource and select.ts against a fake socket, plus the fallback with no physics process
 * running (a real WebSocket to a closed localhost port). The phantom is the real D3a package.
 */
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadCase } from '../case';
import {
  PHYSICS_WIRE_POINTS,
  WIRE_STALL_TIMEOUT_MS,
  type LoadedCase,
  type PhysicsStateMessage,
  type Vec3,
  type WireFallback,
  type WireStartRequest,
  type WireState,
} from '../contracts';
import { CLOSE_SERVER_UNAVAILABLE, PhysicsFailure, PhysicsWireSource } from './physics-source';
import { selectWireSource } from './select';

const CASE_DIR = join(import.meta.dirname, '../../../physics/cases/phantom3');
const BCA_PATH = ['e_aorta', 'e_arch', 'e_bca'];
let phantom: LoadedCase;

beforeAll(async () => {
  const f = (n: string) => new Uint8Array(readFileSync(join(CASE_DIR, n)));
  const r = await loadCase({ kind: 'files', origin: 'physics', files: { 'case.json': f('case.json'), 'centerlines.json': f('centerlines.json'), 'vessels.glb': f('vessels.glb') } });
  if (!r.ok) throw new Error('phantom3 did not load');
  phantom = r.case;
});

const request = (c: LoadedCase = phantom): WireStartRequest => ({ case: c, entryId: 'inlet', targetId: 'bca', presetId: 'standard_j', path: BCA_PATH });
const edge = (id: string) => phantom.edges.find((e) => e.id === id)!;

class FakeSocket {
  static last: FakeSocket;
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.last = this;
  }
  send(d: string) {
    this.sent.push(JSON.parse(d));
  }
  close() {
    this.closed = true;
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  state(t: number, tip: Vec3, force = 0, atTarget = false) {
    const m: PhysicsStateMessage = { type: 'state', t, wire: Array.from({ length: PHYSICS_WIRE_POINTS }, () => [...tip] as Vec3), tip, contact_force_n: force, at_target: atTarget };
    this.onmessage?.({ data: JSON.stringify(m) });
  }
}
const Fake = FakeSocket as unknown as new (url: string) => WebSocket;

afterEach(() => {
  vi.useRealTimers();
});

describe('PhysicsWireSource', () => {
  it('sends the §5.2 start, resolves on the first state and uses positions unchanged', async () => {
    const src = new PhysicsWireSource({ WebSocketImpl: Fake });
    const seen: WireState[] = [];
    src.onState((s) => seen.push(s));
    const started = src.start(request());
    const sock = FakeSocket.last;
    expect(sock.url).toBe('ws://127.0.0.1:8765/wire');
    sock.open();
    expect(sock.sent[0]).toEqual({ type: 'start', phantom: 'phantom3', target: 'bca', preset: 'standard_j' });
    const p = edge('e_aorta').points[10]!;
    sock.state(0, p, 0.2);
    await started;
    expect(seen).toHaveLength(1);
    expect(seen[0]!.mode).toBe('physics');
    expect(seen[0]!.tip).toEqual(p); // CathSim world = case Y-up frame: no conversion
    expect(seen[0]!.wire).toHaveLength(PHYSICS_WIRE_POINTS);
    expect(seen[0]!.edge).toBe('e_aorta');
    expect(seen[0]!.s).toBeGreaterThan(0.005);
    await src.stop();
  });

  it('sends clamped controls only when they change, and stop sends stop and closes', async () => {
    const src = new PhysicsWireSource({ WebSocketImpl: Fake });
    const started = src.start(request());
    const sock = FakeSocket.last;
    sock.open();
    sock.state(0, edge('e_aorta').points[0]!);
    await started;
    src.control({ push: 3, rotate: -0.5, fluoro: false, contrastPuff: false });
    src.control({ push: 1, rotate: -0.5, fluoro: true, contrastPuff: false });
    src.control({ push: 0, rotate: 0, fluoro: true, contrastPuff: true });
    expect(sock.sent.slice(1)).toEqual([
      { type: 'control', push: 1, rotate: -0.5 },
      { type: 'control', push: 0, rotate: 0 },
    ]);
    const log = await src.stop();
    expect(sock.sent.at(-1)).toEqual({ type: 'stop' });
    expect(sock.closed).toBe(true);
    expect(log.events.map((e) => e.kind)).toEqual(['contrast_puff']);
  });

  it('writes one EventLog sample per state in simulation time, with §5.6 events', async () => {
    const src = new PhysicsWireSource({ WebSocketImpl: Fake });
    const started = src.start(request());
    const sock = FakeSocket.last;
    sock.open();
    const aorta = edge('e_aorta').points;
    const lcca = edge('e_lcca').points;
    const bca = edge('e_bca').points;
    sock.state(0, aorta[0]!);
    await started;
    src.control({ push: 0, rotate: 0, fluoro: true, contrastPuff: false });
    sock.state(1 / 30, aorta[aorta.length - 1]!, 0.9); // force rises through the threshold
    sock.state(2 / 30, lcca[lcca.length - 1]!, 0.1); // deep in the left carotid: off the bca plan
    sock.state(3 / 30, aorta[0]!, 0.1); // pulled right back
    sock.state(4 / 30, bca[bca.length - 1]!, 0.1, true);
    const log = await src.stop();
    expect(log.mode).toBe('physics');
    expect(log.samples.map((s) => s.t)).toEqual([0, 1 / 30, 2 / 30, 3 / 30, 4 / 30]);
    expect(log.samples[1]!.fluoro).toBe(true);
    expect(log.samples[2]!.edge).toBe('e_lcca');
    expect(log.events.map((e) => e.kind)).toEqual(['force_spike', 'wrong_branch', 'back_out', 'target_reached']);
    expect(log.events[1]).toMatchObject({ edge: 'e_lcca' });
    expect(log.events[3]).toMatchObject({ target: 'bca', t: 4 / 30 });
  });

  it('rejects with server_unavailable when the server closes with 1013 (no CathSim)', async () => {
    const src = new PhysicsWireSource({ WebSocketImpl: Fake });
    const started = src.start(request());
    FakeSocket.last.open();
    FakeSocket.last.onclose?.({ code: CLOSE_SERVER_UNAVAILABLE });
    await expect(started).rejects.toEqual(new PhysicsFailure('server_unavailable'));
  });

  it('reports socket_stalled mid-drive after 2 s without a state', async () => {
    vi.useFakeTimers();
    const src = new PhysicsWireSource({ WebSocketImpl: Fake });
    const failures: [string, number][] = [];
    src.onFailure((r, t) => failures.push([r, t]));
    const started = src.start(request());
    FakeSocket.last.open();
    FakeSocket.last.state(1.5, edge('e_aorta').points[0]!);
    await started;
    vi.advanceTimersByTime(WIRE_STALL_TIMEOUT_MS - 300);
    expect(failures).toEqual([]);
    vi.advanceTimersByTime(600);
    expect(failures).toEqual([['socket_stalled', 1.5]]);
    expect(FakeSocket.last.closed).toBe(true);
  });
});

describe('selectWireSource', () => {
  it('gives rail for a case the physics process did not serve', async () => {
    const imported = { ...phantom, origin: 'imported' as const, physics: { available: false }, planningOnly: true };
    expect((await selectWireSource(imported)).mode).toBe('rail');
    expect((await selectWireSource(phantom, { WebSocketImpl: Fake })).mode).toBe('physics');
  });

  it('falls back to rail with socket_failed when no physics process is running', async () => {
    const port = await new Promise<number>((resolve) => {
      const s = createServer().listen(0, '127.0.0.1', () => {
        const p = (s.address() as { port: number }).port;
        s.close(() => resolve(p)); // free the port: nothing listens there now
      });
    });
    const src = await selectWireSource(phantom, { origin: `http://127.0.0.1:${port}` });
    const fallbacks: WireFallback[] = [];
    const states: WireState[] = [];
    src.onFallback((f) => fallbacks.push(f));
    src.onState((s) => states.push(s));
    await src.start(request());
    expect(src.mode).toBe('rail');
    expect(fallbacks).toEqual([{ from: 'physics', to: 'rail', reason: 'socket_failed', t: 0 }]);
    expect(states.at(-1)?.mode).toBe('rail');
    const log = await src.stop();
    expect(log.mode).toBe('rail');
  });

  it('switches to rail mid-drive when the socket stalls, and keeps listeners', async () => {
    vi.useFakeTimers();
    const src = await selectWireSource(phantom, { WebSocketImpl: Fake });
    const fallbacks: WireFallback[] = [];
    const modes: string[] = [];
    src.onFallback((f) => fallbacks.push(f));
    src.onState((s) => modes.push(s.mode));
    const started = src.start(request());
    FakeSocket.last.open();
    FakeSocket.last.state(0.4, edge('e_aorta').points[3]!);
    await started;
    vi.advanceTimersByTime(WIRE_STALL_TIMEOUT_MS + 300);
    await vi.waitFor(() => expect(fallbacks).toHaveLength(1));
    expect(fallbacks[0]).toEqual({ from: 'physics', to: 'rail', reason: 'socket_stalled', t: 0.4 });
    expect(src.mode).toBe('rail');
    expect(modes[0]).toBe('physics');
    expect(modes.at(-1)).toBe('rail');
    expect((await src.stop()).mode).toBe('rail');
  });
});
