/**
 * Phase 2 on the primary patient (ts-s1404-cta): the default catheter through an apical port at Phase 1's best mitral
 * entry, with the LV's inner wall as the contact surface.
 *
 *   DEVICE=write pnpm exec vitest run client/src/heart-access/device/device-scene.test.ts   also writes the picture and
 *                                                                                           metrics/aroovee/access-phase2/runs.json
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import { dist, dot, sub, unit, type V3 } from '../geometry';
import { every } from '../heart';
import { buildScene, type AccessScene } from '../scene';
import { coloursFromTokens, renderLayersSvg } from '../render';
import { ConstantCurvatureCatheter } from './constant-curvature';
import { lvCavityMesh } from './contact';
import { portBase } from './port';
import { AccessSim, idle } from './sim';
import { DT, INTO_WALL_ASKED_MM, mitralSetup, runIntoWall, runStraight } from './scripted';

const ROOT = join(import.meta.dirname, '../../../..');
const CASE = 'ts-s1404-cta';
let scene: AccessScene;
let sims: { straight: AccessSim; intoWall: AccessSim };
const timing: number[] = [];

const cath = new ConstantCurvatureCatheter();

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
  const setup = mitralSetup(scene);
  const straight = runStraight(scene, setup, (_, ms) => timing.push(ms));
  const intoWall = runIntoWall(setup, (_, ms) => timing.push(ms));
  sims = { straight, intoWall };
}, 120_000);

describe(`default catheter through an apical port on ${CASE}`, () => {
  test('the port goes in at a slant, so its path through the wall is longer than the wall is thick; its tip is inside the cavity', () => {
    const port = sims.straight.port;
    expect(port.throughWallMm).toBeGreaterThan(port.wallMm);
    const cavity = lvCavityMesh(scene.heart.get('lv_myocardium')!, scene.lv);
    expect(cavity.bvh.closest(portBase(port).p, 60)!.signed).toBeGreaterThan(cath.config.outerDiameterMm / 2);
  });

  test('straight in from the best mitral entry: it reaches 5 mm short of the mitral valve along the port axis, without touching the wall', () => {
    const s = sims.straight;
    const tip = s.last!.backbone.tip.p;
    const target = scene.targets.mitral_valve.centre;
    expect(dist(tip, target)).toBeCloseTo(5, 0);
    // Along the port's axis: the tip is on the line from the port to the valve.
    const axis = unit(sub(target, portBase(s.port).p));
    const off = sub(tip, portBase(s.port).p);
    expect(Math.hypot(...sub(off, axis.map((a) => a * dot(off, axis)) as V3))).toBeLessThan(0.01);
    expect(s.tissues.get('wall')?.events ?? 0).toBe(0);
    expect(s.peakPortLoadN).toBe(0);
  });

  test('bending toward the nearest wall while pushing: contact holds it back, forces stay within the indentation limit, and the port feels it', () => {
    const s = sims.intoWall;
    const rec = s.tissues.get('wall');
    expect(rec?.events ?? 0).toBeGreaterThan(0);
    expect(rec!.peakForceN).toBeLessThanOrEqual(0.1 * cath.config.maxIndentMm + 1e-6);
    expect(s.last!.contacts.every((c) => c.depthMm <= cath.config.maxIndentMm + 1e-6)).toBe(true);
    expect(s.peakPortLoadN).toBeGreaterThan(0);
    // It was held back: it got less far than it was asked to.
    expect(s.q.insertMm).toBeLessThan(INTO_WALL_ASKED_MM - 1);
  });

  test(`a step with contact on takes well under a 30 fps frame here (${'node'})`, () => {
    const sorted = [...timing].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(0.95 * sorted.length)]!;
    expect(p95).toBeLessThan(1000 / 30);
  });

  test('summary and picture', { timeout: 120_000 }, async () => {
    const summarise = (s: AccessSim) => ({
      insertMm: round(s.q.insertMm),
      tipToMitralMm: round(dist(s.last!.backbone.tip.p, scene.targets.mitral_valve.centre)),
      wallContactEvents: s.tissues.get('wall')?.events ?? 0,
      peakWallForceN: round(s.tissues.get('wall')?.peakForceN ?? 0, 3),
      peakPortLoadN: round(s.peakPortLoadN, 3),
      timeS: round(s.timeS),
    });
    const sorted = [...timing].sort((a, b) => a - b);
    const summary = {
      case: CASE,
      device: cath.config,
      straight: summarise(sims.straight),
      intoWall: summarise(sims.intoWall),
      stepMsNode: { median: round(sorted[Math.floor(sorted.length / 2)]!, 2), p95: round(sorted[Math.floor(0.95 * sorted.length)]!, 2), steps: sorted.length },
    };
    expect(summary.straight.wallContactEvents).toBe(0);
    if (process.env.DEVICE !== 'write') return;
    const out = join(ROOT, 'metrics/aroovee/access-phase2');
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'runs.json'), JSON.stringify(summary, null, 2) + '\n');
    await picture(join(out, 'device-runs.png'));
  });
});

const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

async function picture(png: string): Promise<void> {
  const tokens = readFileSync(join(ROOT, 'client/src/styles/tokens.css'), 'utf8');
  const colours = coloursFromTokens(tokens);
  const tok = (name: string) => new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})`).exec(tokens)![1]!;
  const wire = tok('--color-scene-wire');
  const route = tok('--color-scene-ghost');
  const hit = tok('--color-risk-forbidden');
  const inner = scene.lv.inner.map((i) => scene.lv.pts[i]!);
  const s1 = sims.straight.last!;
  const s2 = sims.intoWall.last!;
  // Only the LV's inner wall within 12 mm of the plane the two runs lie in, so the device is visible inside it.
  const a = portBase(sims.straight.port).p;
  const n = unit(cross3(sub(s1.backbone.tip.p, a), sub(s2.backbone.tip.p, a)));
  const slab = inner.filter((p) => Math.abs(dot(sub(p, a), n)) < 12);
  const thick = (pts: V3[]) => pts.flatMap((p) => [p, ...[[0.6, 0, 0], [-0.6, 0, 0], [0, 0.6, 0], [0, -0.6, 0], [0, 0, 0.6], [0, 0, -0.6]].map((o) => [p[0] + o[0]!, p[1] + o[1]!, p[2] + o[2]!] as V3)]);
  const svg = renderLayersSvg(
    `Default catheter through the apical port, ${CASE}`,
    [
      `Dark: straight in toward the mitral valve, stopping 5 mm short, no wall contact. Purple: bent toward the nearest wall while pushing; red marks its contacts (held at ${cath.config.maxIndentMm} mm indentation).`,
      'Grey: the LV inner wall within 12 mm of the plane of the two runs. Device and stiffness are assumed. Research and education only.',
    ],
    [
      { pts: every(slab, 2), fill: colours.ct, r: 1, opacity: 0.6 },
      { pts: thick(s1.backbone.pts), fill: wire, r: 1.2, opacity: 1 },
      { pts: thick(s2.backbone.pts), fill: route, r: 1.2, opacity: 1 },
      { pts: s2.contacts.map((c) => c.at), fill: hit, r: 4, opacity: 1 },
    ],
    [...slab, ...s1.backbone.pts, ...s2.backbone.pts],
    [[colours.ct, 'LV inner wall (slice)'], [wire, 'Straight run'], [route, 'Bent run'], [hit, 'Contact']],
    colours,
    [{ at: scene.targets.mitral_valve.centre, colour: colours.ink, label: 'Mitral valve' }, { at: a, colour: colours.ink, label: 'Port tip' }],
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

const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export { idle };
