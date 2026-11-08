/**
 * A6 Results through the test-only app harness (tests/e2e/harness/app.html): the real screens and engine, served by
 * a Vite dev server started here with client/public as its public folder. Saved drives are seeded from Vaibhav's
 * golden scoring logs, and every expected value is read from the golden's committed result, never typed in.
 *
 * The click-through drives fixture-y with Vaibhav's RailWireSource injected where the app passes select.ts,
 * because select.ts is not on main: the plain app build can't drive yet (see the A6 handoff).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import type { CaseResult, EventLog, Weights } from '../../client/src/contracts';

test.describe.configure({ mode: 'serial' });

let vite: ViteDevServer;
let base = '';

test.beforeAll(async () => {
  vite = await createServer({ configFile: false, root: process.cwd(), publicDir: 'client/public', logLevel: 'silent', server: { port: 0, strictPort: false, hmr: false }, appType: 'mpa' });
  await vite.listen();
  const addr = vite.httpServer?.address();
  base = typeof addr === 'object' && addr ? `http://localhost:${addr.port}` : '';
});

test.afterAll(async () => {
  await vite?.close();
});

interface Golden {
  weights: Weights;
  log: EventLog;
  result: CaseResult;
}
const golden = (name: string): Golden => JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'logs', `score-${name}-fixture-y.json`), 'utf8')) as Golden;
const fmt = (v: number, d: number): string => Number(v.toFixed(d)).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const APP = '/tests/e2e/harness/app.html';

/** Seed this tab's saved drive with a golden log, once (a reload keeps what the app wrote), on a fresh progress history. */
async function seed(page: Page, g: Golden): Promise<void> {
  const drive = { plan: { entryId: g.log.entryId, targetId: g.log.targetId, presetId: g.log.presetId, edges: g.log.path, weights: g.weights }, log: g.log };
  await page.addInitScript((d) => {
    if (sessionStorage.getItem('test.seeded')) return;
    sessionStorage.setItem('test.seeded', '1');
    localStorage.removeItem('threadsim.progress.v1');
    sessionStorage.setItem('threadsim.drives.v1', JSON.stringify({ 'fixture-y': d }));
  }, drive);
}

async function openResults(page: Page, g: Golden): Promise<void> {
  await seed(page, g);
  await page.goto(`${base}${APP}?wire=none#/case/fixture-y/results`);
  await expect(page.getByTestId('finding')).toBeVisible();
}

for (const name of ['clean', 'wrong-branch', 'prolapse', 'over-budget'] as const) {
  test(`${name}: Results shows what the golden result says`, async ({ page }) => {
    const g = golden(name);
    const r = g.result;
    await openResults(page, g);
    await expect(page.getByTestId('finding-text')).toHaveText(r.feedback[0]!.text);
    await expect(page.getByTestId('stars')).toHaveAttribute('data-stars', String(r.stars));
    await expect(page.getByTestId('stars')).toHaveText(`${r.stars} of 3 stars`);
    await expect(page.getByTestId('plan-score')).toHaveText(`${fmt(r.plan.score, 0)} of 100`);
    await expect(page.getByTestId('drive-score')).toHaveText(`${fmt(r.drive.score, 0)} of 100`);
    await expect(page.getByTestId('feedback-more').locator('li')).toHaveText(r.feedback.slice(1, 4).map((l) => l.text));
    for (const k of ['fidelity', 'gentleness', 'radiation', 'errors'] as const) await expect(page.getByTestId(`component-${k}`)).toHaveText(fmt(r.drive[k].score, 0));
    await expect(page.locator('[data-component=time]')).toContainText('Not scored');
    await expect(page.locator('.honesty')).toHaveText('Decision trainer with simplified device mechanics. Not a clinical device; no claim of patient benefit.');

    const kinds = await page.getByTestId('timeline-marker').evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')));
    expect(kinds).toEqual([...g.log.events].sort((a, b) => a.t - b.t).map((e) => e.kind));
    if (name === 'wrong-branch' || name === 'prolapse') expect(kinds).toContain('wrong_branch');
    if (name === 'prolapse') expect(kinds).toContain('prolapse');

    if (r.stars < r.starsBeforeBudget) {
      await expect(page.getByTestId('budget')).toContainText(`took star ${r.starsBeforeBudget}`);
      await expect(page.getByTestId('budget')).toContainText(`${fmt(r.fluoroOverBudgetS, 1)} s over`);
    } else {
      await expect(page.getByTestId('budget')).toHaveCount(0);
    }
  });
}

test('the attempt is recorded once: a refresh never records it again', async ({ page }) => {
  await openResults(page, golden('wrong-branch'));
  const count = () => page.evaluate(() => (JSON.parse(localStorage.getItem('threadsim.progress.v1') ?? '[]') as unknown[]).length);
  expect(await count()).toBe(1);
  await page.reload();
  await expect(page.getByTestId('finding')).toBeVisible();
  expect(await count()).toBe(1);
});

test('the timeline is on the keyboard path: each mark shows its label on focus', async ({ page }) => {
  await openResults(page, golden('prolapse'));
  const markers = page.getByTestId('timeline-marker');
  const n = await markers.count();
  await markers.first().focus();
  for (let i = 0; i < n; i++) {
    const m = markers.nth(i);
    await expect(m).toBeFocused();
    const label = await m.getAttribute('aria-label');
    expect(label).toBeTruthy();
    expect(await m.evaluate((el) => getComputedStyle(el, '::after').content)).toContain(label!.slice(0, 20));
    await page.keyboard.press('Tab');
  }
});

test('Next case goes where the Library says, and the Library shows the new stars', async ({ page }) => {
  const g = golden('clean');
  await openResults(page, g);
  const next = await page.getByTestId('results-next').getAttribute('href');
  await page.goto(`${base}${APP}?wire=none#/library`);
  // fixture-y's row (or the next-case card, if it is the next case) shows the recorded stars.
  const fixtureY = page.locator('.case-row, [data-testid=next-case]').filter({ has: page.locator('a[href="#/case/fixture-y"]') });
  await expect(fixtureY).toContainText(`${g.result.stars} of 3 stars`);
  const libraryNext = await page.getByTestId('next-case').getByRole('link', { name: 'Open case' }).getAttribute('href');
  expect(next).toBe(libraryNext);
});

test('no saved drive: Results says so and links to Drive and Plan, never a made-up result', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.removeItem('threadsim.drives.v1'));
  await page.goto(`${base}${APP}?wire=none#/case/fixture-y/results`);
  await expect(page.getByRole('heading', { name: 'No drive to score yet' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Drive', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Plan', exact: true })).toBeVisible();
  await expect(page.getByTestId('stars')).toHaveCount(0);
});

test('click-through (backup demo): Library → Brief → Plan → Compare → Drive → Results on fixture-y, rail wire', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('test.fresh')) return;
    sessionStorage.setItem('test.fresh', '1');
    localStorage.removeItem('threadsim.progress.v1');
  });
  await page.goto(`${base}${APP}?wire=autopilot#/library`);
  await page.locator('a[href="#/case/fixture-y"]').first().click();
  await expect(page).toHaveURL(/#\/case\/fixture-y$/);
  await page.getByRole('link', { name: 'Start planning' }).first().click();
  await expect(page.getByTestId('cost-panel')).toBeVisible();
  for (let i = 0; i < 20; i++) {
    const list = page.getByTestId('next-steps');
    if ((await list.count()) === 0) break;
    await list.getByRole('button').first().press('Enter');
  }
  await page.getByTestId('compare').click();
  await expect(page).toHaveURL(/#\/case\/fixture-y\/compare$/);
  await page.getByTestId('start-drive').click();
  await expect(page.getByTestId('drive-stage')).toBeVisible();
  await expect(page.getByTestId('drive-mode')).toHaveText('Front view · rail mode');
  await page.waitForFunction(() => window.__app.last !== null);
  for (let i = 0; i < 100; i++) {
    const s = await page.evaluate(() => window.__app.tick(30));
    if (s?.atTarget) break;
  }
  await page.getByTestId('finish-drive').click();
  await expect(page).toHaveURL(/#\/case\/fixture-y\/results$/);
  await expect(page.getByTestId('finding-text')).not.toBeEmpty();
  await expect(page.getByTestId('stars')).toContainText('of 3 stars');
  await expect(page.getByTestId('timeline-marker').last()).toHaveAttribute('data-kind', 'target_reached');
  expect(await page.evaluate(() => (JSON.parse(localStorage.getItem('threadsim.progress.v1') ?? '[]') as unknown[]).length)).toBe(1);
});
