/**
 * A5 against real wire sources, through the test-only harness (tests/e2e/harness/drive.html) served by a Vite dev
 * server started here. Screens never construct a source; the harness injects one where the app passes select.ts:
 * Vaibhav's RailWireSource on a manual clock, a spy that records control frames, and a fake physics source that
 * falls back. Expected HUD values come from the wire's own states with the one step recorded in DECISIONS.md.
 */
import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import type { WireState } from '../../client/src/contracts';

test.describe.configure({ mode: 'serial' });

let vite: ViteDevServer;
let base = '';

test.beforeAll(async () => {
  vite = await createServer({ configFile: false, root: process.cwd(), logLevel: 'silent', server: { port: 0, strictPort: false, hmr: false }, appType: 'mpa' });
  await vite.listen();
  const addr = vite.httpServer?.address();
  base = typeof addr === 'object' && addr ? `http://localhost:${addr.port}` : '';
});

test.afterAll(async () => {
  await vite?.close();
});

const fmt = (v: number, d: number): string => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

async function open(page: Page, query: string): Promise<void> {
  await page.goto(`${base}/tests/e2e/harness/drive.html?${query}`);
  await expect(page.getByTestId('drive-stage')).toBeVisible();
  await page.waitForFunction(() => !!window.__drive);
}

/** Advance the rail wire n ticks (1/30 s of simulation each), letting a frame pass first so held keys reach it. */
async function tick(page: Page, n: number): Promise<WireState | null> {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return page.evaluate((k) => window.__drive.tick(k), n);
}

/** The screen's fluoro sum, recomputed from the wire's own states: simulation time while fluoro is on. */
async function fluoroUsed(page: Page): Promise<number> {
  return page.evaluate(() => {
    let used = 0;
    let last: number | null = null;
    for (const s of window.__drive.states) {
      if (last !== null && s.fluoro) used += Math.max(0, s.t - last);
      last = s.t;
    }
    return used;
  });
}

test('keys reach the wire as ControlInput frames: W pushes, Space holds fluoro, C puffs once', async ({ page }) => {
  await open(page, 'source=spy');
  await page.keyboard.down('KeyW');
  await page.keyboard.down('Space');
  await page.waitForFunction(() => window.__drive.spy!.frames.some((f) => f.push === 1 && f.fluoro));
  await page.keyboard.up('KeyW');
  await page.keyboard.up('Space');
  await page.keyboard.press('KeyC');
  await page.waitForFunction(() => window.__drive.spy!.frames.some((f) => f.contrastPuff));
  const puffs = await page.evaluate(() => window.__drive.spy!.frames.filter((f) => f.contrastPuff).length);
  expect(puffs).toBe(1);
});

test('rail drive to the target: the HUD equals the wire state, then the drive is saved for Results', async ({ page }) => {
  await open(page, 'case=fixture-y&source=autopilot');
  await expect(page.getByTestId('drive-mode')).toHaveText('Front view · rail mode');
  await page.keyboard.down('Space'); // fluoro held for part of the drive
  let s = await tick(page, 45);
  await page.keyboard.up('Space');
  s = await tick(page, 5);
  expect(s).not.toBeNull();

  // Mid-route: every HUD number from WireState with the recorded arithmetic.
  const planned = await page.evaluate(() => window.__drive.plannedLengthM);
  const vessel = await page.evaluate((edge) => {
    const el = document.querySelector('[data-testid=hud-vessel]');
    return { shown: el?.textContent ?? '', edge };
  }, s!.edge);
  expect(vessel.shown.length).toBeGreaterThan(0);
  await expect(page.getByTestId('hud-distance')).toHaveText(`${fmt(Math.max(0, planned! - s!.s) * 100, 1)} cm`);
  await expect(page.getByTestId('hud-force')).toHaveText(`${fmt(s!.contactForceN, 2)} N`);
  await expect(page.getByTestId('hud-fluoro')).toContainText(`${fmt(await fluoroUsed(page), 1)} of `);
  expect(await fluoroUsed(page)).toBeGreaterThan(0);

  // Drive on to the target.
  for (let i = 0; i < 80 && !(s?.atTarget); i++) s = await tick(page, 30);
  expect(s?.atTarget).toBe(true);
  await expect(page.getByTestId('drive-banner')).toContainText('The wire reached the');
  await page.getByTestId('finish-drive').click();
  await expect(page.getByTestId('drive-banner')).toContainText('Drive saved');
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('threadsim.drives.v1') ?? '{}'));
  expect(saved['fixture-y'].log.samples.length).toBeGreaterThan(0);
  expect(saved['fixture-y'].log.events.some((e: { kind: string }) => e.kind === 'target_reached')).toBe(true);
  expect(saved['fixture-y'].plan.edges).toEqual(await page.evaluate(() => window.__drive.plan.edges));
});

test('off the planned route is said in words, and pushing into a dead end shows the wall-force warning', async ({ page }) => {
  // Find a roll that sends the wire into a branch off the plan: rotate for k ticks, then push.
  let found = false;
  for (let k = 0; k <= 30 && !found; k += 3) {
    await open(page, 'case=fixture-y&source=rail');
    if (k) {
      await page.keyboard.down('KeyD');
      await tick(page, k);
      await page.keyboard.up('KeyD');
    }
    await page.keyboard.down('KeyW');
    const planEdges = await page.evaluate(() => window.__drive.plan.edges);
    let s: WireState | null = null;
    for (let i = 0; i < 40; i++) {
      s = await tick(page, 10);
      if (s && !planEdges.includes(s.edge)) break;
    }
    if (s && !planEdges.includes(s.edge)) {
      found = true;
      await expect(page.getByTestId('drive-banner')).toContainText('Off the planned route');
      // Keep pushing against the end of the wrong branch: the rail wire reports wall force over the threshold.
      for (let i = 0; i < 30 && !(s && s.contactForceN > 0.5); i++) s = await tick(page, 15);
      await expect(page.getByTestId('drive-banner')).toHaveText('Wall force over the threshold. Ease off and rotate.');
      await expect(page.locator('.meter-force')).toHaveClass(/meter-over/);
    }
    await page.keyboard.up('KeyW');
  }
  expect(found, 'some roll should send the wire off the planned route').toBe(true);
});

test('with no wire at all, the HUD shows dashes and the screen says so; nothing is made up', async ({ page }) => {
  await open(page, 'case=fixture-y&source=none');
  await expect(page.getByTestId('drive-banner')).toHaveText("Driving isn't available yet in this build. The view shows your planned route.");
  await expect(page.getByTestId('drive-mode')).toHaveText('Front view · wire not connected');
  for (const id of ['hud-vessel', 'hud-distance', 'hud-fluoro', 'hud-force']) await expect(page.getByTestId(id)).toContainText('—');
});

for (const reason of ['socket_failed', 'socket_stalled', 'server_unavailable'] as const) {
  test(`fallback (${reason}): the notice says why in words, and the drive starts again in rail mode`, async ({ page }) => {
    await open(page, `case=fixture-y&source=fallback-${reason}`);
    const words = { socket_failed: 'the connection to the physics process failed', socket_stalled: 'the physics process stopped answering', server_unavailable: "the physics process isn't running" }[reason];
    await expect(page.getByTestId('drive-notice')).toHaveText(`The physics wire stopped because ${words}. The drive starts again from the entry in rail mode.`);
    await page.keyboard.down('KeyW');
    const a = await tick(page, 10);
    const b = await tick(page, 20);
    await page.keyboard.up('KeyW');
    expect(b!.s).toBeGreaterThan(a!.s);
    await expect(page.getByTestId('drive-mode')).toHaveText('Front view · rail mode');
    await expect(page.getByTestId('drive-notice')).toContainText(words); // still up during the drive
  });
}

test('ladder and X-ray with a live wire: intermediate dims; fluoro shows the wire; the puff fades over 1.5 s', async ({ page }) => {
  await open(page, 'case=fixture-y&source=rail&difficulty=intermediate');
  await expect(page.locator('.drive-view')).toHaveClass(/drive-dim/);
  await page.keyboard.down('KeyW');
  await tick(page, 30);
  await page.keyboard.up('KeyW');
  await page.getByRole('button', { name: 'X-ray' }).click();
  const wireOpacity = () => page.locator('.drive-view .wire-line').evaluate((el) => getComputedStyle(el).opacity);
  await tick(page, 1);
  expect(await wireOpacity()).toBe('0');
  await page.keyboard.down('Space');
  await tick(page, 2);
  expect(await wireOpacity()).toBe('1');
  await page.keyboard.up('Space');
  await page.keyboard.press('KeyC');
  await expect(page.locator('.drive-view')).toHaveClass(/contrast-fading/);
  const duration = await page.locator('.drive-view .vessel').first().evaluate((el) => getComputedStyle(el).transitionDuration);
  const token = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--duration-contrast-fade').trim());
  expect(token).toBe('1500ms');
  expect(duration).toBe('1.5s');
});
