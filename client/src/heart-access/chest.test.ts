/**
 * The chest of the primary patient (ts-s1404-cta) and the fitted heart inside it: the file loads, it is in the case's
 * frame, the anatomy is where anatomy is, and the fitted heart sits inside the chest.
 *
 *   CHEST=write pnpm exec vitest run client/src/heart-access/chest.test.ts   also writes the review picture and
 *                                                                           metrics/aroovee/access-phase1/chest.json
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import type { CenterlinesJson } from '../contracts';
import { CHEST_PARTS, loadCaseChest, type CaseChest } from './chest';
import { apply, PointGrid, type V3 } from './geometry';
import { centroid, every, loadCaseHeart, loadTemplateHeart, type CaseHeart, type TemplateHeart } from './heart';
import { placeTemplate, templateApex, type HeartFit } from './fit';
import { coloursFromTokens, renderLayersSvg } from './render';

const ROOT = join(import.meta.dirname, '../../..');
const CASE = 'ts-s1404-cta';
const dir = join(ROOT, 'client/public/cases', CASE);

let chest: CaseChest;
let ct: CaseHeart;
let template: TemplateHeart;
let fit: HeartFit;

beforeAll(async () => {
  chest = loadCaseChest(new Uint8Array(readFileSync(join(dir, 'chest.glb'))));
  ct = loadCaseHeart(CASE, new Uint8Array(readFileSync(join(dir, 'context.glb'))), JSON.parse(readFileSync(join(dir, 'centerlines.json'), 'utf8')) as CenterlinesJson);
  template = await loadTemplateHeart('kcl-average', new Uint8Array(readFileSync(join(ROOT, 'client/public/hearts/kcl-average/heart.glb'))));
  fit = JSON.parse(readFileSync(join(dir, 'heart-fit.json'), 'utf8')) as HeartFit;
}, 60_000);

const c = (name: string): V3 => centroid(chest.parts.get(name)!.pts);
const box = (pts: V3[]) => ({ min: [0, 1, 2].map((a) => Math.min(...pts.map((p) => p[a]!))), max: [0, 1, 2].map((a) => Math.max(...pts.map((p) => p[a]!))) });

describe(`chest of ${CASE}`, () => {
  test('every part is there, with its group', () => {
    for (const p of CHEST_PARTS) expect(chest.parts.has(p), p).toBe(true);
    expect(chest.parts.get('lung_left')!.group).toBe('lung');
    expect(chest.parts.get('rib_left_5')!.group).toBe('rib');
  });

  test('it is in the case\'s frame: its builder checked the heart mask against context.glb', () => {
    const a = chest.source['alignment'] as { largest_difference_mm: number };
    expect(a.largest_difference_mm).toBeLessThanOrEqual(2);
    // And the case's own heart sits between the lungs, behind the sternum.
    const heart = centroid(ct.surface.pts);
    expect(c('lung_left')[0]).toBeLessThan(heart[0]);
    expect(c('lung_right')[0]).toBeGreaterThan(heart[0]);
    expect(c('sternum')[1]).toBeGreaterThan(heart[1]);
  });

  test('anatomy is where anatomy is: left is −x, ribs descend 1 to 12, cartilage joins ribs to the sternum in front', () => {
    expect(c('lung_left')[0]).toBeLessThan(0);
    expect(c('lung_right')[0]).toBeGreaterThan(0);
    for (const side of ['left', 'right'])
      for (let i = 1; i < 12; i++) expect(c(`rib_${side}_${i + 1}`)[2], `${side} rib ${i + 1} below rib ${i}`).toBeLessThan(c(`rib_${side}_${i}`)[2]);
    expect(c('costal_cartilages')[1]).toBeGreaterThan(c('rib_left_5')[1]);
  });

  test('no part strays far from the chest (the specks are gone)', () => {
    const all = box([...chest.parts.values()].flatMap((p) => every(p.pts, 5)));
    const size = all.max.map((v, a) => v - all.min[a]!);
    expect(size[0]).toBeLessThan(320);
    expect(size[1]).toBeLessThan(260);
    expect(size[2]).toBeLessThan(400);
  });

  test('the fitted heart is inside the chest: between the lungs, behind the sternum, its apex inside the ribs', async () => {
    const placed = placeTemplate(template, fit);
    const heart = centroid([...placed.values()].flatMap((p) => every(p.pts, 20)));
    expect(heart[0]).toBeGreaterThan(c('lung_left')[0]);
    expect(heart[0]).toBeLessThan(c('lung_right')[0]);
    expect(heart[1]).toBeLessThan(c('sternum')[1]);
    const apex = apply(fit.matrixRasMm, templateApex(template));
    const leftRibs = box(Array.from({ length: 12 }, (_, i) => chest.parts.get(`rib_left_${i + 1}`)!.pts).flat());
    expect(apex[0]).toBeGreaterThan(leftRibs.min[0]!); // medial to the outermost left ribs
    expect(apex[1]).toBeLessThan(box(chest.parts.get('costal_cartilages')!.pts).max[1]!); // behind the front of the chest

    // The numbers Phase 1's entry line starts from.
    const nearest = (name: string) => new PointGrid(chest.parts.get(name)!.pts, 6).nearest(apex, 200);
    const ribs = CHEST_PARTS.filter((p) => p.startsWith('rib_')).map((p) => ({ p, d: nearest(p).d })).sort((a, b) => a.d - b.d);
    const summary = {
      case: CASE,
      apexRasMm: apex.map((v) => Math.round(v * 10) / 10),
      nearestRibs: ribs.slice(0, 3).map((r) => ({ rib: r.p, mm: Math.round(r.d * 10) / 10 })),
      nearestLungMm: Math.round(nearest('lung_left').d * 10) / 10,
      nearestCartilageMm: Math.round(nearest('costal_cartilages').d * 10) / 10,
      triangles: [...chest.parts.values()].reduce((s, p) => s + p.tris.length / 3, 0),
    };
    // The apex lies against the left lower ribs (5th to 7th), as a left ventricle's apex does.
    expect(ribs.slice(0, 3).every((r) => /^rib_left_[4-8]$/.test(r.p)), JSON.stringify(summary.nearestRibs)).toBe(true);

    if (process.env.CHEST !== 'write') return;
    const out = join(ROOT, 'metrics/aroovee/access-phase1');
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'chest.json'), JSON.stringify(summary, null, 2) + '\n');
    await writePicture(placed, apex, join(out, 'chest-ts-s1404-cta.png'));
  });
});

async function writePicture(placed: Map<string, { pts: V3[] }>, apex: V3, png: string): Promise<void> {
  const tokens = readFileSync(join(ROOT, 'client/src/styles/tokens.css'), 'utf8');
  const colours = coloursFromTokens(tokens);
  const tok = (name: string) => new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})`).exec(tokens)![1]!;
  const bone = tok('--color-body-bone');
  const cartilage = tok('--color-scene-vessel');
  const lung = tok('--color-heart-ra');
  const group = (g: string) => [...chest.parts.values()].filter((p) => p.group === g).flatMap((p) => every(p.pts, 2));
  const heartLayers = [...placed.entries()].map(([name, p]) => ({ pts: every(p.pts, Math.ceil(p.pts.length / 500)), fill: (colours as Record<string, string>)[name] ?? colours.ct, r: 1.3, opacity: 0.9 }));
  const svg = renderLayersSvg(
    `Chest of ${CASE} with the fitted template heart`,
    'Lungs, ribs, costal cartilages and sternum from the CT (TotalSegmentator masks, CC BY 4.0). The heart is the template, fitted (heart-fit.json). Research and education only.',
    [
      { pts: every(group('lung'), 3), fill: lung, r: 0.9, opacity: 0.35 },
      { pts: group('rib'), fill: bone, r: 1.0, opacity: 0.9 },
      { pts: group('cartilage'), fill: cartilage, r: 1.0, opacity: 0.8 },
      { pts: group('sternum'), fill: bone, r: 1.0, opacity: 0.9 },
      ...heartLayers,
    ],
    [...chest.parts.values()].filter((p) => p.group !== 'lung').flatMap((p) => every(p.pts, 10)),
    [[lung, 'Lungs'], [bone, 'Ribs and sternum'], [cartilage, 'Costal cartilage'], [colours.lv_myocardium!, 'Heart (template, fitted)']],
    colours,
    [{ at: apex, colour: colours.ink, label: 'LV apex' }],
  );
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  try {
    const w = Number(/width="(\d+)"/.exec(svg)![1]);
    const h = Number(/height="(\d+)"/.exec(svg)![1]);
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
    await page.screenshot({ path: png });
  } finally {
    await browser.close();
  }
}
