/**
 * Heart tab (M0): the tab is in the sidebar, the template heart loads and draws, the part list names every mesh in the
 * GLB and shows or hides it, and the empty and error states say what happened. Screenshots at the three design widths
 * go to test-results/heart/ on every run, so a change in how the tab looks is seen.
 */
import { expect, test, type Page } from '@playwright/test';

const WIDTHS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '768', width: 768, height: 1024 },
  { name: '390', width: 390, height: 844 },
];

const PARTS = ['lv_myocardium', 'rv_wall', 'la', 'ra', 'aorta', 'pulmonary_trunk', 'mv_plane', 'tv_plane', 'av_plane', 'pv_plane'];

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

async function openHeart(page: Page, path = '/#/heart'): Promise<void> {
  await page.goto(path);
  await expect(page.getByTestId('heart-stage')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
}

test('the Heart tab opens from the sidebar and draws the template heart', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/library');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Heart' }).click();
  await expect(page).toHaveURL(/#\/heart$/);
  await expect(page.getByTestId('heart-stage')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  // Console errors are counted on the Heart tab alone: the Library looks for the optional physics process, and the
  // browser logs that refused connection when it is not running.
  const errors = watchConsole(page);
  await page.reload();
  await expect(page.getByTestId('heart-stage')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Heart' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { level: 1, name: 'Heart' })).toBeVisible();
  await expect(page.getByTestId('heart-title')).toHaveText('Average adult heart (shape model)');
  await expect(page).toHaveTitle('Heart · Cathy');

  // The part list is the GLB's meshes, each named in words.
  for (const name of PARTS) await expect(page.locator(`[data-part=${name}]`)).toBeChecked();
  await expect(page.locator('[data-part]')).toHaveCount(PARTS.length);
  await expect(page.getByLabel('Left ventricle wall')).toBeVisible();
  expect(Number(await page.getByTestId('heart-stage').getAttribute('data-triangles'))).toBeLessThanOrEqual(400_000);

  // The honesty line, as on the rest of the app.
  await expect(page.getByText('Not a clinical device; no claim of patient benefit.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('parts hide and show, by mouse and by keyboard, and the choice is kept for the session', async ({ page }) => {
  test.setTimeout(90_000); // stage screenshots are slow on a software renderer when the whole suite runs in parallel
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHeart(page);
  const showAll = page.getByTestId('heart-show-all');
  await expect(showAll).toBeDisabled();

  const before = await page.getByTestId('heart-stage').screenshot();
  await page.getByLabel('Right ventricle wall').uncheck();
  await page.getByLabel('Left ventricle wall').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('[data-part=lv_myocardium]')).not.toBeChecked();
  await expect(showAll).toBeEnabled();
  await expect.poll(async () => (await page.getByTestId('heart-stage').screenshot()).equals(before)).toBe(false);

  await page.reload();
  await expect(page.getByTestId('heart-stage')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(page.locator('[data-part=rv_wall]')).not.toBeChecked();

  await showAll.click();
  for (const name of PARTS) await expect(page.locator(`[data-part=${name}]`)).toBeChecked();
  await page.getByTestId('heart-reset').click();
});

test('the Light switch changes how the heart is lit and is remembered', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHeart(page);
  const pressed = (id: string) => page.locator(`[data-lighting=${id}]`);
  await expect(pressed('studio')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(600);
  const studio = await page.getByTestId('heart-stage').screenshot();

  await page.getByRole('group', { name: 'Light' }).getByRole('button', { name: 'Contrast' }).click();
  await expect(pressed('contrast')).toHaveAttribute('aria-pressed', 'true');
  await expect(pressed('studio')).toHaveAttribute('aria-pressed', 'false');
  await page.waitForTimeout(300);
  expect((await page.getByTestId('heart-stage').screenshot()).equals(studio)).toBe(false);

  await page.reload();
  await expect(page.getByTestId('heart-stage')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(pressed('contrast')).toHaveAttribute('aria-pressed', 'true');
  for (const id of ['studio', 'soft', 'contrast', 'overhead']) await expect(pressed(id)).toBeVisible();
});

test('empty and error states say what happened and what to do', async ({ page }) => {
  await page.goto('/#/heart/no-such-heart');
  await expect(page.getByRole('heading', { name: 'No heart with that name' })).toBeVisible();
  await page.getByRole('link', { name: 'Open the default heart' }).click();
  await expect(page.getByTestId('heart-stage')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });

  await page.route('**/hearts/kcl-average/heart.glb', (route) => route.abort());
  await page.reload();
  await expect(page.getByRole('heading', { name: 'The heart model didn’t load' })).toBeVisible();
  await page.unroute('**/hearts/kcl-average/heart.glb');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByTestId('heart-stage')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });

  await page.route('**/hearts/index.json', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ schema: 'heartgen.index/1', hearts: [] }) }));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'No heart has been built yet' })).toBeVisible();
});

for (const size of WIDTHS) {
  test(`screenshot at ${size.name} px`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await openHeart(page);
    await page.waitForTimeout(600); // the fade-in and the first damped frames
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); // never scrolls sideways
    await page.screenshot({ path: `test-results/heart/m0-${size.name}.png`, fullPage: true });
  });
}
