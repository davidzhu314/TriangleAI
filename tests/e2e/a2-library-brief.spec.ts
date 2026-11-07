/**
 * A2 acceptance: the Library lists fixture-y, the Case brief shows its fields, and dropping each broken package
 * (tests/fixtures/broken/README.md) shows its §3.5 message. Accepting the units fix clears the warning.
 * Runs against the production build (playwright.config.ts).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { writeZip } from '../../tools/lib/zip';

const BROKEN = join(process.cwd(), 'tests', 'fixtures', 'broken');
const HONESTY = 'Decision trainer with simplified device mechanics. Not a clinical device; no claim of patient benefit.';

function brokenZip(name: string): Buffer {
  if (name === 'privacy') return readFileSync(join(BROKEN, 'privacy', 'case.zip'));
  const files = ['case.json', 'centerlines.json', 'vessels.glb'].map((f): [string, Uint8Array] => [f, new Uint8Array(readFileSync(join(BROKEN, name, f)))]);
  return Buffer.from(writeZip(files));
}

/** Drop a file on the drop zone the way a browser does: a drop event carrying a DataTransfer with the file. */
async function drop(page: Page, bytes: Buffer): Promise<void> {
  const dataTransfer = await page.evaluateHandle((b64) => {
    const bin = atob(b64);
    const data = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
    const dt = new DataTransfer();
    dt.items.add(new File([data], 'case.zip', { type: 'application/zip' }));
    return dt;
  }, bytes.toString('base64'));
  await page.dispatchEvent('[data-testid=dropzone]', 'drop', { dataTransfer });
}

async function importBroken(page: Page, name: string): Promise<ReturnType<Page['getByTestId']>> {
  await page.goto('/#/library');
  await expect(page.getByTestId('next-case')).toBeVisible();
  await drop(page, brokenZip(name));
  const result = page.getByTestId('import-result');
  await expect(result).not.toBeEmpty();
  return result;
}

test('Library shows fixture-y as the next case, with the honesty line', async ({ page }) => {
  await page.goto('/#/library');
  const next = page.getByTestId('next-case');
  await expect(next.getByRole('heading', { name: 'Test fixture: Y branch' })).toBeVisible();
  await expect(next.getByText('Beginner')).toBeVisible();
  await expect(next.getByText('Planning only')).toBeVisible();
  await expect(next.getByText('No stars yet')).toBeVisible();
  await expect(page.getByText(HONESTY)).toBeVisible();
});

test('Case brief shows the case fields and goes to Plan', async ({ page }) => {
  await page.goto('/#/library');
  await page.getByTestId('next-case').getByRole('link', { name: 'Open case' }).click();
  await expect(page).toHaveURL(/#\/case\/fixture-y$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Test fixture: Y branch' })).toBeVisible();
  const card = page.getByTestId('scenario-card');
  await expect(card.getByText('Test fixture: one vessel splitting into two branches. Not anatomy.')).toBeVisible();
  await expect(card.getByText('Left branch')).toBeVisible();
  await expect(card.getByText('Right branch')).toBeVisible();
  await expect(card.getByText('Right femoral')).toBeVisible();
  await expect(card.locator('.field', { hasText: 'Fluoro budget' })).toContainText('60 s'); // fluoro_budget_s from case.json
  await expect(card.locator('.field', { hasText: 'Arch type' }).locator('.dash')).toBeVisible(); // not in fixture-y: a dash
  await expect(page.getByText(HONESTY)).toBeVisible();
  await page.getByRole('main').getByRole('link', { name: 'Start planning' }).click();
  await expect(page).toHaveURL(/#\/case\/fixture-y\/plan$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Plan: Test fixture: Y branch' })).toBeVisible();
});

test('schema: rejected, with errors at /title and /entries/0/node', async ({ page }) => {
  const result = await importBroken(page, 'schema');
  await expect(page.getByRole('status')).toContainText('Rejected');
  await expect(result.getByText('case.json /title is missing.')).toBeVisible();
  await expect(result.getByText('case.json /entries/0/node must be string.')).toBeVisible();
  await expect(result.locator('.check-path', { hasText: '/entries/0/node' })).toBeVisible();
});

test('units: offers rescale ×1000, and accepting it clears the warning', async ({ page }) => {
  const result = await importBroken(page, 'units');
  const warning = result.locator('[data-check=units]');
  await expect(warning).toContainText(/0\.012 mm.*metres/);
  await warning.getByRole('button', { name: 'Rescale ×1000' }).click();
  await expect(result.locator('[data-check=units]')).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveText('Loaded “Test fixture: Y branch”.');
});

test('axes: offers flipping the head–foot axis', async ({ page }) => {
  const result = await importBroken(page, 'axes');
  await expect(result.locator('[data-check=axes]')).toContainText('Flip the head–foot axis?');
  await expect(result.getByRole('button', { name: 'Flip the head–foot axis' })).toBeVisible();
});

test('graph: zero-length edge removed; island target unreachable and greyed', async ({ page }) => {
  const result = await importBroken(page, 'graph');
  await expect(result.getByText('Edge e_stub has zero length, so it was removed.')).toBeVisible();
  await expect(result.getByText(/Island target cannot be reached from any entry site/)).toBeVisible();
  await expect(result.locator('.target-unreachable')).toContainText('Unreachable');
});

test('radii: both edges removed and the case still loads', async ({ page }) => {
  const result = await importBroken(page, 'radii');
  await expect(result.getByText('Edge e_left has 50 radii for 51 points, so it was removed.')).toBeVisible();
  await expect(result.getByText(/Edge e_right has a radius of 0 mm at point 20, so it was removed/)).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Loaded');
});

test('mesh_budget: offers decimation to 100,000 triangles', async ({ page }) => {
  const result = await importBroken(page, 'mesh_budget');
  await expect(result.getByText('The mesh has 107,520 triangles, over the 100,000 budget. Simplify it?')).toBeVisible();
  await expect(result.getByRole('button', { name: 'Simplify to 100,000 triangles' })).toBeVisible();
});

test('privacy: one notice in a details view, no dialog, no patient values', async ({ page }) => {
  const result = await importBroken(page, 'privacy');
  const details = result.locator('details.notices');
  await expect(details.locator('summary')).toHaveText('1 notice from the checks');
  await details.locator('summary').click();
  await expect(details.locator('[data-check=privacy]')).toContainText('Removed');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(/PLACEHOLDER|19000101/);
});

test('physics: a parametric case claiming a phantom is planning only', async ({ page }) => {
  const result = await importBroken(page, 'physics');
  await expect(result.getByText('Planning only: the case asks for physics, but it is not a CathSim phantom.')).toBeVisible();
});
