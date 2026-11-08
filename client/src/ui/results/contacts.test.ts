import { describe, expect, it } from 'vitest';
import { createEventLog, type EventLog, type EventSample } from '../../contracts';
import { loadFixtureY } from '../../optimize/fixture-y.testutil';
import { CONTACT_CONTEXT, contactLine, contactSummary, contactTip, PUSHED_ON_S, vesselOf, wallContacts } from './contacts';

const c = loadFixtureY();
const log = (over: Partial<EventLog> = {}): EventLog => ({
  ...createEventLog({ mode: 'rail', caseId: 'fixture-y', entryId: 'fem_r', targetId: 'left_branch', presetId: 'soft_angled', path: ['e_aorta', 'e_left'] }),
  ...over,
});
const sample = (t: number, forceN: number, edge = 'e_aorta', x = t): EventSample => ({ t, tip: [x / 100, 0, 0], s: t / 100, edge, forceN, fluoro: false });

describe('wall contacts from a rail drive (force spikes and samples)', () => {
  const samples = [sample(0, 0), sample(1, 0.2), sample(2, 1.4), sample(2.5, 1.8), sample(3, 0.3), sample(4, 1.2, 'e_right'), sample(4.5, 0.1, 'e_right')];
  const events: EventLog['events'] = [
    { kind: 'force_spike', t: 2, forceN: 1.4, thresholdN: 1 },
    { kind: 'force_spike', t: 4, forceN: 1.2, thresholdN: 1 },
  ];
  const list = wallContacts(log({ samples, events }), 99);

  it('one contact per spike, timed until the force drops back under the threshold, with its peak and place', () => {
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ n: 1, t: 2, toT: 3, edge: 'e_aorta', peakN: 1.8, thresholdN: 1, pushedS: null, offRoute: false });
    expect(list[0]!.at).toEqual([0.025, 0, 0]); // the sample at the peak
    expect(list[1]).toMatchObject({ n: 2, t: 4, toT: 4.5, edge: 'e_right', offRoute: true, tip: 'off-route' });
  });

  it('uses the threshold the drive recorded, not the fallback', () => {
    expect(list.every((w) => w.thresholdN === 1)).toBe(true);
  });

  it('a first contact on the route gets the ease-off tip; a second in the same vessel gets the repeat tip', () => {
    const two = wallContacts(log({ samples: [...samples.slice(0, 5), sample(3.5, 1.3), sample(3.8, 0.1)], events: [events[0]!, { kind: 'force_spike', t: 3.5, forceN: 1.3, thresholdN: 1 }] }), 99);
    expect(two.map((w) => w.tip)).toEqual(['ease-off', 'repeat']);
  });

  it('no spikes: no contacts, and the summary says so with the threshold', () => {
    const none = wallContacts(log({ samples }), 1);
    expect(none).toEqual([]);
    expect(contactSummary(c, none, 1)).toBe('No wall contact reached the 1.00 N threshold in this drive.');
  });
});

describe('wall contacts from a physics drive (review events)', () => {
  const samples = [sample(0, 0), sample(1, 0.5), sample(1.2, 2.2), sample(1.6, 0.4), sample(5, 0.9)];
  const review: NonNullable<EventLog['review']> = [
    { kind: 'wall_contact', t: 1, toT: 1.6, edge: 'e_aorta', arcM: 0.04, peakLoadN: 2.2, pushedS: PUSHED_ON_S + 0.4 },
    { kind: 'wall_contact', t: 4.8, toT: 5.2, edge: 'e_aorta', arcM: 0.09, peakLoadN: 0.9, pushedS: 0.1 }, // under the threshold
  ];
  const list = wallContacts(log({ mode: 'physics', samples, review, events: [{ kind: 'force_spike', t: 1.1, forceN: 2.2, thresholdN: 1.5 }] }), 99);

  it('keeps the contacts at or above the threshold, with how long the trainee kept pushing', () => {
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ n: 1, t: 1, toT: 1.6, peakN: 2.2, thresholdN: 1.5, pushedS: PUSHED_ON_S + 0.4, tip: 'pushed-on' });
    expect(list[0]!.at).toEqual([0.012, 0, 0]);
  });

  it('says it in words, with numbers from the contact, and the tip names the push time', () => {
    const w = list[0]!;
    expect(contactLine(c, w)).toBe(`${vesselOf(c, 'e_aorta')}, at 1.0 s for 0.6 s: peak 2.20 N against the 1.50 N threshold.`);
    expect(contactTip(c, w)).toMatch(/^You kept pushing for 0\.9 s while the tip pressed on the wall\./);
    expect(contactSummary(c, list, 1.5)).toBe(`1 wall contact reached the 1.50 N threshold, in the ${vesselOf(c, 'e_aorta')}.`);
  });
});

describe('the wording stays about technique, never about a patient', () => {
  it('makes no clinical or patient claim', () => {
    const all = [CONTACT_CONTEXT, ...(['pushed-on', 'off-route', 'repeat', 'ease-off'] as const).map((tip) => contactTip(c, { n: 1, t: 0, toT: 0, edge: 'e_aorta', peakN: 1, thresholdN: 1, pushedS: 1, at: null, offRoute: false, tip }))].join(' ');
    expect(all).not.toMatch(/inflam|patient|harm|injur(ed|y) the patient|caused|damage to the patient/i);
    expect(CONTACT_CONTEXT).toMatch(/illustrative/);
  });
});
