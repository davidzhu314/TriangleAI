/**
 * Phase 2 of the access module: the device model with contact on runs at 30 fps or better in the browser (the brief's
 * starting target). Through the test-only harness (tests/e2e/harness/device.html) on a Vite dev server started here:
 * both scripted runs on ts-s1404-cta with every step timed, then the bent run driven by requestAnimationFrame.
 * Writes metrics/aroovee/access-phase2/browser.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

const DEPS = { include: ['three', 'three/examples/jsm/loaders/GLTFLoader.js', 'three/examples/jsm/libs/meshopt_decoder.module.js'] };
const FRAME_MS = 1000 / 30;

let vite: ViteDevServer;
let base = '';

test.beforeAll(async () => {
  vite = await createServer({ configFile: false, root: process.cwd(), logLevel: 'silent', server: { port: 0, strictPort: false, hmr: false }, appType: 'mpa', optimizeDeps: DEPS });
  await vite.listen();
  const addr = vite.httpServer?.address();
  base = typeof addr === 'object' && addr ? `http://localhost:${addr.port}` : '';
});

test.afterAll(async () => {
  await vite?.close();
});

const pct = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))]!;

test('device model with contact on: every step fits a 30 fps frame, and a live loop reaches 30 fps', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(`${base}/tests/e2e/harness/device.html`);
  await page.waitForFunction(() => window.__device?.ready, null, { timeout: 150_000 });
  const r = await page.evaluate(() => window.__device);
  expect(r.error, r.error).toBeUndefined();

  // Contact really was on: the bent run touched the wall, the straight one did not.
  expect(r.straightContacts).toBe(0);
  expect(r.intoWallContacts).toBeGreaterThan(0);
  expect(r.rafContactFrames).toBeGreaterThan(0);

  const summary = {
    case: 'ts-s1404-cta',
    browser: 'Chromium (Playwright, headless)',
    scriptedSteps: { count: r.stepMs.length, medianMs: round(pct(r.stepMs, 0.5)), p95Ms: round(pct(r.stepMs, 0.95)), maxMs: round(Math.max(...r.stepMs)) },
    liveLoop: {
      frames: r.rafIntervalsMs.length,
      medianFrameMs: round(pct(r.rafIntervalsMs, 0.5)),
      fps: round(1000 / pct(r.rafIntervalsMs, 0.5)),
      stepMedianMs: round(pct(r.rafStepMs, 0.5)),
      stepP95Ms: round(pct(r.rafStepMs, 0.95)),
      framesWithContact: r.rafContactFrames,
    },
  };
  const out = join(process.cwd(), 'metrics/aroovee/access-phase2');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'browser.json'), JSON.stringify(summary, null, 2) + '\n');

  expect(summary.scriptedSteps.p95Ms).toBeLessThan(FRAME_MS);
  expect(summary.liveLoop.stepP95Ms).toBeLessThan(FRAME_MS);
  expect(summary.liveLoop.fps).toBeGreaterThanOrEqual(30);
});

const round = (v: number) => Math.round(v * 100) / 100;

declare global {
  interface Window {
    __device: { ready: boolean; error?: string; stepMs: number[]; rafIntervalsMs: number[]; rafStepMs: number[]; rafContactFrames: number; straightContacts: number; intoWallContacts: number };
  }
}
