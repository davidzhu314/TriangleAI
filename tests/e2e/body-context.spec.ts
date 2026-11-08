/**
 * The same-patient body context in the anatomy layer (team/requests/to-aroovee-from-vaibhav-body-context-layer.md),
 * on the production build. ts-s1404-cta is given a stand-in
 * (tests/e2e/fixtures/context-ts-s1404-cta.glb: nodes "bone" and "heart", RAS mm) by intercepting its request. Every
 * other case gets whatever the server answers for a missing file.
 *
 * The scan's veins: ts-s1336-cta is given tests/e2e/fixtures/context-veins.glb (bone, heart and two vein nodes tagged
 * extras { kind: "vein", label }, as David's export tags them; make-context-fixture.mjs --veins).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { glbNodeKinds } from '../../client/src/render/anatomy-model';

const WITH = 'ts-s1404-cta';
const FIXTURE = readFileSync(join(process.cwd(), 'tests', 'e2e', 'fixtures', `context-${WITH}.glb`));

async function serveContext(page: Page): Promise<void> {
  await page.route(`**/cases/${WITH}/context.glb`, (route) => route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: FIXTURE }));
}

const WITH_VEINS = 'ts-s1336-cta';
const VEINS_FIXTURE = readFileSync(join(process.cwd(), 'tests', 'e2e', 'fixtures', 'context-veins.glb'));

async function serveVeins(page: Page): Promise<void> {
  await page.route(`**/cases/${WITH_VEINS}/context.glb`, (route) => route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: VEINS_FIXTURE }));
}

/** The vein nodes in a GLB on disk, read the way the app reads them. */
function veinsIn(file: string): string[] {
  const b = readFileSync(file);
  return glbNodeKinds(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
    .filter((n) => n.kind === 'vein')
    .map((n) => n.name);
}

/** A plan for a bundled case: its first entry to its first target, along the centreline graph. */
function planFor(id: string): { plan: { entryId: string; targetId: string; presetId: string; edges: string[] }; difficulty: string | undefined } {
  const dir = join(process.cwd(), 'client', 'public', 'cases', id);
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
  return { plan: { entryId: c.entries[0]!.id, targetId: c.targets[0]!.id, presetId: 'soft_angled', edges }, difficulty: c.difficulty };
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
  for (const name of ['Show anatomy', 'Arteries', 'Labels']) await expect(panel(page).getByLabel(name)).toBeHidden();
  await expect(page.getByTestId('anatomy-generic-veins')).toBeHidden();
  await expect(view).toHaveAttribute('data-anatomy-has-veins', 'false'); // bone and heart only: no Veins row
  await expect(page.getByTestId('anatomy-body-veins')).toBeHidden();
  await expect(panel(page)).toContainText("Bone and heart from this case's scan, for scale and orientation only.");
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
  await expect(page.locator('.plan-view')).toHaveAttribute('data-anatomy-body', 'true', { timeout: SCENE_MS });
});

// Since #68 every real CT case has its context.glb; low-tort and type-iii are generated and have none. They get the
// shipped reference body (client/public/anatomy/vascular.glb), aligned to the case.
for (const id of ['low-tort', 'type-iii']) {
  test(`${id}, with no context.glb: no Body toggle, the aligned reference body, and nothing logged`, async ({ page }) => {
    const errors = pageErrors(page);
    await openPlan(page, id);
    const view = page.locator('.plan-view');
    await expect(view).toHaveAttribute('data-anatomy-model', 'model');
    await page.getByRole('button', { name: 'Anatomy' }).click();
    await expect(panel(page).getByLabel('Body')).toHaveCount(0);
    for (const name of ['Show anatomy', 'Arteries', 'Veins', 'Labels']) await expect(panel(page).getByLabel(name)).toBeVisible();
    await expect(panel(page)).toContainText("Reference body (BodyParts3D), aligned to this case. Not this patient's anatomy.");
    await panel(page).getByLabel('Show anatomy').check();
    await expect(view).toHaveAttribute('data-anatomy', 'ready');
    expect(errors).toEqual([]);
  });
}

test('without the reference body file, a generated case keeps the placeholder (fail-soft)', async ({ page }) => {
  await page.route('**/anatomy/vascular.glb', (route) => route.fulfill({ status: 404, body: 'not here' }));
  await openPlan(page, 'type-iii');
  await expect(page.locator('.plan-view')).toHaveAttribute('data-anatomy-model', 'placeholder');
  await page.getByRole('button', { name: 'Anatomy' }).click();
  await expect(panel(page)).toContainText('Placeholder model');
});

test('a case with no alignment shows no reference body, and says why', async ({ page }) => {
  await openPlan(page, 'fixture-y');
  await page.getByRole('button', { name: 'Anatomy' }).click();
  await expect(panel(page)).toContainText('No alignment for this case');
});

for (const id of ['ts-s1404-cta', 'ts-s1336-cta', 'ts-s0727-cta']) {
  test(`${id}: its own context.glb (David's export, no fixture) gives the Body toggle`, async ({ page }) => {
    const errors = pageErrors(page);
    await openPlan(page, id);
    await expect(page.locator('.plan-view')).toHaveAttribute('data-anatomy-model', 'context');
    await page.getByRole('button', { name: 'Anatomy' }).click();
    await expect(panel(page).getByLabel('Body')).toBeVisible();
    await panel(page).getByLabel('Body').check();
    await expect(page.locator('.plan-view')).toHaveAttribute('data-anatomy-context', /bone|heart/);
    // Veins appears exactly when David's export has vein nodes in it.
    const veins = veinsIn(join(process.cwd(), 'client', 'public', 'cases', id, 'context.glb'));
    await expect(page.locator('.plan-view')).toHaveAttribute('data-anatomy-has-veins', String(veins.length > 0));
    if (veins.length > 0) {
      await expect(page.getByTestId('anatomy-body-veins')).not.toBeChecked();
      await page.getByTestId('anatomy-body-veins').check();
      await expect(page.locator('.plan-view')).toHaveAttribute('data-anatomy-veins', 'true');
    } else await expect(page.getByTestId('anatomy-body-veins')).toBeHidden();
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
  const { plan, difficulty } = planFor(WITH);
  await page.addInitScript((p) => {
    sessionStorage.setItem('threadsim.plans.v1', JSON.stringify({ 'ts-s1404-cta': p }));
    localStorage.setItem('threadsim.anatomy.v1', JSON.stringify({ visible: false, arteries: true, veins: true, labels: true, body: true, opacity: 0.35 }));
  }, plan);
  await page.goto(`/#/case/${WITH}/drive`);
  const view = page.locator('.drive-view');
  await expect(view).toHaveAttribute('data-scene', 'ready', { timeout: SCENE_MS });
  if (difficulty === 'expert') {
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

// ---------------------------------------------------------------- the scan's veins

test('Veins appears when context.glb has vein nodes, off by default, with the honest note', async ({ page }) => {
  await serveVeins(page);
  const errors = pageErrors(page);
  await openPlan(page, WITH_VEINS);
  const view = page.locator('.plan-view');
  await expect(view).toHaveAttribute('data-anatomy-has-veins', 'true');
  await page.getByRole('button', { name: 'Anatomy' }).click();
  const veins = page.getByTestId('anatomy-body-veins');
  await expect(veins).toBeVisible();
  await expect(veins).not.toBeChecked();
  await expect(panel(page).getByLabel('Body')).toBeVisible();
  await expect(panel(page).getByLabel('Body')).not.toBeChecked();
  for (const name of ['Show anatomy', 'Arteries', 'Labels']) await expect(panel(page).getByLabel(name)).toBeHidden();
  await expect(page.getByTestId('anatomy-generic-veins')).toBeHidden();
  await expect(panel(page)).toContainText("Bone, heart and veins from this case's scan, for scale and orientation only.");
  await expect(panel(page)).not.toContainText(/accurate|clinical|diagnos/i);
  await expect(view).not.toHaveAttribute('data-anatomy', /.+/); // nothing loaded while both are off
  expect(errors).toEqual([]);
});

test('Veins on shows only the vein nodes, unlabelled; with Body too, all four; the choice is remembered', async ({ page }) => {
  await serveVeins(page);
  await openPlan(page, WITH_VEINS);
  const view = page.locator('.plan-view');
  await page.getByRole('button', { name: 'Anatomy' }).click();
  await page.getByTestId('anatomy-body-veins').check();
  await expect(view).toHaveAttribute('data-anatomy', 'ready');
  await expect(view).toHaveAttribute('data-anatomy-showing', 'vein_ivc,vein_svc');
  await expect(view).toHaveAttribute('data-anatomy-veins', 'true');
  await expect(view).toHaveAttribute('data-anatomy-body', 'false');
  await expect(page.locator('.anatomy-label')).toHaveCount(0); // no Labels switch on a context case: no labels
  await panel(page).getByLabel('Body').check();
  await expect(view).toHaveAttribute('data-anatomy-showing', 'bone,heart,vein_ivc,vein_svc');
  await panel(page).getByLabel('Body').uncheck();
  await page.getByTestId('anatomy-body-veins').uncheck();
  await expect(view).toHaveAttribute('data-anatomy-showing', '');
  await page.getByTestId('anatomy-body-veins').check();
  await page.reload();
  await expect(page.locator('.plan-view')).toHaveAttribute('data-anatomy-showing', 'vein_ivc,vein_svc', { timeout: SCENE_MS });
});

test('with Veins on, a click on a branch handle still picks the handle', async ({ page }) => {
  await serveVeins(page);
  await page.addInitScript(() => localStorage.setItem('threadsim.anatomy.v1', JSON.stringify({ visible: false, arteries: true, veins: true, labels: true, body: true, bodyVeins: true, opacity: 0.35 })));
  await openPlan(page, WITH_VEINS);
  const view = page.locator('.plan-view');
  await expect(view).toHaveAttribute('data-anatomy-showing', 'bone,heart,vein_ivc,vein_svc');
  await expect(view).toHaveAttribute('data-handles', /node/);
  const before = await page.getByTestId('next-steps').innerText();
  const [h] = JSON.parse((await view.getAttribute('data-handles'))!) as { node: string; x: number; y: number }[];
  const box = (await view.locator('canvas').boundingBox())!;
  await page.mouse.click(box.x + h!.x, box.y + h!.y);
  await expect(page.getByTestId('cost-table').locator('[data-measure=lengthM] dd')).not.toContainText('—'); // the route grew
  await expect.poll(() => page.getByTestId('next-steps').innerText().catch(() => '')).not.toBe(before);
});

test("Drive's X-ray hides the veins without changing the setting", async ({ page }) => {
  await serveVeins(page);
  const { plan, difficulty } = planFor(WITH_VEINS);
  await page.addInitScript(
    ([id, p]) => {
      sessionStorage.setItem('threadsim.plans.v1', JSON.stringify({ [id as string]: p }));
      localStorage.setItem('threadsim.anatomy.v1', JSON.stringify({ visible: false, arteries: true, veins: true, labels: true, body: false, bodyVeins: true, opacity: 0.35 }));
    },
    [WITH_VEINS, plan] as const,
  );
  await page.goto(`/#/case/${WITH_VEINS}/drive`);
  const view = page.locator('.drive-view');
  await expect(view).toHaveAttribute('data-scene', 'ready', { timeout: SCENE_MS });
  if (difficulty === 'expert') {
    await expect(view).toHaveAttribute('data-anatomy-suppressed', 'true');
  } else {
    await expect(view).toHaveAttribute('data-anatomy-veins', 'true');
    await page.getByRole('button', { name: 'X-ray' }).click();
    await expect(view).toHaveAttribute('data-anatomy-veins', 'false');
    await expect(view).toHaveAttribute('data-anatomy-showing', '');
    await page.getByRole('button', { name: 'Front view' }).click();
    await expect(view).toHaveAttribute('data-anatomy-veins', 'true');
  }
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('threadsim.anatomy.v1')!).bodyVeins)).toBe(true);
});
