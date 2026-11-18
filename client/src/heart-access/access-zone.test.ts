/**
 * The apical access zone on the primary patient (ts-s1404-cta), for both transapical targets.
 *
 * Phase 1 acceptance (the brief): the zone excludes every vertex within the LAD clearance and below the minimum wall
 * thickness. Checked here with distances measured again by brute force, not read back from the zone's own flags.
 *
 *   ACCESS=write pnpm exec vitest run client/src/heart-access/access-zone.test.ts   also writes the heat maps and
 *                                                                                   metrics/aroovee/access-phase1/zone.json
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import { add, dist, scale, sub, unit, type V3 } from './geometry';
import { every } from './heart';
import {
  accessZone,
  BONE_CLEAR_MM,
  CORONARY_CLEARANCE_MM,
  DEFAULT_RULES,
  ENTRY_SPACES,
  HEART_CLEAR_MM,
  intercostalLabel,
  LUNG_CLEAR_MM,
  MIN_WALL_MM,
  type AccessZone,
  type Target,
} from './access-zone';
import { LAD_STOP_SHORT_OF_APEX_MM, type Vessel } from './coronary';
import { buildScene, type AccessScene } from './scene';
import { coloursFromTokens, renderLayersSvg, type Layer } from './render';

const ROOT = join(import.meta.dirname, '../../..');
const CASE = 'ts-s1404-cta';
const EVERY = 4;
let scene: AccessScene;
const zones = new Map<Target['id'], AccessZone>();

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
  for (const id of ['aortic_valve', 'mitral_valve'] as const) zones.set(id, accessZone(scene.targets[id], { lv: scene.lv, coronaries: scene.coronaries, chest: scene.chest.parts, otherHeart: scene.otherHeart, every: EVERY }));
}, 120_000);

/** Brute force: distance from p to a vessel's wall, over every centerline segment. */
const bruteVessel = (p: V3, v: Vessel): number => {
  let best = Infinity;
  for (let i = 1; i < v.line.length; i++) {
    const a = v.line[i - 1]!;
    const ab = sub(v.line[i]!, a);
    const l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / l2));
    best = Math.min(best, dist(p, add(a, scale(ab, t))));
  }
  return best - v.radiusMm;
};
/** Brute force: wall thickness at p, the distance to the nearest inner-wall vertex. */
const bruteWall = (p: V3): number => scene.lv.inner.reduce((m, i) => Math.min(m, dist(p, scene.lv.pts[i]!)), Infinity);
const vessels = () => [scene.coronaries.lad, ...scene.coronaries.diagonals];

describe(`the LV and the generated coronaries of ${CASE}`, () => {
  test('the wall thins toward the apex, as the brief expects', () => {
    const near: number[] = [];
    const mid: number[] = [];
    scene.lv.outer.forEach((i, k) => {
      const d = dist(scene.lv.pts[i]!, scene.lv.apex);
      if (d < 20) near.push(scene.lv.thicknessMm[k]!);
      else if (d > 50 && d < 70) mid.push(scene.lv.thicknessMm[k]!);
    });
    const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
    expect(median(near)).toBeLessThan(median(mid));
  });

  test('the LAD lies on the front of the LV wall, from the base to the set distance short of the apex', () => {
    const lad = scene.coronaries.lad.line;
    const outer = scene.lv.outer.map((i) => scene.lv.pts[i]!);
    for (const p of every(lad, 3)) expect(Math.min(...outer.map((q) => dist(p, q)))).toBeLessThan(3);
    expect(dist(lad[lad.length - 1]!, scene.lv.apex)).toBeGreaterThanOrEqual(LAD_STOP_SHORT_OF_APEX_MM - 1e-9);
    expect(dist(lad[0]!, scene.lv.base)).toBeLessThan(dist(lad[lad.length - 1]!, scene.lv.base));
    // Front: seen from the LV's long axis, every LAD point lies toward the patient's front (+y in RAS).
    for (const p of lad) {
      const t = (p[0] - scene.lv.base[0]) * scene.lv.axis[0] + (p[1] - scene.lv.base[1]) * scene.lv.axis[1] + (p[2] - scene.lv.base[2]) * scene.lv.axis[2];
      const radial = sub(p, add(scene.lv.base, scale(scene.lv.axis, t)));
      expect(unit(radial)[1], 'LAD point toward the front').toBeGreaterThan(0);
    }
  });
});

describe(`apical access zone on ${CASE}`, () => {
  test('acceptance: no allowed point is within the coronary clearance or thinner than the minimum wall (re-measured by brute force)', () => {
    for (const z of zones.values())
      for (const p of z.points.filter((q) => q.allowed)) {
        const at = scene.lv.pts[p.vertex]!;
        for (const v of vessels()) expect(bruteVessel(at, v), `${z.target.id} ${v.name}`).toBeGreaterThanOrEqual(CORONARY_CLEARANCE_MM);
        expect(bruteWall(at), z.target.id).toBeGreaterThanOrEqual(MIN_WALL_MM);
      }
  });

  test('acceptance, the other way: every sampled point inside the clearance or below the minimum wall is excluded', () => {
    for (const z of zones.values())
      for (const p of every(z.points, 40)) {
        const at = scene.lv.pts[p.vertex]!;
        const near = Math.min(...vessels().map((v) => bruteVessel(at, v))) < CORONARY_CLEARANCE_MM;
        const thin = bruteWall(at) < MIN_WALL_MM;
        if (near || thin) expect(p.allowed, `${z.target.id} vertex ${p.vertex}`).toBe(false);
      }
  });

  test('moving a rule moves the zone: an LAD laid through the best point, or a minimum wall just above it, rules it out', () => {
    const z = zones.get('mitral_valve')!;
    expect(z.best, 'the mitral zone has an allowed point').not.toBeNull();
    const at = scene.lv.pts[z.best!.vertex]!;
    const n = scene.lv.normals[z.best!.vertex]!;
    const t = unit(sub(scene.lv.apex, at));
    const fake: Vessel = { name: 'injected', line: [add(at, scale(t, -15)), add(at, scale(n, 0.5)), add(at, scale(t, 15))], radiusMm: 1.5, source: 'generated' };
    const withLad = accessZone(z.target, { lv: scene.lv, coronaries: { ...scene.coronaries, diagonals: [...scene.coronaries.diagonals, fake] }, chest: scene.chest.parts, otherHeart: scene.otherHeart, only: [z.best!.vertex] });
    expect(withLad.points).toHaveLength(1);
    expect(withLad.points[0]!.fails).toContain('coronary');
    // And without the injected vessel, the same single-point check allows it: only the rule changed.
    expect(accessZone(z.target, { lv: scene.lv, coronaries: scene.coronaries, chest: scene.chest.parts, otherHeart: scene.otherHeart, only: [z.best!.vertex] }).points[0]!.allowed).toBe(true);
    const thicker = accessZone(z.target, { lv: scene.lv, coronaries: scene.coronaries, chest: scene.chest.parts, otherHeart: scene.otherHeart, only: [z.best!.vertex], rules: { minWallMm: z.best!.wallMm + 0.1 } });
    expect(thicker.points.find((p) => p.vertex === z.best!.vertex)!.fails).toContain('wall');
  });

  test('every allowed entry line is clear and crosses a left entry window, the 4th to 7th intercostal space', () => {
    for (const z of zones.values())
      for (const p of z.points.filter((q) => q.allowed)) {
        const e = p.entry!;
        expect(e.boneMm).toBeGreaterThanOrEqual(BONE_CLEAR_MM);
        expect(e.lungMm).toBeGreaterThanOrEqual(LUNG_CLEAR_MM);
        expect(e.heartMm).toBeGreaterThanOrEqual(HEART_CLEAR_MM);
        expect(ENTRY_SPACES as readonly number[]).toContain(e.space);
        expect(p.coaxialDeg).toBeLessThanOrEqual(DEFAULT_RULES.coaxialMaxDeg);
      }
  });

  test('the counts add up, and the same inputs give the same zone', () => {
    for (const z of zones.values()) {
      expect(z.allowed).toBe(z.points.filter((p) => p.fails.length === 0).length);
      expect(z.points.length).toBe(Math.ceil(scene.lv.outer.length / EVERY));
    }
    const a = accessZone(scene.targets.mitral_valve, { lv: scene.lv, coronaries: scene.coronaries, chest: scene.chest.parts, otherHeart: scene.otherHeart, every: 32 });
    const b = accessZone(scene.targets.mitral_valve, { lv: scene.lv, coronaries: scene.coronaries, chest: scene.chest.parts, otherHeart: scene.otherHeart, every: 32 });
    expect(a.points.map((p) => [p.vertex, p.allowed, p.fails.join()])).toEqual(b.points.map((p) => [p.vertex, p.allowed, p.fails.join()]));
  });

  test('summary and heat maps', { timeout: 120_000 }, async () => {
    const summary = [...zones.values()].map((z) => {
      const best = z.best;
      return {
        target: z.target.id,
        sampled: `every ${z.every}th outer-wall vertex, ${z.points.length} points`,
        rules: z.rules,
        allowed: z.allowed,
        failCounts: z.failCounts,
        best: best
          ? {
              coaxialDeg: round(best.coaxialDeg),
              wallMm: round(best.wallMm),
              coronaryMm: round(best.coronaryMm),
              fromApexMm: round(dist(scene.lv.pts[best.vertex]!, scene.lv.apex)),
              window: intercostalLabel(best.entry!.between),
              boneMm: round(best.entry!.boneMm),
              lungMm: round(best.entry!.lungMm),
            }
          : null,
      };
    });
    expect(summary).toHaveLength(2);
    if (process.env.ACCESS !== 'write') return;
    const out = join(ROOT, 'metrics/aroovee/access-phase1');
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'zone.json'), JSON.stringify({ case: CASE, lv: { lengthMm: round(scene.lv.lengthMm) }, lad: { lengthMm: round(lineLength(scene.coronaries.lad.line)) }, zones: summary }, null, 2) + '\n');
    for (const z of zones.values()) await heatMap(z, join(out, `zone-${z.target.id}.png`));
  });
});

const round = (v: number) => Math.round(v * 10) / 10;
const lineLength = (l: V3[]) => l.reduce((s, p, i) => (i ? s + dist(p, l[i - 1]!) : 0), 0);

/** Tube surface points around a centerline, for drawing a vessel. */
const tube = (v: Vessel): V3[] => {
  const out: V3[] = [];
  for (let i = 1; i < v.line.length; i++) {
    const a = v.line[i - 1]!;
    const t = unit(sub(v.line[i]!, a));
    const u = unit(Math.abs(t[0]) < 0.9 ? [0, -t[2], t[1]] : [-t[2], 0, t[0]]);
    const w: V3 = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
    for (let s = 0; s < 1; s += 0.25) for (let q = 0; q < 8; q++) {
      const c = Math.cos((q * Math.PI) / 4) * v.radiusMm * 1.6;
      const d = Math.sin((q * Math.PI) / 4) * v.radiusMm * 1.6;
      out.push(add(add(a, scale(sub(v.line[i]!, a), s)), add(scale(u, c), scale(w, d))));
    }
  }
  return out;
};

async function heatMap(z: AccessZone, png: string): Promise<void> {
  const tokens = readFileSync(join(ROOT, 'client/src/styles/tokens.css'), 'utf8');
  const colours = coloursFromTokens(tokens);
  const tok = (name: string) => new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})`).exec(tokens)![1]!;
  const C = {
    good: tok('--color-scene-ghost'),
    fair: tok('--color-primary'),
    coronary: tok('--color-risk-forbidden'),
    wall: tok('--color-risk-heavy'),
    entry: tok('--color-risk-proximity'),
    coaxial: tok('--color-border'),
    lad: tok('--color-anatomy-artery'),
    bone: tok('--color-body-bone'),
    lung: tok('--color-heart-ra'),
  };
  // Each point once, in the colour of its verdict: allowed (by coaxial angle), else its first failed rule in the order
  // the rules matter most for safety.
  const order = ['coronary', 'wall', 'entry', 'coaxial'] as const;
  const groups: Record<string, V3[]> = { good: [], fair: [], coronary: [], wall: [], entry: [], coaxial: [] };
  for (const p of z.points) {
    const at = scene.lv.pts[p.vertex]!;
    if (p.allowed) groups[p.coaxialDeg <= 15 ? 'good' : 'fair']!.push(at);
    else groups[order.find((r) => p.fails.includes(r))!]!.push(at);
  }
  const chest = [...scene.chest.parts.values()];
  const layers: Layer[] = [
    { pts: every(chest.filter((p) => p.group === 'lung').flatMap((p) => p.pts), 4), fill: C.lung, r: 0.8, opacity: 0.25 },
    { pts: chest.filter((p) => p.group === 'rib' || p.group === 'sternum').flatMap((p) => every(p.pts, 2)), fill: C.bone, r: 0.9, opacity: 0.7 },
    { pts: groups['coaxial']!, fill: C.coaxial, r: 1.3, opacity: 0.9 },
    { pts: groups['wall']!, fill: C.wall, r: 1.5, opacity: 0.9 },
    { pts: groups['entry']!, fill: C.entry, r: 1.5, opacity: 0.9 },
    { pts: groups['coronary']!, fill: C.coronary, r: 1.5, opacity: 0.9 },
    { pts: groups['fair']!, fill: C.fair, r: 4, opacity: 1 },
    { pts: groups['good']!, fill: C.good, r: 4, opacity: 1 },
    ...[scene.coronaries.lad, ...scene.coronaries.diagonals].map((v) => ({ pts: tube(v), fill: C.lad, r: 1.2, opacity: 1 })),
  ];
  const marks: { at: V3; colour: string; label: string }[] = [{ at: z.target.centre, colour: colours.ink, label: z.target.label }];
  const focus: V3[] = [...scene.lv.outer.map((i) => scene.lv.pts[i]!)];
  if (z.best) {
    const at = scene.lv.pts[z.best.vertex]!;
    const out = unit(sub(at, z.target.centre));
    const line: V3[] = [];
    for (let s = -dist(at, z.target.centre); s <= 80; s += 1.5) line.push(add(at, scale(out, s)));
    layers.push({ pts: line, fill: colours.ink, r: 1.4, opacity: 1 });
    focus.push(...line);
    marks.push({ at, colour: colours.ink, label: 'Best entry' });
  }
  const best = z.best
    ? `Best entry: ${round(z.best.coaxialDeg)}° off the valve axis, wall ${round(z.best.wallMm)} mm, ${round(z.best.coronaryMm)} mm from the LAD, ${round(dist(scene.lv.pts[z.best.vertex]!, scene.lv.apex))} mm from the apex, through the ${intercostalLabel(z.best.entry!.between)}.`
    : `No point passes all four rules. Ruled out: near the LAD ${z.failCounts.coronary}, wall too thin ${z.failCounts.wall}, too far off axis ${z.failCounts.coaxial}, line blocked ${z.failCounts.entry} (a point can fail several).`;
  const svg = renderLayersSvg(
    `Apical access zone for the ${z.target.label.toLowerCase()}, ${CASE}: ${z.allowed} of ${z.points.length} sampled points allowed`,
    [best, `Rules: LAD ≥ ${z.rules.coronaryClearanceMm} mm · wall ≥ ${z.rules.minWallMm} mm · ≤ ${z.rules.coaxialMaxDeg}° off the valve axis · clear line through the left 4th to 7th intercostal space. LAD generated; heart a fitted template. Research and education only.`],
    layers,
    focus,
    [
      [C.good, 'Allowed, ≤ 15°'],
      [C.fair, 'Allowed, 15–30°'],
      [C.coronary, 'Near the LAD'],
      [C.wall, 'Wall too thin'],
      [C.entry, 'Line blocked'],
      [C.coaxial, 'Too far off axis'],
      [C.lad, 'LAD (generated)'],
    ],
    colours,
    marks,
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
