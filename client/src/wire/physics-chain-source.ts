/**
 * ChainWireSource: the chain simulation (physics-chain.ts) and its imaging (physics-chain-imaging.ts) as a
 * `WireSource` (contracts v3), writing an `EventLog` at 30 Hz of simulation time, the same way RailWireSource does.
 *
 * - In: `ControlInput` push and rotate move the selected `device`; `fluoro` is held imaging at `pulse`;
 *   `contrastPuff` injects; `storeRoadmap` stores a roadmap from a contrast frame. `setDevice`, `setPulse` and
 *   `storeRoadmap()` do the same for callers that keep them out of the control frame.
 * - Out: `WireState` with the v3 tip pose, both devices, contacts, the educational risk index and imaging. The log's
 *   samples carry the v3 fields, and `stop()` adds review events (wall contacts, imaging intervals, branch entries,
 *   roadmaps) in `EventLog.review`. `chain()` and `trace()` give the same data as module types.
 * - select.ts offers this source only behind its default-off `?wire=chain` dev switch, until a screen draws the
 *   imaging states.
 */
import { EVENT_SAMPLE_HZ, clampControl, createEventLog, type ControlInput, type EventLog, type ReviewEvent, type Unsubscribe, type Vec3, type WireFallback, type WireSource, type WireStartRequest, type WireState } from '../contracts';
import { CONTACT_MIN_N, createChainModel, devicePoints, initialChainState, stepChain, tipPose, type ChainModel, type ChainState, type ContactSample, type DeviceId, type TipPose } from './physics-chain';
import { heldIsStale, initialImaging, stepImaging, type DeviceSnapshot, type ImagingState, type PulseRate } from './physics-chain-imaging';

export const CHAIN_DT_S = 1 / EVENT_SAMPLE_HZ;

/** One step of the review trace: inputs, the true device, contact and imaging. */
export interface ChainTraceSample {
  t: number;
  device: DeviceId;
  push: number;
  rotate: number;
  tip: TipPose;
  inserted: Record<DeviceId, number>;
  edge: string;
  s: number;
  contacts: ContactSample[];
  riskIndex: number;
  fluoro: boolean;
  frame: boolean;
}

/** The tip moved from one vessel edge into another (a branch-entry attempt, on or off the plan). */
export interface BranchEntry {
  t: number;
  from: string;
  to: string;
  onPlan: boolean;
  /** Tip roll and hub roll at entry (stored twist = hub − tip), radians. */
  tipRoll: number;
  hubRoll: number;
}

export interface ChainView {
  tip: TipPose;
  points: Record<DeviceId, Vec3[]>;
  inserted: Record<DeviceId, number>;
  device: DeviceId;
  imaging: ImagingState;
  /** The held image no longer shows where the device is. */
  holdStale: boolean;
  riskIndex: number;
}

export interface ChainWireOptions {
  /** 'interval' (default) ticks at 30 Hz; 'manual' waits for tick(). */
  clock?: 'interval' | 'manual';
}

export class ChainWireSource implements WireSource {
  readonly mode = 'chain' as const;
  private readonly clock: 'interval' | 'manual';
  private timer: ReturnType<typeof setInterval> | null = null;
  private stateListeners = new Set<(s: WireState) => void>();
  private fallbackListeners = new Set<(f: WireFallback) => void>();
  private model: ChainModel | null = null;
  private state: ChainState | null = null;
  private imaging: ImagingState = initialImaging();
  private log: EventLog | null = null;
  private input: ControlInput = { push: 0, rotate: 0, fluoro: false, contrastPuff: false };
  private device: DeviceId = 'wire';
  private pulse: PulseRate = 'continuous';
  private puffPending = false;
  private roadmapPending = false;
  private risk = 0;
  private samples: ChainTraceSample[] = [];
  private entries: BranchEntry[] = [];
  private last: WireState | null = null;
  private lastContacts: ContactSample[] = [];
  private roadmapTimes: number[] = [];

  constructor(options: ChainWireOptions = {}) {
    this.clock = options.clock ?? 'interval';
  }

  async start(request: WireStartRequest): Promise<void> {
    this.halt();
    this.model = createChainModel(request.case, request.entryId, request.targetId, request.presetId, request.path);
    this.state = initialChainState(this.model);
    this.imaging = initialImaging();
    this.log = createEventLog({ mode: 'chain', caseId: request.case.id, entryId: request.entryId, targetId: request.targetId, presetId: request.presetId, path: request.path });
    this.input = { push: 0, rotate: 0, fluoro: false, contrastPuff: false };
    this.device = 'wire';
    this.puffPending = false;
    this.roadmapPending = false;
    this.risk = 0;
    this.samples = [];
    this.entries = [];
    this.lastContacts = [];
    this.roadmapTimes = [];
    this.emit(false);
    if (this.clock === 'interval') this.timer = setInterval(() => this.tick(), 1000 / EVENT_SAMPLE_HZ);
  }

  control(input: ControlInput): void {
    this.input = { push: clampControl(input.push), rotate: clampControl(input.rotate), fluoro: input.fluoro, contrastPuff: input.contrastPuff };
    if (input.contrastPuff) this.puffPending = true;
    if (input.device) this.device = input.device;
    if (input.pulse) this.pulse = input.pulse;
    if (input.storeRoadmap) this.roadmapPending = true;
  }

  /** Which device push and rotate move. */
  setDevice(device: DeviceId): void {
    this.device = device;
  }

  setPulse(pulse: PulseRate): void {
    this.pulse = pulse;
  }

  /** Store a roadmap from the newest contrast frame (refused, with a notice in `chain()`, without one). */
  storeRoadmap(): void {
    this.roadmapPending = true;
  }

  /** Advance one 1/30 s step of simulation time. */
  tick(): void {
    if (!this.model || !this.state || !this.log) return;
    const before = this.state;
    const res = stepChain(this.model, before, { push: this.input.push, rotate: this.input.rotate, device: this.device }, CHAIN_DT_S);
    this.state = res.state;
    this.risk = res.riskIndex;
    const roadmapsBefore = this.imaging.totals.roadmaps;
    const img = stepImaging(this.imaging, { fluoro: this.input.fluoro, pulse: this.pulse, inject: this.puffPending, storeRoadmap: this.roadmapPending }, this.snapshot(), this.state.t, CHAIN_DT_S);
    this.imaging = img.state;
    if (this.puffPending) this.log.events.push({ kind: 'contrast_puff', t: this.state.t });
    if (this.imaging.totals.roadmaps > roadmapsBefore) this.roadmapTimes.push(this.state.t);
    this.puffPending = false;
    this.roadmapPending = false;
    this.log.events.push(...res.events);
    const tip = tipPose(this.model, this.state);
    if (before.edge !== this.state.edge) this.entries.push({ t: this.state.t, from: before.edge, to: this.state.edge, onPlan: this.model.planStart.has(this.state.edge), tipRoll: tip.tipRoll, hubRoll: tip.hubRoll });
    this.samples.push({ t: this.state.t, device: this.device, push: this.input.push, rotate: this.input.rotate, tip, inserted: { ...this.state.inserted }, edge: this.state.edge, s: this.state.s, contacts: res.contacts, riskIndex: res.riskIndex, fluoro: this.input.fluoro, frame: img.frame !== null });
    this.lastContacts = res.contacts;
    this.emit(res.peakLoadN > 0 ? res.peakLoadN : 0);
  }

  /** What the screen needs beyond WireState: tip pose, both devices, imaging. */
  chain(): ChainView | null {
    if (!this.model || !this.state) return null;
    const snap = this.snapshot();
    return { tip: tipPose(this.model, this.state), points: snap.points, inserted: snap.inserted, device: this.device, imaging: this.imaging, holdStale: heldIsStale(this.imaging, snap), riskIndex: this.risk };
  }

  /** The review trace: every step, and every branch entry. */
  trace(): { samples: ChainTraceSample[]; entries: BranchEntry[]; imaging: ImagingState } {
    return { samples: this.samples, entries: this.entries, imaging: this.imaging };
  }

  /**
   * The drive so far, as a copy, the same as RailWireSource.logSoFar: what Cathy's mid-drive answers need ("how am I
   * doing", "best next artery", "am I on the right path"). Review events are added only by `stop()`. Null before start
   * and after stop.
   */
  logSoFar(): EventLog | null {
    return this.log ? structuredClone(this.log) : null;
  }

  async stop(): Promise<EventLog> {
    this.halt();
    if (!this.log) throw new Error('ChainWireSource.stop: not started');
    this.log.review = this.reviewEvents();
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

  /** The chain runs in the page and never falls back; kept for the interface. */
  onFallback(listener: (fallback: WireFallback) => void): Unsubscribe {
    this.fallbackListeners.add(listener);
    return () => this.fallbackListeners.delete(listener);
  }

  /** Review events from the trace: wall-contact episodes, imaging intervals, branch entries and stored roadmaps. */
  private reviewEvents(): ReviewEvent[] {
    const out: ReviewEvent[] = [];
    // A contact episode: consecutive steps with a node pressing on the same edge.
    const open = new Map<string, { t: number; toT: number; arcM: number; peakLoadN: number; pushedS: number }>();
    const close = (edge: string): void => {
      const e = open.get(edge)!;
      out.push({ kind: 'wall_contact', t: e.t, toT: e.toT, edge, arcM: e.arcM, peakLoadN: e.peakLoadN, pushedS: e.pushedS });
      open.delete(edge);
    };
    for (const s of this.samples) {
      const here = new Map<string, ContactSample>();
      for (const c of s.contacts) if (c.loadN >= CONTACT_MIN_N && (here.get(c.edge)?.loadN ?? 0) < c.loadN) here.set(c.edge, c);
      for (const edge of [...open.keys()]) if (!here.has(edge)) close(edge);
      for (const [edge, c] of here) {
        const e = open.get(edge) ?? { t: s.t, toT: s.t, arcM: c.arcM, peakLoadN: 0, pushedS: 0 };
        e.toT = s.t;
        if (c.loadN > e.peakLoadN) {
          e.peakLoadN = c.loadN;
          e.arcM = c.arcM;
        }
        if (s.push > 0) e.pushedS += CHAIN_DT_S;
        open.set(edge, e);
      }
    }
    for (const edge of [...open.keys()]) close(edge);
    for (const i of this.imaging.intervals) out.push({ kind: 'imaging_interval', t: i.from, toT: i.to, pulse: i.pulse, frames: i.frames });
    for (const b of this.entries) out.push({ kind: 'branch_entry', t: b.t, fromEdge: b.from, toEdge: b.to, onPlan: b.onPlan, tipRollRad: b.tipRoll, hubRollRad: b.hubRoll });
    for (const t of this.roadmapTimes) out.push({ kind: 'roadmap_stored', t });
    return out.sort((a, b) => a.t - b.t);
  }

  private snapshot(): DeviceSnapshot {
    const m = this.model!;
    const st = this.state!;
    return { points: devicePoints(m, st), tip: st.nodes.at(-1)!, inserted: { ...st.inserted } };
  }

  private halt(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private emit(forceN: number | false): void {
    const m = this.model!;
    const st = this.state!;
    const tip = tipPose(m, st);
    const snap = this.snapshot();
    const img = this.imaging;
    const ws: WireState = {
      mode: 'chain',
      t: st.t,
      wire: st.nodes.map((p) => [...p] as Vec3),
      tip: [...tip.position] as Vec3,
      s: st.s,
      edge: st.edge,
      rollRad: tip.tipRoll,
      contactForceN: forceN === false ? 0 : forceN,
      fluoro: this.input.fluoro,
      atTarget: st.atTarget,
      tipPose: { tangent: tip.tangent, curvature: tip.curvature, tipRollRad: tip.tipRoll, hubRollRad: tip.hubRoll, leading: tip.leading },
      devices: { wire: snap.points.wire, catheter: snap.points.catheter, insertedM: snap.inserted, active: this.device },
      contacts: this.lastContacts.map((c) => ({ node: c.node, edge: c.edge, loadN: c.loadN })),
      riskIndex: this.risk,
      imaging: {
        held: img.held,
        pulse: img.pulse,
        liveFrameT: img.live?.t ?? null,
        holdImageT: img.holdImage?.t ?? null,
        holdStale: heldIsStale(img, snap),
        roadmapT: img.roadmap?.t ?? null,
        totals: { ...img.totals },
      },
    };
    this.log!.samples.push({
      t: st.t,
      tip: [...ws.tip],
      s: st.s,
      edge: st.edge,
      forceN: ws.contactForceN,
      fluoro: ws.fluoro,
      device: this.device,
      push: this.input.push,
      rotate: this.input.rotate,
      tangent: [...tip.tangent],
      tipRollRad: tip.tipRoll,
      hubRollRad: tip.hubRoll,
      riskIndex: this.risk,
    });
    this.last = ws;
    for (const l of this.stateListeners) l(ws);
  }
}
