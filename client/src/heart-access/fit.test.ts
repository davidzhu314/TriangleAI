/**
 * The template heart fitted into each CT case.
 *
 * Normal run (light, so it never slows the rest of the suite): each committed client/public/cases/<case>/heart-fit.json
 * has its landmarks (aortic root, aorta direction, apex, scale, rotation) scored again from its own matrix, and its
 * verdict and the quality floor are checked. Fitting (about 30 s a case) and the full surface score run on request:
 *
 *   HEART_FIT=check pnpm exec vitest run client/src/heart-access/fit.test.ts   fit again (matrices must match) and
 *                                                                              score every surface point again
 *   HEART_FIT=write pnpm exec vitest run client/src/heart-access/fit.test.ts   fit again and rewrite the files and the
 *                                                                              review pictures in metrics/aroovee/access-phase1/
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import type { CenterlinesJson } from '../contracts';
import { apply, fitSimilarity, PointGrid, rotationAbout, similarity, type V3 } from './geometry';
import { centroid, loadCaseHeart, loadTemplateHeart, type CaseHeart, type TemplateHeart } from './heart';
import { fitHeart, FIT_LIMITS, scoreFit, scoreLandmarks, type HeartFit } from './fit';
import { coloursFromTokens, renderFitSvg } from './render';

const ROOT = join(import.meta.dirname, '../../..');
const CASES = ['ts-s1404-cta', 'ts-s1336-cta', 'ts-s0727-cta'];
const HEART = 'kcl-average';
/** The case the access module uses as its patient (DECISIONS.md 2026-11-17). */
const PRIMARY = 'ts-s1404-cta';
const mode = process.env.HEART_FIT;
const fitPath = (id: string) => join(ROOT, 'client/public/cases', id, 'heart-fit.json');
const round = (_: string, v: unknown) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);

let template: TemplateHeart;
const cts = new Map<string, CaseHeart>();

beforeAll(async () => {
  template = await loadTemplateHeart(HEART, new Uint8Array(readFileSync(join(ROOT, 'client/public/hearts', HEART, 'heart.glb'))));
  for (const id of CASES) {
    const dir = join(ROOT, 'client/public/cases', id);
    cts.set(id, loadCaseHeart(id, new Uint8Array(readFileSync(join(dir, 'context.glb'))), JSON.parse(readFileSync(join(dir, 'centerlines.json'), 'utf8')) as CenterlinesJson));
  }
}, 60_000);

const saved = (id: string): HeartFit => JSON.parse(readFileSync(fitPath(id), 'utf8')) as HeartFit;

describe('geometry helpers', () => {
  test('the similarity fit recovers a known rotation, scale and shift', () => {
    const a: V3[] = [[0, 0, 0], [10, 0, 0], [0, 20, 0], [0, 0, 30], [5, 7, -3], [-8, 2, 11]];
    const m = similarity(rotationAbout([1, 2, 3], 37), 1.2, [4, -5, 6]);
    const b = a.map((p) => apply(m, p));
    const got = fitSimilarity(a, b, a.map(() => 1));
    for (let i = 0; i < 12; i++) expect(got[i]!).toBeCloseTo(m[i]!, 6);
  });

  test('the point grid finds the true nearest point', () => {
    const pts: V3[] = Array.from({ length: 500 }, (_, n) => [Math.sin(n) * 50, Math.cos(n * 1.3) * 50, ((n * 7) % 100) - 50]);
    const g = new PointGrid(pts, 6);
    for (const q of [[0, 0, 0], [30, -20, 10], [-49, 49, -49]] as V3[]) {
      const brute = pts.reduce((b, p, n) => (Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < b.d ? { at: n, d: Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) } : b), { at: -1, d: Infinity });
      expect(g.nearest(q, 200).at).toBe(brute.at);
    }
  });
});

describe.skipIf(!mode)('fitting again', () => {
  test('fit every case; the matrices match the committed ones (check) or replace them (write)', { timeout: 600_000 }, async () => {
    const fits = new Map(CASES.map((id) => [id, fitHeart(template, cts.get(id)!)]));
    if (mode === 'write') await writeAll(fits);
    for (const id of CASES) for (let i = 0; i < 16; i++) expect(saved(id).matrixRasMm[i]!).toBeCloseTo(fits.get(id)!.matrixRasMm[i]!, 3);
  });

  test('scoring a saved matrix again gives its saved metrics and verdict', { timeout: 120_000 }, () => {
    for (const id of CASES) {
      const f = saved(id);
      const now = scoreFit(template, cts.get(id)!, f.matrixRasMm);
      for (const [k, v] of Object.entries(now.metrics)) expect(v, `${id} ${k}`).toBeCloseTo((f.metrics as unknown as Record<string, number>)[k]!, 2);
      expect(now.verdict).toBe(f.verdict);
      expect(now.reasons).toEqual(f.reasons);
    }
  });
});

describe('the committed fits', () => {
  test('every case has one, for this heart and this case', () => {
    for (const id of CASES) {
      expect(existsSync(fitPath(id)), `${fitPath(id)} is missing: run with HEART_FIT=write (see the header)`).toBe(true);
      expect(saved(id).heart).toBe(HEART);
      expect(saved(id).case).toBe(id);
    }
  });

  test('the landmarks of each saved matrix score as saved', () => {
    for (const id of CASES) {
      const f = saved(id);
      const now = scoreLandmarks(template, cts.get(id)!, f.matrixRasMm);
      for (const [k, v] of Object.entries(now)) expect(v, `${id} ${k}`).toBeCloseTo((f.metrics as unknown as Record<string, number>)[k]!, 2);
    }
  });

  test('every fit lies on its CT heart, lines up the aorta, and has an honest verdict', () => {
    for (const id of CASES) {
      const f = saved(id);
      const m = f.metrics;
      // Floor for every case: the template sits on the CT heart and the aorta lines up.
      expect(m.ctToTemplateMedianMm, `${id} median`).toBeLessThan(FIT_LIMITS.medianMm);
      expect(m.ctWithin5mmPct, `${id} within 5 mm`).toBeGreaterThan(50);
      expect(m.aorticRootMm, `${id} aortic root`).toBeLessThan(FIT_LIMITS.aorticRootMm);
      expect(m.aortaAxisDeg, `${id} aorta axis`).toBeLessThan(FIT_LIMITS.aortaAxisDeg);
      expect(m.scale).toBeGreaterThan(0.7);
      expect(m.scale).toBeLessThan(1.4);
      // The verdict follows the limits exactly.
      const good = m.ctToTemplateMedianMm <= FIT_LIMITS.medianMm && m.apexToCtMm <= FIT_LIMITS.apexMm && m.aorticRootMm <= FIT_LIMITS.aorticRootMm && m.aortaAxisDeg <= FIT_LIMITS.aortaAxisDeg;
      expect(f.verdict, id).toBe(good ? 'good' : 'approximate');
      expect(f.reasons.length === 0, id).toBe(good);
    }
  });

  test('the primary patient has a good fit', () => {
    expect(saved(PRIMARY).verdict).toBe('good');
  });
});

/** Write the fits, the review pictures (PNG in metrics/, SVG in test-results/) and a summary. */
async function writeAll(fits: Map<string, HeartFit>): Promise<void> {
  const colours = coloursFromTokens(readFileSync(join(ROOT, 'client/src/styles/tokens.css'), 'utf8'));
  const outDir = join(ROOT, 'metrics/aroovee/access-phase1');
  const svgDir = join(ROOT, 'test-results/heart-fit');
  mkdirSync(outDir, { recursive: true });
  mkdirSync(svgDir, { recursive: true });
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  try {
    for (const id of CASES) {
      const fit = fits.get(id)!;
      const ct = cts.get(id)!;
      writeFileSync(fitPath(id), JSON.stringify(fit, round, 2) + '\n');
      // "Before": the template where it starts, centred on the CT heart, unrotated and unscaled.
      const c = centroid(ct.surface.pts);
      const t = centroid([...template.parts.values()].flatMap((p) => p.pts));
      const before = similarity([1, 0, 0, 0, 1, 0, 0, 0, 1], 1, [c[0] - t[0], c[1] - t[1], c[2] - t[2]]);
      const m = fit.metrics;
      const svg = renderFitSvg(
        template,
        ct,
        [
          { title: 'Before the fit', matrix: before, caption: 'The template centred on the CT heart, in its own orientation and size.' },
          {
            title: `After the fit: ${fit.verdict}`,
            matrix: fit.matrixRasMm,
            caption: `CT surface to template: median ${m.ctToTemplateMedianMm.toFixed(1)} mm, ${m.ctWithin5mmPct.toFixed(0)}% within 5 mm. LV apex ${m.apexToCtMm.toFixed(1)} mm from the CT surface. Aortic root ${m.aorticRootMm.toFixed(1)} mm, aorta axis ${m.aortaAxisDeg.toFixed(0)}°. Scale ${m.scale.toFixed(2)}, rotated ${m.rotationDeg.toFixed(0)}°.`,
          },
        ],
        colours,
        `Template heart (${HEART}) fitted into ${id}`,
      );
      writeFileSync(join(svgDir, `fit-${id}.svg`), svg);
      const w = Number(/width="(\d+)"/.exec(svg)![1]);
      const h = Number(/height="(\d+)"/.exec(svg)![1]);
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
      await page.screenshot({ path: join(outDir, `fit-${id}.png`) });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  writeFileSync(
    join(outDir, 'fits.json'),
    JSON.stringify(CASES.map((id) => ({ case: id, verdict: fits.get(id)!.verdict, reasons: fits.get(id)!.reasons, metrics: fits.get(id)!.metrics, starts: fits.get(id)!.starts })), round, 2) + '\n',
  );
}
