import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  BACK_OUT_THRESHOLD_M,
  CONTRACTS_VERSION,
  EVENT_LOG_SCHEMA,
  EVENT_SAMPLE_HZ,
  PHYSICS_WIRE_POINTS,
  WIRE_EVENT_KINDS,
  WIRE_STALL_TIMEOUT_MS,
  clampControl,
  createEventLog,
  isPhysicsStateMessage,
  type ControlInput,
  type EventLog,
  type PhysicsClientMessage,
  type WireEvent,
  type WireFallback,
  type WireSource,
  type WireState,
} from './index';

const stateFrame = (n = PHYSICS_WIRE_POINTS) => ({
  type: 'state',
  t: 12.48,
  wire: Array.from({ length: n }, (_, i) => [0, i * 0.001, 0]),
  tip: [0, 0.079, 0],
  contact_force_n: 0.42,
  at_target: false,
});

describe('contracts index', () => {
  it('keeps CONTRACTS_VERSION unset until D0b merges', () => {
    expect(CONTRACTS_VERSION).toBe('unset');
  });
});

describe('physics protocol (spec §5.2)', () => {
  it('accepts the spec state message', () => {
    expect(isPhysicsStateMessage(stateFrame())).toBe(true);
  });

  it('rejects malformed frames', () => {
    expect(isPhysicsStateMessage(null)).toBe(false);
    expect(isPhysicsStateMessage({ ...stateFrame(), type: 'control' })).toBe(false);
    expect(isPhysicsStateMessage({ ...stateFrame(), t: '12.48' })).toBe(false);
    expect(isPhysicsStateMessage({ ...stateFrame(), tip: [0, 1] })).toBe(false);
    expect(isPhysicsStateMessage({ ...stateFrame(), wire: [[0, 0, Number.NaN]] })).toBe(false);
    expect(isPhysicsStateMessage({ ...stateFrame(), at_target: 0 })).toBe(false);
  });

  it('types the three client messages exactly as the spec writes them', () => {
    const msgs: PhysicsClientMessage[] = [
      { type: 'start', phantom: 'phantom3', target: 'bca', preset: 'standard_j' },
      { type: 'control', push: 0.6, rotate: -0.2 },
      { type: 'stop' },
    ];
    expect(JSON.parse(JSON.stringify(msgs))).toEqual(msgs);
  });

  it('clamps controls to −1..1', () => {
    expect(clampControl(2)).toBe(1);
    expect(clampControl(-3)).toBe(-1);
    expect(clampControl(0.25)).toBe(0.25);
    expect(clampControl(Number.NaN)).toBe(0);
  });
});

describe('event log (spec §5.6)', () => {
  it('starts empty at 30 Hz with the schema id', () => {
    const path = ['e1', 'e2'];
    const log = createEventLog({ mode: 'rail', caseId: 'c', entryId: 'fem_r', targetId: 'rcca', presetId: 'standard_j', path });
    expect(log.schema).toBe(EVENT_LOG_SCHEMA);
    expect(log.sampleHz).toBe(EVENT_SAMPLE_HZ);
    expect(log.samples).toEqual([]);
    expect(log.events).toEqual([]);
    path.push('e3');
    expect(log.path).toEqual(['e1', 'e2']);
  });

  it('uses the spec thresholds and event kinds', () => {
    expect(EVENT_SAMPLE_HZ).toBe(30);
    expect(BACK_OUT_THRESHOLD_M).toBeCloseTo(0.02);
    expect([...WIRE_EVENT_KINDS].sort()).toEqual(
      ['back_out', 'contrast_puff', 'force_spike', 'prolapse', 'target_reached', 'wrong_branch'],
    );
    expectTypeOf<WireEvent['kind']>().toEqualTypeOf<(typeof WIRE_EVENT_KINDS)[number]>();
  });
});

describe('wire source (spec §5.1–5.3)', () => {
  it('falls back after a 2 s stall', () => {
    expect(WIRE_STALL_TIMEOUT_MS).toBe(2000);
  });

  it('can be implemented and writes an event log in simulation time', async () => {
    // A throwaway source that proves the interface is implementable; not a mock for the app.
    class StubSource implements WireSource {
      readonly mode = 'rail' as const;
      private log: EventLog | null = null;
      private t = 0;
      private listeners: Array<(s: WireState) => void> = [];
      async start(r: Parameters<WireSource['start']>[0]) {
        this.log = createEventLog({ mode: this.mode, caseId: 'stub', entryId: r.entryId, targetId: r.targetId, presetId: r.presetId, path: r.path });
      }
      control(input: ControlInput) {
        this.t += 1 / EVENT_SAMPLE_HZ;
        const edge = this.log?.path[0] ?? '';
        const state: WireState = { mode: this.mode, t: this.t, wire: [[0, 0, 0]], tip: [0, 0, 0], s: 0, edge, contactForceN: 0, fluoro: input.fluoro, atTarget: false };
        this.log?.samples.push({ t: state.t, tip: state.tip, s: state.s, edge, forceN: 0, fluoro: input.fluoro });
        if (input.contrastPuff) this.log?.events.push({ kind: 'contrast_puff', t: this.t });
        this.listeners.forEach((l) => l(state));
      }
      async stop() {
        if (!this.log) throw new Error('not started');
        return this.log;
      }
      onState(l: (s: WireState) => void) {
        this.listeners.push(l);
        return () => {
          this.listeners = this.listeners.filter((x) => x !== l);
        };
      }
      onFallback(_l: (f: WireFallback) => void) {
        return () => {};
      }
    }

    const src: WireSource = new StubSource();
    const seen: number[] = [];
    src.onState((s) => seen.push(s.t));
    await src.start({ case: {}, entryId: 'fem_r', targetId: 'rcca', presetId: 'standard_j', path: ['e1'] });
    src.control({ push: 1, rotate: 0, fluoro: true });
    src.control({ push: 1, rotate: 0, fluoro: false, contrastPuff: true });
    const log = await src.stop();
    expect(seen).toHaveLength(2);
    expect(log.samples.map((s) => s.fluoro)).toEqual([true, false]);
    expect(log.events).toEqual([{ kind: 'contrast_puff', t: 2 / EVENT_SAMPLE_HZ }]);
  });
});
