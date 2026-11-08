/**
 * The same-patient body context in the anatomy layer (team/requests/to-aroovee-from-vaibhav-body-context-layer.md),
 * on the production build. ts-s1404-cta is given a stand-in
 * (tests/e2e/fixtures/context-ts-s1404-cta.glb: nodes "bone" and "heart", RAS mm) by intercepting its request. Every
 * other case gets whatever the server answers for a missing file.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const WITH = 'ts-s1404-cta';
const FIXTURE = readFileSync(join(process.cwd(), 'tests', 'e2e', 'fixtures', `context-${WITH}.glb`));

async function serveContext(page: Page): Promise<void> {
  await page.route(`**/cases/${WITH}/context.glb`, (route) => route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: FIXTURE }));
}

/** Errors the page itself logs, not the browser's own line for a missing file. */
function pageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function openPlan(page: Page, id: string): Promise<void> {
  await page.goto(`/#/case/${id}/plan`);
  await expect(page.locator('.plan-view')).toHaveAttribute('data-scene', 'ready', { timeout: SCENE_MS });
  await expect(page.locator('.plan-view')).toHaveAttribute('data-anatomy-model', /.+/);
}

/** The real CT cases are large; under a full parallel run their first load can take well past the default 5 s. */
const SCENE_MS = 30_000;

const panel = (page: Page) => page.getByRole('group', { name: 'Anatomy layer' });

test('a case with context.glb gets a Body toggle, off by default, and never the placeholder', async ({ page }) => {
  await serveContext(page);
  const placeholderRequests: string[] = [];
  page.on('request', (r) => {
    if (/placeholder-vascular/.test(r.url())) placeholderRequests.push(r.url());
  });
  const errors = pageErrors(page);
  await openPlan(page, WITH);
  const view = page.locator('.plan-view');
  await expect(view).toHaveAttribute('data-anatomy-model', 'context');
  await page.getByRole('button', { name: 'Anatomy' }).click();
  const body = panel(page).getByLabel('Body');
  await expect(body).toBeVisible();
  await expect(body).not.toBeChecked();
  for (const name of ['Show anatomy', 'Arteries', 'Veins', 'Labels']) await expect(panel(page).getByLabel(name)).toBeHidden();
  await expect(panel(page)).toContainText('for scale and orientation only');
  await expect(panel(page)).not.toContainText(/accurate|clinical|diagnos/i);
  await expect(view).not.toHaveAttribute('data-anatomy', /.+/); // nothing loaded while it's off
  expect(placeholderRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('turning Body on shows the "bone" and "heart" nodes; off hides them; the choice is remembered', async ({ page }) => {
  await serveContext(page);
  await openPlan(page, WITH);
  const view = page.locator('.plan-view');
  await page.getByRole('button', { name: 'Anatomy' }).click();
  await panel(page).getByLabel('Body').check();
  await expect(view).toHaveAttribute('data-anatomy', 'ready');
  await expect(view).toHaveAttribute('data-anatomy-context', 'bone,heart');
  await expect(view).toHaveAttribute('data-anatomy-body', 'true');
  await expect(page.locator('.anatomy-label')).toHaveCount(0); // background: no labels
  await panel(page).getByLabel('Body').uncheck();
  await expect(view).toHaveAttribute('data-anatomy-body', 'false');
  await panel(page).getByLabel('Body').check();
  await page.reload();
  await expect(page.locator('.plan-view')).toHaveAttribute('data-anatomy-body', 'true');
});

// Since #68 every real CT case has its context.glb; low-tort and type-iii are generated and have none.
for (const id of ['low-tort', 'type-iii']) {
  test(`${id}, with no context.glb: no Body toggle, the layer exactly as before, and nothing logged`, async ({ page }) => {
    const errors = pageErrors(page);
    await openPlan(page, id);
    const view = page.locator('.plan-view');
    await expect(view).toHaveAttribute('data-anatomy-model', 'placeholder');
    await page.getByRole('button', { name: 'Anatomy' }).click();
    await expect(panel(page).getByLabel('Body')).toHaveCount(0);
    for (const name of ['Show anatomy', 'Arteries', 'Veins', 'Labels']) await expect(panel(page).getByLabel(name)).toBeVisible();
    await expect(panel(page)).toContainText('Placeholder model');
    expect(errors).toEqual([]);
  });
}

for (const id of ['ts-s1404-cta', 'ts-s1336-cta', 'ts-s0727-cta']) {
  test(`${id}: its own context.glb (David's export, no fixture) gives the Body toggle`, async ({ page }) => {
    const errors = pageErrors(page);
    await openPlan(page, id);
    await expect(page.locator('.plan-view')).toHaveAttribute('data-anatomy-model', 'context');
    await page.getByRole('button', { name: 'Anatomy' }).click();
    await expect(panel(page).getByLabel('Body')).toBeVisible();
    await panel(page).getByLabel('Body').check();
    await expect(page.locator('.plan-view')).toHaveAttribute('data-anatomy-context', /bone|heart/);
    expect(errors).toEqual([]);
  });
}

test('with Body on, a click on a branch handle still picks the handle', async ({ page }) => {
  await serveContext(page);
  await page.addInitScript(() => localStorage.setItem('threadsim.anatomy.v1', JSON.stringify({ visible: false, arteries: true, veins: true, labels: true, body: true, opacity: 0.35 })));
  await openPlan(page, WITH);
  const view = page.locator('.plan-view');
  await expect(view).toHaveAttribute('data-anatomy-body', 'true');
  await expect(view).toHaveAttribute('data-handles', /node/);
  const before = await page.getByTestId('next-steps').innerText();
  const [h] = JSON.parse((await view.getAttribute('data-handles'))!) as { node: string; x: number; y: number }[];
  const box = (await view.locator('canvas').boundingBox())!;
  await page.mouse.click(box.x + h!.x, box.y + h!.y);
  await expect(page.getByTestId('cost-table').locator('[data-measure=lengthM] dd')).not.toContainText('—'); // the route grew
  await expect.poll(() => page.getByTestId('next-steps').innerText().catch(() => '')).not.toBe(before);
});

test('Drive hides the body context in the X-ray look without changing the setting', async ({ page }) => {
  await serveContext(page);
  const dir = join(process.cwd(), 'client', 'public', 'cases', WITH);
  const c = JSON.parse(readFileSync(join(dir, 'case.json'), 'utf8')) as { entries: { id: string; node: string }[]; targets: { id: string; node: string }[]; difficulty?: string };
  const cl = JSON.parse(readFileSync(join(dir, 'centerlines.json'), 'utf8')) as { edges: { id: string; from: string; to: string }[] };
  const prev = new Map<string, { node: string; edge: string }>();
  const start = c.entries[0]!.node;
  const queue = [start];
  const seen = new Set([start]);
  while (queue.length) {
    const at = queue.shift()!;
    for (const e of cl.edges) {
      const next = e.from === at ? e.to : e.to === at ? e.from : null;
      if (!next || seen.has(next)) continue;
      seen.add(next);
      prev.set(next, { node: at, edge: e.id });
      queue.push(next);
    }
  }
  const edges: string[] = [];
  for (let n = c.targets[0]!.node; n !== start; n = prev.get(n)!.node) edges.unshift(prev.get(n)!.edge);
  const plan = { entryId: c.entries[0]!.id, targetId: c.targets[0]!.id, presetId: 'soft_angled', edges };
  await page.addInitScript((p) => {
    sessionStorage.setItem('threadsim.plans.v1', JSON.stringify({ 'ts-s1404-cta': p }));
    localStorage.setItem('threadsim.anatomy.v1', JSON.stringify({ visible: false, arteries: true, veins: true, labels: true, body: true, opacity: 0.35 }));
  }, plan);
  await page.goto(`/#/case/${WITH}/drive`);
  const view = page.locator('.drive-view');
  await expect(view).toHaveAttribute('data-scene', 'ready', { timeout: SCENE_MS });
  if (c.difficulty === 'expert') {
    await expect(view).toHaveAttribute('data-anatomy-suppressed', 'true'); // X-ray only: always hidden
  } else {
    await expect(view).toHaveAttribute('data-anatomy-body', 'true');
    await page.getByRole('button', { name: 'X-ray' }).click();
    await expect(view).toHaveAttribute('data-anatomy-body', 'false');
    await page.getByRole('button', { name: 'Front view' }).click();
    await expect(view).toHaveAttribute('data-anatomy-body', 'true');
  }
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('threadsim.anatomy.v1')!).body)).toBe(true);
});
