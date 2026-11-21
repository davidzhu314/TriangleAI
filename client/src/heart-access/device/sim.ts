/**
 * One run of a device through an apical port: device, port and contact world stepped together, with the per-run
 * records the brief asks for (contact events and peak force per tissue, peak port load). The same tick() serves a
 * person at the keys and the autonomy layer later.
 */
import type { M4 } from '../geometry';
import { portBase, portLoad, tiltPort, type ApicalPort, type PortCommand, type PortLoad } from './port';
import type { ContactQuery, DeviceCommand, DeviceModel, DeviceState, StepResult, Tissue } from './types';

export interface TissueRecord {
  /** Times contact with this tissue began (no contact the step before, contact now). */
  events: number;
  peakForceN: number;
}

export interface Tick extends StepResult {
  load: PortLoad;
  timeS: number;
}

export class AccessSim {
  q: DeviceState;
  port: ApicalPort;
  timeS = 0;
  peakPortLoadN = 0;
  readonly tissues = new Map<Tissue, TissueRecord>();
  private touching = new Set<Tissue>();
  last: Tick | null = null;

  constructor(
    readonly device: DeviceModel,
    port: ApicalPort,
    readonly contacts: ContactQuery | null,
    /** The heart's rigid motion at a time, or null while it is static. */
    readonly heartAt: ((t: number) => M4) | null = null,
  ) {
    this.q = device.initial();
    this.port = port;
  }

  tick(u: DeviceCommand, dt: number, portU: PortCommand | null = null): Tick {
    if (portU) this.port = tiltPort(this.port, portU, dt);
    this.timeS += dt;
    const heart = this.heartAt ? this.heartAt(this.timeS) : null;
    const r = this.device.step(this.q, u, this.contacts, dt, portBase(this.port, heart));
    this.q = r.q;
    const load = portLoad(this.port, r.contacts, heart);
    this.peakPortLoadN = Math.max(this.peakPortLoadN, load.totalN);
    const now = new Set<Tissue>();
    for (const c of r.contacts) {
      now.add(c.tissue);
      const rec = this.tissues.get(c.tissue) ?? { events: 0, peakForceN: 0 };
      rec.peakForceN = Math.max(rec.peakForceN, c.forceN);
      this.tissues.set(c.tissue, rec);
    }
    for (const t of now) if (!this.touching.has(t)) this.tissues.get(t)!.events++;
    this.touching = now;
    this.last = { ...r, load, timeS: this.timeS };
    return this.last;
  }
}

/** A command with every rate zero, for a device with n segments. */
export const idle = (segments: number): DeviceCommand => ({ insertRate: 0, rollRate: 0, segments: Array.from({ length: segments }, () => ({ curvatureRate: 0, planeRate: 0 })) });
