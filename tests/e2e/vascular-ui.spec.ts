/**
 * The anatomy layer and its controls (feature/vascular-ui), on the production build with the shipped reference body
 * (client/public/anatomy/vascular.glb, BodyParts3D) aligned to the case.
 * WebGL is software-drawn here, so the tests read what the layer reports on its view (data-anatomy*) and the
 * labels it puts in the page, not pixels.
 */
import { expect, test, type Page } from '@playwright/test';

async function openPlan(page: Page): Promise<void> {
  await page.goto('/#/case/type-iii/plan');
  await expect(page.locator('.plan-view')).toHaveAttribute('data-scene', 'ready');
}

const panel = (page: Page) => page.getByRole('group', { name: 'Anatomy layer' });

test('the layer is off until asked for, then loads the model with arteries, veins and labels', async ({ page }) => {
  await openPlan(page);
  const view = page.locator('.plan-view');
  await expect(view).not.toHaveAttribute('data-anatomy', /.+/); // nothing loaded yet
  const button = page.getByRole('button', { name: 'Anatomy' });
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await button.click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toContainText('Reference body (BodyParts3D), aligned to this case');
  await panel(page).getByLabel('Show anatomy').check();
  await expect(view).toHaveAttribute('data-anatomy', 'ready');
  const [arteries, veins, labels] = (await view.getAttribute('data-anatomy-counts'))!.split('/').map(Number);
  expect(arteries).toBeGreaterThan(0);
  expect(veins).toBeGreaterThan(0);
  await expect(page.locator('.anatomy-label')).toHaveCount(labels!);
  await expect(page.locator('.anatomy-label-artery').first()).toBeVisible();
  await expect(page.locator('.anatomy-label-vein').first()).toBeVisible();
});

test('arteries, veins, labels and opacity each change only their own part, and are remembered', async ({ page }) => {
  await openPlan(page);
  const view = page.locator('.plan-view');
  await page.getByRole('button', { name: 'Anatomy' }).click();
  await panel(page).getByLabel('Show anatomy').check();
  await expect(view).toHaveAttribute('data-anatomy', 'ready');

  await panel(page).getByLabel('Veins').uncheck();
  await expect(view).toHaveAttribute('data-anatomy-veins', 'false');
  await expect(view).toHaveAttribute('data-anatomy-arteries', 'true');
  await expect(page.locator('.anatomy-label-vein').first()).toBeHidden();
  await expect(page.locator('.anatomy-label-artery').first()).toBeVisible();

  await panel(page).getByLabel('Labels').uncheck();
  await expect(view).toHaveAttribute('data-anatomy-labels', 'false');
  await expect(page.locator('.anatomy-labels')).toBeHidden();

  const opacity = panel(page).getByLabel('Opacity');
  await opacity.focus();
  await page.keyboard.press('End');
  await expect(view).toHaveAttribute('data-anatomy-opacity', '1.00');

  await page.reload();
  await expect(page.locator('.plan-view')).toHaveAttribute('data-anatomy', 'ready'); // shown again from the saved settings
  await expect(page.locator('.plan-view')).toHaveAttribute('data-anatomy-veins', 'false');
  await expect(page.locator('.plan-view')).toHaveAttribute('data-anatomy-opacity', '1.00');
});

test('the part toggles are off while the layer is hidden, and Escape closes the panel', async ({ page }) => {
  await openPlan(page);
  await page.getByRole('button', { name: 'Anatomy' }).click();
  await expect(panel(page).getByLabel('Arteries')).toBeDisabled();
  await panel(page).getByLabel('Show anatomy').check();
  await expect(panel(page).getByLabel('Arteries')).toBeEnabled();
  await panel(page).getByLabel('Arteries').focus();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Anatomy' })).toBeFocused();
});

test('Reset camera puts the view back where it opened', async ({ page }) => {
  await openPlan(page);
  const view = page.locator('.plan-view');
  const start = await view.getAttribute('data-frame');
  test.skip(start === null, 'this case has no close-up, so the camera has one framing');
  const other = start === 'close' ? 'Whole tree' : 'Close-up';
  await page.getByRole('button', { name: other }).click();
  await expect(view).not.toHaveAttribute('data-frame', start!);
  await page.getByRole('button', { name: 'Anatomy' }).click();
  await panel(page).getByRole('button', { name: 'Reset camera' }).click();
  await expect(view).toHaveAttribute('data-frame', start!);
});

test('Drive hides the layer in X-ray without changing the settings', async ({ page }) => {
  await page.addInitScript(() => {
    // low-tort: a generated case with an alignment, so the reference body loads (fixture-y has none).
    const edges = ['e_r_iliac', 'e_aorta_desc', 'e_arch_distal', 'e_arch_proximal', 'e_bca', 'e_rcca'];
    sessionStorage.setItem('threadsim.plans.v1', JSON.stringify({ 'low-tort': { entryId: 'fem_r', targetId: 'rcca', presetId: 'soft_angled', edges } }));
    localStorage.setItem('threadsim.anatomy.v1', JSON.stringify({ visible: true, arteries: true, veins: true, labels: true, opacity: 0.35 }));
  });
  await page.goto('/#/case/low-tort/drive');
  const view = page.locator('.drive-view');
  await expect(view).toHaveAttribute('data-anatomy', 'ready');
  await expect(view).toHaveAttribute('data-anatomy-arteries', 'true');
  await page.getByRole('button', { name: 'X-ray' }).click();
  await expect(view).toHaveAttribute('data-anatomy-arteries', 'false');
  await page.getByRole('button', { name: 'Front view' }).click();
  await expect(view).toHaveAttribute('data-anatomy-arteries', 'true');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('threadsim.anatomy.v1')!).visible)).toBe(true);
});
