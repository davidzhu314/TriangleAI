/**
 * A8: team/DEMO.md, beat by beat, in rail mode, as the presenter would click it. One page is shared across the
 * beats; every expected value comes from the engine in this process (routeFor, optimize, the Compare model,
 * scoreAttempt), never a literal.
 *
 * Wire: client/src/wire/select.ts is not on main yet, so the plain app can't drive. While it is missing, the beats
 * run in the test-only app harness (tests/e2e/harness/app.html), which injects RailWireSource where the app passes
 * select.ts. Once select.ts exists the spec switches by itself to the production build that playwright.config.ts
 * serves (vite build + preview), and the presenter drives with the keys. S5's "against the production build" is
 * unmet until then (A8 handoff).
 *
 * A8_VIDEO=1 records the run at 1440 × 900 (the backup demo video) into test-results/.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import type { EventLog, Frontier, LoadedCase, Weights } from '../../client/src/contracts';
import { writeZip } from '../../tools/lib/zip';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const PRODUCTION = existsSync(join(process.cwd(), 'client', 'src', 'wire', 'select.ts'));
const NEVER_SAY = ['realistic catheter simulation', 'safer for patients', 'clinically validated', 'optimal route'];

let vite: ViteDevServer;
let devBase = '';
let context: BrowserContext;
let page: Page;
let engine: typeof import('../../client/src/optimize');
let score: typeof import('../../client/src/score');
let model: typeof import('../../client/src/ui/compare/model');
let rowsMod: typeof import('../../client/src/ui/plan/cost-rows');
let warn: typeof import('../../client/src/ui/plan/warnings');
let steps: typeof import('../../client/src/ui/plan/route-state');
const cases = new Map<string, LoadedCase>();

/** The app's address: the production preview once select.ts exists, else the harness on the dev server. */
const app = (hash: string): string => (PRODUCTION ? `/${hash}` : `${devBase}/tests/e2e/harness/app.html?wire=autopilot${hash}`);

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  vite = await createServer({ configFile: false, root: process.cwd(), publicDir: 'client/public', logLevel: 'silent', server: { port: 0, strictPort: false, hmr: false }, appType: 'mpa' });
  await vite.listen();
  const addr = vite.httpServer?.address();
  devBase = typeof addr === 'object' && addr ? `http://localhost:${addr.port}` : '';
  const load = <T>(p: string) => vite.ssrLoadModule(p) as Promise<T>;
  engine = await load('/client/src/optimize/index.ts');
  score = await load('/client/src/score/index.ts');
  model = await load('/client/src/ui/compare/model.ts');
  rowsMod = await load('/client/src/ui/plan/cost-rows.ts');
  warn = await load('/client/src/ui/plan/warnings.ts');
  steps = await load('/client/src/ui/plan/route-state.ts');
  const { loadCase } = await load<typeof import('../../client/src/case')>('/client/src/case/index.ts');
  for (const id of ['type-iii', 'fixture-y', 'low-tort']) {
    const r = await loadCase({ kind: 'files', origin: 'bundled', files: caseFiles(id) });
    if (!r.ok) throw new Error(`${id} did not load`);
    cases.set(id, r.case);
  }
  const video = process.env.A8_VIDEO ? { recordVideo: { dir: 'test-results/a8-video', size: { width: 1440, height: 900 } } } : {};
  context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', ...(PRODUCTION ? { baseURL: 'http://localhost:4173' } : {}), ...video });
  await context.addInitScript(() => {
    if (sessionStorage.getItem('a8.fresh')) return;
    sessionStorage.setItem('a8.fresh', '1');
    localStorage.clear(); // a first-time trainee: no progress, no tutorial dismissal
    localStorage.setItem('threadsim.tutorial.v1', 'dismissed'); // the demo presenter skips the guided tutorial
  });
  page = await context.newPage();
});

test.afterAll(async () => {
  await context?.close();
  await vite?.close();
});

// Video pacing: with A8_VIDEO set, each beat is held to its DEMO.md slot (a little under, so the run stays under
// 3 minutes). Without it the beats run at test speed.
const SLOT_S: Record<string, number> = { '0:00': 18, '0:20': 38, '1:00': 38, '1:40': 38, '2:20': 23, '2:45': 13 };
let beatStart = 0;
test.beforeEach(() => {
  beatStart = Date.now();
});
test.afterEach(async ({}, info) => {
  const slot = SLOT_S[info.title.slice(0, 4)];
  if (process.env.A8_VIDEO && slot) await page.waitForTimeout(Math.max(0, slot * 1000 - (Date.now() - beatStart)));
});

function caseFiles(id: string): Record<string, Uint8Array> {
  const dir = join(process.cwd(), 'client', 'public', 'cases', id);
  return Object.fromEntries(['case.json', 'centerlines.json', 'vessels.glb'].map((n) => [n, new Uint8Array(readFileSync(join(dir, n)))]));
}

async function neverSay(): Promise<void> {
  const text = (await page.locator('body').innerText()).toLowerCase();
  for (const phrase of NEVER_SAY) expect(text, `"${phrase}" on screen`).not.toContain(phrase);
}

/** Plan a route: entry, target and preset, then the keyboard path along `edges`, as the presenter would. */
async function planRoute(c: LoadedCase, entryId: string, targetId: string, presetId: string, edges: readonly string[]): Promise<void> {
  await expect(page.getByTestId('cost-panel')).toBeVisible();
  if (c.entries.length > 1) await page.locator(`input[name=entry][value=${entryId}]`).check();
  await page.locator(`input[name=target][value=${targetId}]`).check();
  await page.locator(`input[name=preset][value=${presetId}]`).check();
  const graph = engine.buildGraph(c);
  let state = { entryId, targetId, presetId: presetId as 'soft_angled', edges: [] as string[] };
  for (const edge of edges) {
    const options = steps.nextSteps(graph, state);
    const i = options.findIndex((s) => s.edgeId === edge);
    expect(i, `the keyboard path offers ${edge}`).toBeGreaterThanOrEqual(0);
    await page.getByTestId('next-steps').getByRole('button').nth(i).press('Enter');
    state = { ...state, edges: [...state.edges, edge] };
  }
}

/** Let two frames pass so held keys reach the wire, then advance the harness's manual clock. */
async function tick(n: number) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return page.evaluate((k) => window.__app.tick(k), n);
}

async function driveToTarget(): Promise<void> {
  if (PRODUCTION) {
    await page.keyboard.down('KeyW');
    await expect(page.getByTestId('drive-banner')).toContainText('The wire reached the', { timeout: 90_000 });
    await page.keyboard.up('KeyW');
    return;
  }
  await page.waitForFunction(() => window.__app.last !== null);
  for (let i = 0; i < 200; i++) {
    const s = await tick(15);
    if (s?.atTarget) break;
    await page.waitForTimeout(40); // let the view draw, so the run reads as a drive in the video
  }
  await expect(page.getByTestId('drive-banner')).toContainText('The wire reached the');
}

/** Results must equal scoreAttempt on the drive the app saved, with the same case and the plan's weights. */
async function expectResults(c: LoadedCase, key: string): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`#/case/${key}/results$`));
  const saved = (await page.evaluate((k) => JSON.parse(sessionStorage.getItem('threadsim.drives.v1') ?? '{}')[k], key)) as { plan: { targetId: string; weights: Weights }; log: EventLog };
  const optimized = await engine.optimize({ caseId: c.id, targetId: saved.plan.targetId }, c);
  const result = await score.scoreAttempt({ log: saved.log, optimized, weights: saved.plan.weights, case: c });
  const fmt = (v: number) => Number(v.toFixed(0)).toLocaleString('en-US');
  await expect(page.getByTestId('finding-text')).toHaveText(result.feedback[0]!.text);
  await expect(page.getByTestId('stars')).toHaveText(`${result.stars} of 3 stars`);
  await expect(page.getByTestId('plan-score')).toHaveText(`${fmt(result.plan.score)} of 100`);
  await expect(page.getByTestId('drive-score')).toHaveText(`${fmt(result.drive.score)} of 100`);
  const kinds = await page.getByTestId('timeline-marker').evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')));
  expect(kinds).toEqual(score.replayTimeline({ log: saved.log, optimized, weights: saved.plan.weights, case: c }).markers.map((m) => m.kind));
  expect(kinds).toContain('target_reached');
  expect(kinds).not.toContain('wrong_branch');
}

// ---------------------------------------------------------------- the six beats, Type III

test('0:00 Problem: the Library opens with its cases and the honesty line', async () => {
  await page.goto(app('#/library'));
  await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
  await expect(page.locator('a[href="#/case/type-iii"]').first()).toBeVisible();
  await expect(page.locator('.honesty')).toHaveText('Decision trainer with simplified device mechanics. Not a clinical device; no claim of patient benefit.');
  await neverSay();
});

test('0:20 Plan: open Type III, build a route, live costs, and the engine flags the sharp turn', async () => {
  const c = cases.get('type-iii')!;
  await page.locator('a[href="#/case/type-iii"]').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(c.title);
  await page.getByRole('link', { name: 'Start planning' }).first().click();
  const flagged = (await engine.optimize({ caseId: c.id, targetId: 'rcca' }, c)) as Frontier;
  const sharp = flagged.candidates.find((r) => r.entryId === 'fem_r' && r.presetId === 'soft_angled')!;
  await planRoute(c, sharp.entryId, 'rcca', sharp.presetId, sharp.edges);
  const route = engine.routeFor(engine.buildGraph(c), sharp.entryId, 'rcca', sharp.presetId, sharp.edges);
  const preset = engine.WIRE_PRESETS.find((p) => p.id === sharp.presetId)!;
  const first = warn.warningsFor(c, route, preset)[0]!;
  expect(route.violations.some((v) => v.kind === 'turn_too_sharp')).toBe(true);
  await expect(page.getByTestId('first-warning')).toHaveText(first.text);
  const length = rowsMod.formatCost(rowsMod.COST_ROWS[0]!, route.cost);
  await expect(page.getByTestId('cost-table').locator(`[data-measure=${rowsMod.COST_ROWS[0]!.key}] dd`)).toContainText(`${length.value}`);
  await neverSay();
});

test('1:00 Compare: the frontier shows its routes, and moving the safety slider changes the ranking', async () => {
  const c = cases.get('type-iii')!;
  await page.getByTestId('compare').click();
  await expect(page).toHaveURL(/#\/case\/type-iii\/compare$/);
  const frontier = (await engine.optimize({ caseId: c.id, targetId: 'rcca' }, c)) as Frontier;
  const groups = model.groupRoutes(c, frontier);
  const measures = model.visibleMeasures(frontier, null);
  const rank = engine.createRanker(frontier);
  const order = (w: Weights) => [...model.groupRanks(groups, rank(w)).entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
  const rows = () => page.getByTestId('routes-table').locator('tbody tr[tabindex]').evaluateAll((els) => els.map((e) => e.getAttribute('data-route')));
  expect(groups.length).toBeGreaterThanOrEqual(3); // DEMO.md: "three routes" holds on this seed
  await expect(page.getByTestId('routes-table').locator('tbody tr[tabindex]')).toHaveCount(groups.length);
  const before = order(model.startingWeights(measures));
  expect(await rows()).toEqual(before);

  const safety = page.locator('input[data-measure=proximityPenalty]');
  await safety.focus();
  await page.keyboard.press('End');
  const after = order({ ...model.startingWeights(measures), proximityPenalty: Number(await safety.inputValue()) });
  expect(after).not.toEqual(before);
  await expect.poll(rows).toEqual(after);

  // Switch to the route now ranked first, and drive it.
  await page.locator(`tr[data-route="${after[0]}"]`).click();
  await page.getByTestId('switch').first().click();
  await expect(page.getByRole('status')).toContainText('Switched to');
  await neverSay();
});

test('1:40 Drive: rail on Type III, X-ray, fluoro, a contrast puff, and the target reached', async () => {
  const c = cases.get('type-iii')!;
  await page.getByTestId('start-drive').click();
  await expect(page.getByTestId('drive-stage')).toBeVisible();
  // Type III is an expert case: the ladder makes it X-ray only (spec §5.5), so the view is X-ray from the start.
  expect(c.difficulty).toBe('expert');
  await expect(page.getByTestId('drive-mode')).toHaveText(/^X-ray · rail mode$/);
  await page.keyboard.down('Space'); // hold fluoro
  if (!PRODUCTION) await tick(10);
  await expect(page.locator('.drive-view')).toHaveClass(/fluoro-on/);
  await page.keyboard.press('KeyC');
  await expect(page.locator('.drive-view')).toHaveClass(/contrast-fading/);
  await driveToTarget();
  await page.keyboard.up('Space');
  await neverSay();
});

test('2:20 Results: the score, the line that matters and the replay all come from the live event log', async () => {
  await page.getByTestId('finish-drive').click();
  await expectResults(cases.get('type-iii')!, 'type-iii');
  await expect(page.getByTestId('replay-driven')).toBeVisible();
  await neverSay();
});

test('2:45 Scale: a generated case.zip imports, validates and joins the Library', async () => {
  const c = cases.get('low-tort')!;
  await page.goto(app('#/library'));
  const zip = writeZip(Object.entries(caseFiles('low-tort')));
  await page.getByTestId('import-input').setInputFiles({ name: 'low-tort-case.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) });
  await expect(page.getByRole('status').first()).toContainText(`Loaded “${c.title}”`);
  await expect(page.getByText('Imported this session')).toBeVisible();
  await neverSay();
});

// ---------------------------------------------------------------- the same path on fixture-y

test('fixture-y: Plan → Compare → Drive → Results', async () => {
  test.skip(!!process.env.A8_VIDEO, 'the backup video records the six Type III beats only');
  const c = cases.get('fixture-y')!;
  await page.goto(app('#/case/fixture-y/plan'));
  const frontier = (await engine.optimize({ caseId: c.id, targetId: 'left_branch' }, c)) as Frontier;
  const best = frontier.routes[0]!;
  await planRoute(c, best.entryId, 'left_branch', best.presetId, best.edges);
  await page.getByTestId('compare').click();
  await page.getByTestId('start-drive').click();
  await expect(page.getByTestId('drive-mode')).toHaveText(/rail mode$/);
  await driveToTarget();
  await page.getByTestId('finish-drive').click();
  await expectResults(c, 'fixture-y');
  await neverSay();
});
