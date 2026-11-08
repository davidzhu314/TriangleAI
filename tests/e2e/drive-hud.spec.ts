/**
 * Drive's tip twist readout, the Shift fine twist, and the foldable Training case and Controls cards, on the
 * production build, rail mode, fixture-y.
 */
import { expect, test, type Page } from '@playwright/test';

async function openDrive(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('threadsim.tutorial.v1', 'dismissed');
    sessionStorage.setItem('threadsim.plans.v1', JSON.stringify({ 'fixture-y': { entryId: 'fem_r', targetId: 'left_branch', presetId: 'soft_angled', edges: ['e_aorta', 'e_left'] } }));
  });
  await page.goto('/#/case/fixture-y/drive');
  await expect(page.getByTestId('drive-mode')).toHaveText(/rail mode$/);
  await expect(page.getByTestId('twist-readout')).toBeVisible();
}

const tipDeg = async (page: Page): Promise<number> => Number((await page.getByTestId('twist-tip').innerText()).replace(/[^0-9]/g, ''));

/** Hold keys for a time and return how far the tip twisted, in degrees (no wrap in under a turn). */
async function twistFor(page: Page, keys: string[], ms: number): Promise<number> {
  const before = await tipDeg(page);
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of [...keys].reverse()) await page.keyboard.up(k);
  await page.waitForTimeout(200);
  return ((await tipDeg(page)) - before + 360) % 360;
}

test('the readout follows the tip twist, and Shift twists at a quarter of the speed', async ({ page }) => {
  await openDrive(page);
  await expect(page.getByTestId('twist-tip')).toHaveText('0°');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  const full = await twistFor(page, ['KeyD'], 500); // 180°/s in rail
  const fine = await twistFor(page, ['ShiftLeft', 'KeyD'], 500);
  expect(full).toBeGreaterThan(40);
  expect(fine).toBeGreaterThan(5);
  expect(fine).toBeLessThan(full * 0.5); // about a quarter; generous for timer jitter
  // The dial's needle turns with it.
  await expect(page.locator('.twist-needle')).toHaveAttribute('transform', new RegExp(`rotate\\(${await tipDeg(page)} 12 12\\)`));
});

test('the Training case and Controls cards fold away, and stay folded after a reload', async ({ page }) => {
  await openDrive(page);
  for (const id of ['case', 'controls']) {
    const toggle = page.getByTestId(`fold-${id}`);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator(`#hud-${id}-body`)).toBeHidden();
  }
  await page.reload();
  await expect(page.getByTestId('fold-controls')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#hud-case-body')).toBeHidden();
  // The keys still drive with the card folded.
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  expect(await twistFor(page, ['KeyD'], 400)).toBeGreaterThan(20);
  await page.getByTestId('fold-controls').click();
  await expect(page.getByRole('button', { name: 'Push (W)' })).toBeVisible();
});
