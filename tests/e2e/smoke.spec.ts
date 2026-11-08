import { expect, test } from '@playwright/test';

// D0a smoke test: the production build serves the app shell. Aroovee's A8 replaces this with the demo flow.
test('app shell loads with the honesty line', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Cathy');
  await expect(page.getByText('Not a clinical device; no claim of patient benefit.')).toBeVisible();
});
