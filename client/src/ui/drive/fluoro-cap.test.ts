import { describe, expect, it } from 'vitest';
import { createEventLog, type EventLog, type EventSample } from '../../contracts';
import { sampleTotals } from '../../score/drive';
import { capFluoroAtTarget, targetReachedAt } from './fluoro-cap';

const sample = (t: number, fluoro: boolean): EventSample => ({ t, tip: [0, 0, 0], s: t, edge: 'e', forceN: 0, fluoro });

function log(samples: EventSample[], reachedAt: number | null): EventLog {
  const l = createEventLog({ mode: 'rail', caseId: 'c', entryId: 'a', targetId: 'b', presetId: 'soft_angled', path: ['e'] });
  l.samples = samples;
  if (reachedAt !== null) l.events = [{ kind: 'contrast_puff', t: 0 }, { kind: 'target_reached', t: reachedAt, target: 'b' }];
  return l;
}

describe('fluoro cap at target_reached', () => {
  const held = [0, 1, 2, 3, 4, 5].map((i) => sample(i / 30, true));

  it('turns fluoro off on samples after the first target_reached, and keeps the sample at the reach', () => {
    const capped = capFluoroAtTarget(log(held, 2 / 30));
    expect(capped.samples.map((s) => s.fluoro)).toEqual([true, true, true, false, false, false]);
    expect(sampleTotals(capped).fluoroS).toBeCloseTo(3 / 30, 12);
  });

  it('changes nothing else, and leaves the original log alone', () => {
    const original = log(held, 2 / 30);
    const capped = capFluoroAtTarget(original);
    expect(original.samples.every((s) => s.fluoro)).toBe(true);
    expect(capped.events).toBe(original.events);
    expect(capped.samples.map(({ fluoro: _, ...rest }) => rest)).toEqual(original.samples.map(({ fluoro: _, ...rest }) => rest));
  });

  it('returns the same log when the target was never reached or no fluoro follows it', () => {
    const never = log(held, null);
    expect(targetReachedAt(never)).toBeNull();
    expect(capFluoroAtTarget(never)).toBe(never);
    const released = log([sample(0, true), sample(1 / 30, true), sample(2 / 30, false)], 1 / 30);
    expect(capFluoroAtTarget(released)).toBe(released);
  });
});
