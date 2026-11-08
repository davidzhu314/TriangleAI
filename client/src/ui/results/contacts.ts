/**
 * Wall contact review on Results: every moment in the drive where the tip pressed on the vessel wall at or above the
 * force threshold, where it was, and one fixed teaching tip for it. Pure: no DOM, unit-tested.
 *
 * Sources, both from the drive's own EventLog:
 * - Physics (beta) drives record each wall contact as a review event (`log.review`, kind `wall_contact`: start, end,
 *   vessel, peak load, how long the trainee kept pushing). Those at or above the threshold count.
 * - Rail drives record a `force_spike` event when the contact force rises through the threshold; the samples give how
 *   long it stayed above and its peak.
 * The threshold is the one the drive recorded (`force_spike.thresholdN`), else the scoring constant passed in.
 *
 * Every number comes from the log. The forces are illustrative estimates, not measured forces, and nothing here
 * says anything about a patient: the tips are about technique.
 */
import type { EventLog, EventSample, LoadedCase, Vec3 } from '../../contracts';
import { fmt } from './model';

export type ContactTipKind = 'pushed-on' | 'off-route' | 'repeat' | 'ease-off';

export interface WallContact {
  /** 1-based, in time order: the number on the map and in the list. */
  n: number;
  /** Seconds. */
  t: number;
  toT: number;
  edge: string;
  /** Peak contact force (or load), newtons. */
  peakN: number;
  thresholdN: number;
  /** Seconds the trainee kept pushing into the wall (physics only); null when the log can't tell. */
  pushedS: number | null;
  /** Tip position at the peak, metres Y-up; null without samples. */
  at: Vec3 | null;
  /** True when the tip was in a vessel that isn't on the planned path. */
  offRoute: boolean;
  tip: ContactTipKind;
}

/** Below this, keeping on pushing after contact isn't called out. Seconds; a teaching choice, not a measurement. */
export const PUSHED_ON_S = 0.5;

function nearestSample(samples: readonly EventSample[], t: number): EventSample | null {
  let best: EventSample | null = null;
  for (const s of samples) if (!best || Math.abs(s.t - t) < Math.abs(best.t - t)) best = s;
  return best;
}

/** The threshold the drive recorded with its force spikes, else the scoring constant. */
export function contactThreshold(log: EventLog, fallbackThresholdN: number): number {
  const spike = log.events.find((e) => e.kind === 'force_spike');
  return spike && spike.kind === 'force_spike' ? spike.thresholdN : fallbackThresholdN;
}

/** Every wall contact at or above the threshold, in time order, each with its teaching tip. */
export function wallContacts(log: EventLog, fallbackThresholdN: number): WallContact[] {
  const thresholdN = contactThreshold(log, fallbackThresholdN);
  const onPlan = new Set(log.path);
  const raw: Omit<WallContact, 'n' | 'tip'>[] = [];

  const review = (log.review ?? []).filter((e) => e.kind === 'wall_contact');
  if (review.length) {
    for (const e of review) {
      if (e.kind !== 'wall_contact' || e.peakLoadN < thresholdN) continue;
      // The tip where the load peaked: the sample with the highest force inside the contact, else its start.
      const inside = log.samples.filter((s) => s.t >= e.t && s.t <= e.toT);
      const peak = inside.reduce<EventSample | null>((a, s) => (!a || s.forceN > a.forceN ? s : a), null) ?? nearestSample(log.samples, e.t);
      raw.push({ t: e.t, toT: e.toT, edge: e.edge, peakN: e.peakLoadN, thresholdN, pushedS: e.pushedS, at: peak ? peak.tip : null, offRoute: !onPlan.has(e.edge) });
    }
  } else {
    for (const e of log.events) {
      if (e.kind !== 'force_spike') continue;
      // From the spike until the force drops back under the threshold.
      const after = log.samples.filter((s) => s.t >= e.t);
      const end = after.find((s) => s.forceN < thresholdN);
      const inside = after.filter((s) => !end || s.t < end.t);
      const peak = inside.reduce<EventSample | null>((a, s) => (!a || s.forceN > a.forceN ? s : a), null);
      const at = peak ?? nearestSample(log.samples, e.t);
      const edge = at?.edge ?? log.path[0] ?? '';
      raw.push({ t: e.t, toT: end ? end.t : (inside.at(-1)?.t ?? e.t), edge, peakN: Math.max(e.forceN, peak?.forceN ?? 0), thresholdN, pushedS: null, at: at ? at.tip : null, offRoute: !onPlan.has(edge) });
    }
  }

  raw.sort((a, b) => a.t - b.t);
  const seen = new Map<string, number>();
  return raw.map((c, i) => {
    const before = seen.get(c.edge) ?? 0;
    seen.set(c.edge, before + 1);
    const tip: ContactTipKind = c.pushedS !== null && c.pushedS >= PUSHED_ON_S ? 'pushed-on' : c.offRoute ? 'off-route' : before > 0 ? 'repeat' : 'ease-off';
    return { ...c, n: i + 1, tip };
  });
}

/** The vessel's name for an edge, from the case. */
export function vesselOf(c: LoadedCase, edge: string): string {
  const e = c.edges.find((x) => x.id === edge);
  return c.vessels.find((v) => v.id === e?.vessel)?.name ?? 'vessel';
}

/** One contact's line: where, when, how hard. */
export function contactLine(c: LoadedCase, w: WallContact): string {
  const held = w.toT > w.t ? ` for ${fmt(w.toT - w.t, 1)} s` : '';
  return `${vesselOf(c, w.edge)}, at ${fmt(w.t, 1)} s${held}: peak ${fmt(w.peakN, 2)} N against the ${fmt(w.thresholdN, 2)} N threshold.`;
}

/** The teaching tip for one contact. Fixed wording; the numbers in it come from the contact. */
export function contactTip(c: LoadedCase, w: WallContact): string {
  switch (w.tip) {
    case 'pushed-on':
      return `You kept pushing for ${fmt(w.pushedS ?? 0, 1)} s while the tip pressed on the wall. When the force climbs, stop pushing first, then pull back a little.`;
    case 'off-route':
      return 'The tip had left the planned route here. Pull back to the branch point and rotate toward the planned branch before pushing again.';
    case 'repeat':
      return `Another contact in the ${vesselOf(c, w.edge)}. Slow down through it, and hold fluoro to see where the tip points before you push.`;
    case 'ease-off':
      return 'Ease off, pull back a few millimetres and rotate the tip toward the open vessel before pushing again.';
  }
}

/** The summary over all contacts, or the all-clear. */
export function contactSummary(c: LoadedCase, list: readonly WallContact[], thresholdN: number): string {
  if (list.length === 0) return `No wall contact reached the ${fmt(thresholdN, 2)} N threshold in this drive.`;
  const vessels = [...new Set(list.map((w) => vesselOf(c, w.edge)))];
  const where = vessels.length === 1 ? `the ${vessels[0]}` : `${vessels.slice(0, -1).join(', ')} and ${vessels.at(-1)}`;
  return `${list.length} wall ${list.length === 1 ? 'contact' : 'contacts'} reached the ${fmt(thresholdN, 2)} N threshold, in ${where}.`;
}

/** The one general line: what wall contact means in real procedures, and what these numbers are. */
export const CONTACT_CONTEXT =
  'In real procedures, forceful or repeated wall contact is what risks injuring the vessel wall. The forces here are illustrative estimates from a simplified model, not measurements.';
