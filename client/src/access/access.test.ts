import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CaseJson, CenterlinesJson, LoadedCase } from '../contracts';
import { buildTestLoadedCase } from '../optimize/case-builder.testutil';
import { accessReport, END_TRIM_MM, findAorticRoot, SHEATH_PRESETS } from '.';

const load = (id: string): LoadedCase => {
  const dir = `client/public/cases/${id}`;
  const c = JSON.parse(readFileSync(`${dir}/case.json`, 'utf8')) as CaseJson;
  const cl = JSON.parse(readFileSync(`${dir}/centerlines.json`, 'utf8')) as CenterlinesJson;
  return buildTestLoadedCase(c, cl);
};

const CASES = ['low-tort', 'type-i-plaque', 'type-ii', 'type-ii-tortuous', 'type-iii', 'bovine', 'ts-s1404-cta', 'ts-s1336-cta', 'ts-s0727-cta'];

const route = (id: string, required: number, name: string) => {
  const r = accessReport(load(id), required).routes.find((x) => x.name === name);
  if (!r) throw new Error(`no route ${name} in ${id}`);
  return r;
};

describe('access check', () => {
  it('finds the aortic root on every bundled aortic case, and none on the Y fixture', () => {
    for (const id of CASES) expect(findAorticRoot(load(id)), id).toMatch(/root/);
    expect(findAorticRoot(load('fixture-y'))).toBeNull();
    const none = accessReport(load('fixture-y'), 5.5);
    expect(none.routes).toEqual([]);
    expect(none.femoralVerdict).toBeNull();
  });

  it('lists both femoral sides, the subclavians and the carotids, femoral first', () => {
    const kinds = accessReport(load('ts-s1404-cta'), 5.5).routes.map((r) => `${r.kind}:${r.name}`);
    expect(kinds).toEqual([
      'transfemoral:Left femoral',
      'transfemoral:Right femoral',
      'subclavian:Left subclavian',
      'subclavian:Right subclavian',
      'transcarotid:Left common carotid',
      'transcarotid:Right common carotid',
    ]);
  });

  it('skips the cut ends of the scan when finding the narrowest point', () => {
    // s0727's right iliac reads 3.0 mm at the very edge of the scan: an end artifact, not anatomy.
    const r = route('ts-s0727-cta', 5.5, 'Right femoral');
    expect(r.samples[0]!.diameterMm).toBeLessThan(3.5);
    expect(r.narrowestMm).toBeGreaterThan(6);
    expect(r.narrowestAtMm).toBeGreaterThanOrEqual(END_TRIM_MM);
    expect(r.windowMm[0]).toBe(END_TRIM_MM);
  });

  it('turns the verdict with the sheath size', () => {
    const [f14, , f18] = SHEATH_PRESETS.map((p) => p.minVesselMm);
    expect(route('ts-s0727-cta', f14!, 'Right femoral').verdict).toBe('fits');
    const tooSmall = route('ts-s0727-cta', f18!, 'Right femoral');
    expect(tooSmall.verdict).toBe('too_small');
    expect(tooSmall.marginMm).toBeLessThan(0);
    expect(tooSmall.reasons[0]).toMatch(/short of 6\.5 mm/);
    // The other side still takes it, so the case's transfemoral verdict is the best side's.
    const report = accessReport(load('ts-s0727-cta'), f18!);
    expect(report.bestFemoral?.name).toBe('Left femoral');
    expect(report.femoralVerdict).toBe('fits');
  });

  it('flags a tight fit, heavy plaque and a severe bend as caution', () => {
    const plaque = route('type-i-plaque', 5.5, 'Left femoral');
    expect(plaque.verdict).toBe('caution');
    expect(plaque.zones).toEqual([{ kind: 'plaque', tier: 'heavy', vesselName: 'Left iliac to femoral' }]);
    expect(plaque.reasons.join(' ')).toMatch(/to spare/);
    expect(plaque.reasons.join(' ')).toMatch(/Heavy plaque/);
    const bend = route('type-iii', 5.5, 'Right femoral');
    expect(bend.verdict).toBe('caution');
    expect(bend.sharpestBendDeg).toBeGreaterThanOrEqual(90);
  });

  it('sends the tortuous case to another route', () => {
    const r = accessReport(load('type-ii-tortuous'), 5.5);
    expect(r.femoralVerdict).toBe('too_small');
    expect(r.routes.some((x) => x.kind !== 'transfemoral' && x.verdict === 'fits')).toBe(true);
  });

  it('keeps samples in travel order from the access site to the root', () => {
    const r = route('bovine', 5.5, 'Right femoral');
    for (let i = 1; i < r.samples.length; i++) expect(r.samples[i]!.sMm).toBeGreaterThan(r.samples[i - 1]!.sMm);
    expect(r.samples.at(-1)!.sMm).toBeCloseTo(r.lengthMm, 6);
  });
});
