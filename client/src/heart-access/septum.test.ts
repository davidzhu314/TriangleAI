/**
 * The parametric PFO septum on the primary patient: placed between the atria, built to its parameters, and the
 * atrial-septal-aneurysm flag on the brief's 10 mm line.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import { dist, dot, sub } from './geometry';
import { centroid } from './heart';
import { buildScene, type AccessScene } from './scene';
import { ASA_EXCURSION_MM, DEFAULT_PFO, pfoSeptum, type PfoSeptum } from './septum';

const ROOT = join(import.meta.dirname, '../../..');
const CASE = 'ts-s1404-cta';
let scene: AccessScene;
let sep: PfoSeptum;
const ivc = () => scene.ct.context.find((m) => m.name === 'inferior_vena_cava')!.pts;

beforeAll(async () => {
  const dir = join(ROOT, 'client/public/cases', CASE);
  scene = await buildScene({
    caseId: CASE,
    heartGlb: new Uint8Array(readFileSync(join(ROOT, 'client/public/hearts/kcl-average/heart.glb'))),
    contextGlb: new Uint8Array(readFileSync(join(dir, 'context.glb'))),
    centerlines: JSON.parse(readFileSync(join(dir, 'centerlines.json'), 'utf8')),
    chestGlb: new Uint8Array(readFileSync(join(dir, 'chest.glb'))),
    fit: JSON.parse(readFileSync(join(dir, 'heart-fit.json'), 'utf8')),
  });
  sep = pfoSeptum(scene.heart.get('ra')!, scene.heart.get('la')!, ivc());
}, 60_000);

describe(`PFO septum on ${CASE}`, () => {
  test('the septal plane lies between the atria, its normal pointing from the right atrium into the left', () => {
    const ra = centroid(scene.heart.get('ra')!.pts);
    const la = centroid(scene.heart.get('la')!.pts);
    expect(dot(sub(la, sep.plane.centre), sep.plane.normal)).toBeGreaterThan(0);
    expect(dot(sub(ra, sep.plane.centre), sep.plane.normal)).toBeLessThan(0);
    // The patch it was fitted to is flat enough to call a plane.
    const off = sep.patch.map((p) => Math.abs(dot(sub(p, sep.plane.centre), sep.plane.normal))).sort((a, b) => a - b);
    expect(off[Math.floor(off.length / 2)]!).toBeLessThan(6);
  });

  test('the fossa sits on the septum, toward the inferior vena cava, which opens below it', () => {
    expect(Math.abs(dot(sub(sep.fossa.centre, sep.plane.centre), sep.plane.normal))).toBeLessThan(1e-6);
    expect(dist(sep.fossa.centre, sep.ivcOpening)).toBeLessThan(dist(sep.plane.centre, sep.ivcOpening));
    expect(sep.ivcOpening[2]).toBeLessThan(sep.fossa.centre[2]);
  });

  test('primum on the left-atrial side, secundum on the right-atrial side, overlapping', () => {
    const side = (pts: typeof sep.primum) => pts.map((p) => dot(sub(p, sep.plane.centre), sep.plane.normal));
    expect(Math.min(...side(sep.primum))).toBeGreaterThan(0);
    expect(Math.max(...side(sep.secundum))).toBeLessThan(0);
    const reach = (pts: typeof sep.primum) => pts.map((p) => dist(p, sep.fossa.centre));
    expect(Math.max(...reach(sep.primum))).toBeGreaterThan(Math.min(...reach(sep.secundum)));
  });

  test('the tunnel is built to its parameters and crosses from the right-atrial side to the left', () => {
    expect(sep.tunnel.lengthMm).toBeCloseTo(DEFAULT_PFO.tunnelLengthMm, 6);
    expect(sep.tunnel.widthMm).toBe(DEFAULT_PFO.tunnelWidthMm);
    const s = (p: typeof sep.tunnel.raMouth) => dot(sub(p, sep.fossa.centre), sep.plane.normal);
    expect(s(sep.tunnel.laMouth)).toBeGreaterThan(s(sep.tunnel.raMouth));
    const longer = pfoSeptum(scene.heart.get('ra')!, scene.heart.get('la')!, ivc(), { ...DEFAULT_PFO, tunnelLengthMm: 14 });
    expect(longer.tunnel.lengthMm).toBeCloseTo(14, 6);
  });

  test(`septal excursion above ${ASA_EXCURSION_MM} mm, and only above, is an atrial septal aneurysm`, () => {
    const make = (mm: number) => pfoSeptum(scene.heart.get('ra')!, scene.heart.get('la')!, ivc(), { ...DEFAULT_PFO, septalExcursionMm: mm });
    expect(make(ASA_EXCURSION_MM).atrialSeptalAneurysm).toBe(false);
    expect(make(ASA_EXCURSION_MM + 0.5).atrialSeptalAneurysm).toBe(true);
    expect(sep.atrialSeptalAneurysm).toBe(false);
    // And the flap bulges by the excursion.
    const bulge = (p: PfoSeptum) => Math.max(...p.primum.map((q) => dot(sub(q, p.plane.centre), p.plane.normal)));
    expect(bulge(make(12)) - bulge(make(2))).toBeCloseTo(10, 0);
  });

  test('the Eustachian valve runs from the rim of the IVC opening to the lower edge of the fossa, on the right-atrial side', () => {
    const e = sep.eustachian;
    expect(dist(e[0]!, sep.ivcOpening)).toBeCloseTo(8, 6); // its front rim
    expect(dist(e[e.length - 1]!, sep.fossa.centre)).toBeCloseTo(sep.fossa.radiusMm, 6); // the fossa's edge
    for (const p of e.slice(1, -1)) expect(dot(sub(p, sep.fossa.centre), sep.plane.normal)).toBeLessThanOrEqual(1e-6);
  });
});
