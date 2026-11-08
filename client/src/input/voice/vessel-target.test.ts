import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CaseJson, CenterlinesJson } from '../../contracts';
import { buildTestLoadedCase } from '../../optimize/case-builder.testutil';
import { matchCommand } from './match';
import { resolveVesselTarget } from './vessel-target';

const CASES = join(import.meta.dirname, '../../../public/cases');
const load = (id: string) => {
  const read = <T,>(f: string): T => JSON.parse(readFileSync(join(CASES, id, f), 'utf8')) as T;
  return buildTestLoadedCase(read<CaseJson>('case.json'), read<CenterlinesJson>('centerlines.json'));
};
const say = (t: string) => matchCommand([{ transcript: t, confidence: 0.9 }]);

describe('"Hey Cathy, zoom into <artery>"', () => {
  it('parses the artery after the zoom phrase, with polite words and filler stripped', () => {
    for (const [t, target] of [
      ['Hey Cathy, zoom into the aortic arch', 'aortic arch'],
      ['hey kathy can you zoom into the aortic arch please', 'aortic arch'],
      ['Hey Cathy, zoom in on the left carotid', 'left carotid'],
      ['Hey Cathy, zoom in to the brachiocephalic', 'brachiocephalic'],
      ['Hey Cathy, focus on the right subclavian', 'right subclavian'],
      ['Cathy, could you center on the aorta', 'aorta'],
    ] as const) {
      const m = say(t);
      expect(m.action, t).toBe('zoom_to');
      expect(m.action === 'zoom_to' && m.target, t).toBe(target);
    }
  });

  it('plain "zoom in" / "zoom out" are unchanged, and "zoom into" with nothing after does nothing', () => {
    expect(say('Hey Cathy, zoom in').action).toBe('zoom_in');
    expect(say('Hey Cathy, zoom out').action).toBe('zoom_out');
    expect(say('Hey Cathy, zoom into').action).not.toBe('zoom_to');
  });

  it('resolves spoken names to the case vessels, the arch to the aorta at the arch branches, and keeps left and right apart', () => {
    const c = load('type-iii');
    const vesselOf = (id: string) => c.edges.find((e) => e.id === id)!.vessel;
    const t = (s: string) => resolveVesselTarget(s, c);
    expect(t('left carotid')!.edges.map(vesselOf)).toEqual(expect.arrayContaining(['lcca']));
    expect(new Set(t('left carotid')!.edges.map(vesselOf))).toEqual(new Set(['lcca']));
    expect(new Set(t('right carotid')!.edges.map(vesselOf))).toEqual(new Set(['rcca']));
    expect(new Set(t('innominate')!.edges.map(vesselOf))).toEqual(new Set(['bca']));
    expect(new Set(t('brachiocephalc trunk')!.edges.map(vesselOf))).toEqual(new Set(['bca'])); // a dictation slip
    const arch = t('aortic arch')!;
    expect(arch.label).toBe('Aortic arch');
    expect(new Set(arch.edges.map(vesselOf))).toEqual(new Set(['aorta']));
    expect(arch.edges.length).toBeLessThan(c.edges.filter((e) => e.vessel === 'aorta').length + 1);
    expect(t('the moon')).toBeNull();
  });

  it('works on the real CT case too', () => {
    const c = load('ts-s1404-cta');
    expect(resolveVesselTarget('aortic arch', c)!.edges.length).toBeGreaterThan(0);
    expect(resolveVesselTarget('left common carotid', c)!.label).toBe('Left common carotid');
  });
});

describe('zoom_to leaves non-artery zooms alone', () => {
  it('"zoom in on the tip" and "zoom in a bit" stay a plain zoom in', () => {
    for (const t of ['Hey Cathy, zoom in on the tip', 'Hey Cathy, zoom in on it', 'Hey Cathy, zoom in a little bit']) {
      expect(say(t).action, t).not.toBe('zoom_to');
    }
  });
});
