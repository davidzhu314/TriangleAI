/**
 * The Library as a grid of case cards (2026-11-08): filters by difficulty and arch type, "Add a case" with a name
 * and a synopsis, "Left off at …" from this session's saved plan, and "Download case (.zip)" from the card's menu.
 * On the production build.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { writeZip } from '../../tools/lib/zip';

const caseDir = (id: string): string => join(process.cwd(), 'client', 'public', 'cases', id);
const caseJson = (id: string): { title: string; difficulty?: string; anatomy?: { arch_type?: string; bovine?: boolean } } =>
  JSON.parse(readFileSync(join(caseDir(id), 'case.json'), 'utf8'));
const ids = (JSON.parse(readFileSync(join(process.cwd(), 'client', 'public', 'cases', 'index.json'), 'utf8')) as { cases: { id: string }[] }).cases.map((c) => c.id);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('threadsim.tutorial.v1', 'dismissed'));
});

test('every bundled case is a card whose title enters the case, with its synopsis', async ({ page }) => {
  await page.goto('/#/library');
  await expect(page.locator('.case-card')).toHaveCount(ids.length);
  const c = caseJson('type-iii');
  const card = page.locator('.case-card').filter({ has: page.locator('a[href="#/case/type-iii"]') });
  await expect(card.getByRole('heading', { name: c.title })).toBeVisible();
  await expect(card.locator('.case-card-synopsis')).not.toBeEmpty();
  await expect(card.locator('.case-card-picture svg')).toBeVisible(); // the case's own vessels
  await card.getByRole('link', { name: c.title }).click();
  await expect(page).toHaveURL(/#\/case\/type-iii$/);
});

test('filters: difficulty and arch type narrow the grid to the cases that really have them', async ({ page }) => {
  await page.goto('/#/library');
  const expert = ids.filter((id) => caseJson(id).difficulty === 'expert');
  await page.getByRole('group', { name: 'Difficulty' }).getByRole('button', { name: 'Expert' }).click();
  await expect(page.locator('.case-card')).toHaveCount(expert.length);
  for (const id of expert) await expect(page.locator(`.case-card a[href="#/case/${id}"]`)).toBeVisible();

  await page.getByRole('group', { name: 'Difficulty' }).getByRole('button', { name: 'All' }).click();
  await page.getByLabel('Arch type').selectOption('III');
  const typeIII = ids.filter((id) => caseJson(id).anatomy?.arch_type === 'III');
  await expect(page.locator('.case-card')).toHaveCount(typeIII.length);

  await page.getByRole('group', { name: 'Difficulty' }).getByRole('button', { name: 'Beginner' }).click();
  const both = typeIII.filter((id) => caseJson(id).difficulty === 'beginner');
  if (both.length === 0) await expect(page.getByText('No case matches these filters.')).toBeVisible();
  else await expect(page.locator('.case-card')).toHaveCount(both.length);
});

test('Add a case: a name and a synopsis go on the new card', async ({ page }) => {
  await page.goto('/#/library');
  await page.getByTestId('add-case').click();
  const dialog = page.getByRole('dialog', { name: 'Add a case' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Name').fill('My practice CT');
  await dialog.getByLabel('Synopsis').fill('Right femoral to the right common carotid, practised before the demo.');
  const files = Object.fromEntries(['case.json', 'centerlines.json', 'vessels.glb'].map((n) => [n, new Uint8Array(readFileSync(join(caseDir('ts-s1404-cta'), n)))]));
  await page.getByTestId('import-input').setInputFiles({ name: 'mine.zip', mimeType: 'application/zip', buffer: Buffer.from(writeZip(Object.entries(files))) });
  await expect(dialog.getByRole('status').first()).toContainText('Loaded');
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
  const card = page.locator('.case-card', { hasText: 'My practice CT' });
  await expect(card.getByRole('heading', { name: 'My practice CT' })).toBeVisible();
  await expect(card).toContainText('practised before the demo');
  await expect(card).toContainText('Imported this session');
});

test('a case started this session says where the trainee left off, with a link back', async ({ page }) => {
  await page.addInitScript(() =>
    sessionStorage.setItem('threadsim.plans.v1', JSON.stringify({ 'fixture-y': { entryId: 'fem_r', targetId: 'left_branch', presetId: 'soft_angled', edges: ['e_aorta'] } })),
  );
  await page.goto('/#/library');
  const card = page.locator('.case-card').filter({ has: page.locator('a[href="#/case/fixture-y"]') });
  await expect(card.getByTestId('case-stage')).toHaveText('Left off at Plan. Resume planning');
  await card.getByRole('link', { name: 'Resume planning' }).click();
  await expect(page).toHaveURL(/#\/case\/fixture-y\/plan$/);
  // A case not started says nothing.
  await page.goto('/#/library');
  await expect(page.locator('.case-card').filter({ has: page.locator('a[href="#/case/type-iii"]') }).getByTestId('case-stage')).toHaveCount(0);
});

test('"…" downloads the case package as a zip of its three files', async ({ page }) => {
  await page.goto('/#/library');
  const c = caseJson('type-iii');
  const card = page.locator('.case-card').filter({ has: page.locator('a[href="#/case/type-iii"]') });
  await card.getByRole('button', { name: `More for ${c.title}` }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), card.getByRole('menuitem', { name: 'Download case (.zip)' }).click()]);
  expect(download.suggestedFilename()).toBe('type-iii.zip');
  const bytes = readFileSync((await download.path())!);
  expect(bytes.subarray(0, 2).toString()).toBe('PK');
  for (const n of ['case.json', 'centerlines.json', 'vessels.glb']) expect(bytes.includes(Buffer.from(n))).toBe(true);
});
