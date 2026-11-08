/**
 * A8 guided tutorial on the low-tortuosity case, through the test-only app harness (the rail wire is injected
 * where the app passes select.ts, which is not on main yet). Each step must advance on the real action.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import type { Frontier } from '../../client/src/contracts';

/** Prebundled up front, so a cold dependency cache never reloads a page mid-test when three.js first loads. */
const THREE_DEPS = { include: ['three', 'three/examples/jsm/controls/OrbitControls.js', 'three/examples/jsm/loaders/GLTFLoader.js'] };

test.describe.configure({ mode: 'serial' });

let vite: ViteDevServer;
let base = '';
let route: { entryId: string; presetId: string; edges: string[] };
let steps: typeof import('../../client/src/ui/plan/route-state');
let graph: ReturnType<(typeof import('../../client/src/optimize'))['buildGraph']>;
let title = '';

test.beforeAll(async ({ browser }) => {
  vite = await createServer({ configFile: false, root: process.cwd(), publicDir: 'client/public', logLevel: 'silent', server: { port: 0, strictPort: false, hmr: false }, appType: 'mpa', optimizeDeps: THREE_DEPS });
  await vite.listen();
  const addr = vite.httpServer?.address();
  base = typeof addr === 'object' && addr ? `http://localhost:${addr.port}` : '';
  await warmUp(browser, `${base}/tests/e2e/harness/app.html?wire=autopilot#/case/fixture-y/plan`);
  const engine = (await vite.ssrLoadModule('/client/src/optimize/index.ts')) as typeof import('../../client/src/optimize');
  steps = (await vite.ssrLoadModule('/client/src/ui/plan/route-state.ts')) as typeof steps;
  const { loadCase } = (await vite.ssrLoadModule('/client/src/case/index.ts')) as typeof import('../../client/src/case');
  const dir = join(process.cwd(), 'client', 'public', 'cases', 'low-tort');
  const files = Object.fromEntries(['case.json', 'centerlines.json', 'vessels.glb'].map((n) => [n, new Uint8Array(readFileSync(join(dir, n)))]));
  const r = await loadCase({ kind: 'files', origin: 'bundled', files });
  if (!r.ok) throw new Error('low-tort did not load');
  title = r.case.title;
  graph = engine.buildGraph(r.case);
  const frontier = (await engine.optimize({ caseId: r.case.id, targetId: 'rcca' }, r.case)) as Frontier;
  route = frontier.routes[0]!;
});

/** Load a page once and let it settle: a cold dependency cache optimises (and reloads the page) here, not mid-test. */
async function warmUp(browser: import('@playwright/test').Browser, url: string): Promise<void> {
  const page = await browser.newPage();
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.close();
}

test.afterAll(async () => {
  await vite?.close();
});

const note = (page: Page) => page.getByTestId('tutorial-note');

async function fresh(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('t.fresh')) return;
    sessionStorage.setItem('t.fresh', '1');
    localStorage.clear();
  });
  await page.goto(`${base}/tests/e2e/harness/app.html?wire=autopilot#/library`);
}

test('a first-time trainee completes the tutorial on the low-tortuosity case', async ({ page }) => {
  await fresh(page);
  await expect(note(page)).toHaveAttribute('data-step', 'open-case');
  await expect(note(page)).toContainText(title);
  await expect(page.locator('.modal, [aria-modal=true]:visible')).toHaveCount(0); // no modal, nothing dimmed

  await page.locator('main a[href="#/case/low-tort"]').first().click();
  await expect(note(page)).toHaveAttribute('data-step', 'start-planning');
  await page.locator('main a[href="#/case/low-tort/plan"]').first().click();
  await expect(note(page)).toHaveAttribute('data-step', 'build-route');

  await page.locator('input[name=target][value=rcca]').check();
  await page.locator(`input[name=preset][value=${route.presetId}]`).check();
  let state = { entryId: route.entryId, targetId: 'rcca', presetId: route.presetId as 'soft_angled', edges: [] as string[] };
  for (const [n, edge] of route.edges.entries()) {
    const i = steps.nextSteps(graph, state).findIndex((s) => s.edgeId === edge);
    if (n < route.edges.length - 1) await expect(note(page)).toHaveAttribute('data-step', 'build-route'); // only the full route moves it on
    await page.getByTestId('next-steps').getByRole('button').nth(i).press('Enter');
    state = { ...state, edges: [...state.edges, edge] };
  }
  await expect(note(page)).toHaveAttribute('data-step', 'compare');

  await page.getByTestId('compare').click();
  await expect(note(page)).toHaveAttribute('data-step', 'start-drive');
  await page.getByTestId('start-drive').click();
  await expect(note(page)).toHaveAttribute('data-step', 'drive');

  await page.waitForFunction(() => window.__app.last !== null);
  for (let i = 0; i < 200; i++) {
    const s = await page.evaluate(() => window.__app.tick(30));
    if (s?.atTarget) break;
  }
  await expect(note(page)).toHaveAttribute('data-step', 'finish');
  await page.getByTestId('finish-drive').click();
  await expect(page).toHaveURL(/#\/case\/low-tort\/results$/);
  await expect(note(page)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('threadsim.tutorial.v1'))).toBe('done');
});

test('skipping is remembered per browser, and the Case brief reopens it', async ({ page }) => {
  await fresh(page);
  await note(page).getByRole('button', { name: 'Skip tutorial' }).click();
  await expect(note(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
  await expect(note(page)).toHaveCount(0);

  await page.locator('main a[href="#/case/low-tort"]').first().click();
  await page.getByTestId('tutorial-reopen').click();
  await expect(note(page)).toHaveAttribute('data-step', 'start-planning');
  await page.goto(`${base}/tests/e2e/harness/app.html?wire=autopilot#/case/type-iii`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByTestId('tutorial-reopen')).toHaveCount(0);
});
