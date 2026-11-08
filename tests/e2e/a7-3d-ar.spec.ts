/**
 * The three.js views (A3/A5 with three) and the AR entry (A7), on the production build.
 *
 * WebGL here is Chromium's software renderer, so the tests read what the 3D view reports (its data attributes) rather
 * than pixels. A real headset can't be driven from CI: the AR tests cover the entry rules, and the in-session parts
 * (placement, two-hand scale, frame budget, controller mapping) are unit-tested in client/src/render/ar-math.test.ts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const token = (name: string): string => {
  const css = readFileSync(join(process.cwd(), 'client', 'src', 'styles', 'tokens.css'), 'utf8');
  return new RegExp(`${name}:\\s*([^;]+);`).exec(css)![1]!.trim();
};

async function seedPlan(page: Page): Promise<void> {
  await page.addInitScript(() =>
    sessionStorage.setItem('threadsim.plans.v1', JSON.stringify({ 'fixture-y': { entryId: 'fem_r', targetId: 'left_branch', presetId: 'soft_angled', edges: ['e_aorta', 'e_left'] } })),
  );
}

test('Plan opens in 3D, with the flat drawing one click away, remembered per browser', async ({ page }) => {
  await page.goto('/#/case/fixture-y/plan');
  const view = page.locator('.plan-view');
  await expect(view).toHaveAttribute('data-scene', 'ready');
  await expect(view).toHaveAttribute('data-view-kind', '3d');
  await expect(view.locator('canvas')).toBeVisible();
  await expect(view.locator('canvas')).toHaveAttribute('aria-label', /3D view of/);
  await page.getByRole('button', { name: 'Flat' }).click();
  await expect(view).toHaveAttribute('data-view-kind', 'flat');
  await expect(view.locator('.plan-view-svg')).toBeVisible();
  await page.reload();
  await expect(page.locator('.plan-view')).toHaveAttribute('data-view-kind', 'flat');
});

test('Drive in 3D: X-ray shows the wire only with fluoro, and the puff fades over --duration-contrast-fade', async ({ page }) => {
  await seedPlan(page);
  await page.goto('/#/case/fixture-y/drive');
  const view = page.locator('.drive-view');
  await expect(view).toHaveAttribute('data-scene', 'ready');
  await expect(page.locator('.hud-top-row').getByRole('button', { name: '3D' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'X-ray' }).click();
  await expect(view).toHaveAttribute('data-wire', 'hidden');
  await page.keyboard.down('Space');
  await expect(view).toHaveAttribute('data-wire', 'shown');
  await page.keyboard.up('Space');
  await expect(view).toHaveAttribute('data-wire', 'hidden');

  const peak = Number(token('--opacity-xray-contrast'));
  const fadeMs = Number.parseFloat(token('--duration-contrast-fade'));
  await page.keyboard.press('KeyC');
  await expect.poll(async () => Number(await view.getAttribute('data-contrast'))).toBeGreaterThan(peak / 2);
  await expect.poll(async () => Number(await view.getAttribute('data-contrast')), { timeout: fadeMs * 4 }).toBe(0);
});

test('Framing: Compare opens on the arch close-up; Plan starts whole and closes in as the route reaches the arch', async ({ page }) => {
  const t3 = (edges: string[]) => ({ 'type-iii': { entryId: 'fem_r', targetId: 'rcca', presetId: 'soft_angled', edges } });
  await page.addInitScript((p) => sessionStorage.setItem('threadsim.plans.v1', JSON.stringify(p)), t3(['e_r_iliac', 'e_aorta_desc', 'e_arch_distal', 'e_arch_proximal', 'e_bca', 'e_rcca']));
  await page.goto('/#/case/type-iii/compare');
  const view = page.locator('.plan-view');
  await expect(view).toHaveAttribute('data-scene', 'ready');
  await expect(view).toHaveAttribute('data-frame', 'close');
  const camera = page.getByRole('group', { name: 'Camera' });
  await expect(camera.getByRole('button', { name: 'Close-up' })).toHaveAttribute('aria-pressed', 'true');
  await camera.getByRole('button', { name: 'Whole tree' }).click();
  await expect(view).toHaveAttribute('data-frame', 'whole');
  await expect(camera.getByRole('button', { name: 'Whole tree' })).toHaveAttribute('aria-pressed', 'true');
  // The flat drawing has no camera: the switch hides with it.
  await page.getByRole('button', { name: 'Flat' }).click();
  await expect(camera).toBeHidden();
  await page.getByRole('button', { name: '3D' }).click();
  await expect(camera).toBeVisible();

  // Plan: the saved route already ends at the right carotid, inside the close-up.
  await page.goto('/#/case/type-iii/plan');
  await expect(page.locator('.plan-view')).toHaveAttribute('data-scene', 'ready');
  await expect(page.locator('.plan-view')).toHaveAttribute('data-frame', 'close');
});

test('Framing: a Plan with no route yet opens on the whole tree; fixture-y has no close-up switch', async ({ page }) => {
  await page.goto('/#/case/type-iii/plan');
  await expect(page.locator('.plan-view')).toHaveAttribute('data-scene', 'ready');
  await expect(page.locator('.plan-view')).toHaveAttribute('data-frame', 'whole');
  await page.goto('/#/case/fixture-y/plan');
  await expect(page.locator('.plan-view')).toHaveAttribute('data-scene', 'ready');
  await expect(page.getByRole('group', { name: 'Camera' })).toHaveCount(0);
});

test('AR: no "Enter AR" where immersive-ar is unsupported', async ({ page }) => {
  await page.goto('/#/case/fixture-y/plan');
  await expect(page.locator('.plan-view')).toHaveAttribute('data-scene', 'ready');
  await expect(page.getByRole('button', { name: 'Enter AR' })).toBeHidden();
});

test('AR: "Enter AR" appears where immersive-ar is supported, and says so in words if the session is refused', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'xr', {
      value: { isSessionSupported: (mode: string) => Promise.resolve(mode === 'immersive-ar'), requestSession: () => Promise.reject(new Error('refused')) },
    });
  });
  await seedPlan(page);
  await page.goto('/#/case/fixture-y/plan');
  const enter = page.getByRole('button', { name: 'Enter AR' });
  await expect(enter).toBeVisible();
  await enter.click();
  await expect(page.getByRole('button', { name: 'AR could not start' })).toBeVisible();
  await page.goto('/#/case/fixture-y/drive');
  await expect(page.locator('.hud-top-row').getByRole('button', { name: 'Enter AR' })).toBeVisible(); // drive in AR too
});
