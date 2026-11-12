/**
 * Access check: the Case brief shows the leg-access verdict and links to the screen; the sheath size turns the
 * verdict; routes the case can't measure say so instead of showing a number. Runs against the production build.
 */
import { expect, test } from '@playwright/test';

test('brief links to the access check, and the sheath size turns the verdict', async ({ page }) => {
  await page.goto('/#/case/ts-s0727-cta');
  await expect(page.getByTestId('brief-access-link')).toBeVisible();
  await page.getByTestId('brief-access-link').click();
  await expect(page).toHaveURL(/#\/case\/ts-s0727-cta\/access$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Access check' })).toBeVisible();

  const right = page.getByTestId('access-side-n_fem_r');
  await expect(right.locator('[data-verdict]')).toHaveAttribute('data-verdict', 'fits');
  await page.locator('[data-sheath="18f"]').click();
  await expect(page.locator('[data-sheath="18f"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(right.locator('[data-verdict]')).toHaveAttribute('data-verdict', 'too_small');
  await expect(page.getByTestId('access-answer').locator('[data-verdict]')).toHaveAttribute('data-verdict', 'fits');
  await expect(page.getByText('Needs the valve and apex marked by hand', { exact: false })).toBeVisible();
});

test('a case whose leg route is too small points to another route', async ({ page }) => {
  await page.goto('/#/case/type-ii-tortuous/access');
  await expect(page.getByTestId('access-headline')).toContainText('Another route is needed');
  await expect(page.locator('.honesty')).toBeVisible();
});
