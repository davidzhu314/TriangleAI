/** The Settings screen (#/settings): general switches, the theme, and the command list's sections. */
import { expect, test } from '@playwright/test';

test('Settings is in the main nav and lists every gesture, voice command and key; each list hides on its own', async ({ page }) => {
  await page.goto('/#/library');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  const section = (k: string) => page.locator(`[data-section=${k}]`);
  await expect(section('showGestures').locator('tbody tr')).toHaveCount(9);
  await expect(section('showVoice').locator('tbody tr')).toHaveCount(10);
  await expect(section('showKeys').locator('tbody tr')).toHaveCount(6);
  await expect(section('showVoice')).toContainText('“Hey Cathy, zoom in”');
  await expect(section('showKeys')).toContainText('Fluoro on while held');

  await page.getByRole('switch', { name: /^Keyboard/ }).uncheck();
  await expect(section('showKeys').locator('table')).toBeHidden();
  await expect(section('showGestures').locator('table')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('switch', { name: /^Keyboard/ })).not.toBeChecked();
  await expect(section('showKeys').locator('table')).toBeHidden();
});

test('turning Hand gestures and Voice dictation off takes their buttons off the screens', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByRole('switch', { name: /^Hand gestures/ }).first().uncheck();
  await page.getByRole('switch', { name: /^Voice dictation/ }).uncheck();
  await page.goto('/#/case/fixture-y/plan');
  await expect(page.locator('.plan-view')).toBeVisible();
  await expect(page.getByTestId('hands-toggle')).toBeHidden();
  await expect(page.getByTestId('voice-toggle')).toBeHidden();
  await expect(page.getByTestId('cathy-box')).toContainText('Pick a question or type one.');

  await page.goto('/#/settings');
  await page.getByRole('switch', { name: /^Hand gestures/ }).first().check();
  await page.goto('/#/case/fixture-y/plan');
  await expect(page.getByTestId('hands-toggle')).toBeVisible();
  await expect(page.getByTestId('voice-toggle')).toBeHidden();
});

test('the theme: Dark and Light override the system, and stay after a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/#/settings');
  const html = page.locator('html');
  const background = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim());
  const light = await background();
  await page.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Dark' }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect.poll(background).not.toBe(light);
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Light' }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect.poll(background).toBe(light);
  await page.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'System' }).click();
  await expect(html).not.toHaveAttribute('data-theme', /.+/);
  await expect.poll(background).not.toBe(light); // the system is dark here
});
