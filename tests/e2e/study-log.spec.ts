/**
 * Study log: a record logged from an apex plan line carries the plan in; the list shows planned against used space and
 * the summary; editing, CSV export and import (with a bad row reported) work. apex.json comes from a synthetic
 * fixture, so this doesn't depend on hand-marked landmarks.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const APEX = {
  schema: 'threadsim.apex/1',
  units: 'mm',
  axes: 'RAS',
  landmarks: 'draft',
  valve: { center: [-3, 164, -105], axis: [-0.5, 0.5, -0.7071], hinges: [[8, 164, -105], [-8, 170, -105], [-8, 158, -105]] },
  apex: [-55, 212, -163],
  candidate_radius_mm: 30,
  candidates: [{ id: 'c001', pos: [-59, 205, -160], coaxial_deg: 9, from_apex_mm: 12, to_valve_mm: 80, wall_depth_mm: 30, lung_mm: 0, bone_clearance_mm: 6, nearest_bone: 'Left rib 6', ics: 5 }],
};

async function serveApex(page: Page): Promise<void> {
  await page.route('**/cases/ts-s1404-cta/apex.json', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(APEX) }));
}

test('log a procedure from an apex plan line, then edit, export and import', async ({ page }) => {
  await serveApex(page);
  await page.goto('/#/case/ts-s1404-cta/apex');
  await page.getByTestId('apex-log').click();
  await expect(page).toHaveURL(/#\/study\/new\/ts-s1404-cta\/c001$/);
  await expect(page.locator('[data-field=plannedIcs]')).toHaveValue('5');
  await expect(page.locator('[data-field=plannedIcs]')).toHaveAttribute('readonly', '');
  await expect(page.getByText('line c001 (draft landmarks: not anatomy)')).toBeVisible();

  // A label that looks like an identifier is refused, with the field named.
  await page.locator('[data-field=subject]').fill('MRN 12345678');
  await page.getByTestId('study-save').click();
  await expect(page.getByTestId('study-errors')).toContainText('looks like an identifier');
  await expect(page.locator('[data-field=subject]')).toBeFocused();

  await page.locator('[data-field=subject]').fill('Pig 01');
  await page.locator('[data-field=actualIcs]').fill('6');
  await page.locator('[data-field=attempts]').fill('2');
  await page.locator('[data-field=timeToAccessMin]').fill('7.5');
  await page.locator('[data-field=closure]').selectOption('yes');
  await page.getByTestId('study-save').click();

  await expect(page).toHaveURL(/#\/study$/);
  await expect(page.getByTestId('study-notice')).toContainText('Saved the record for Pig 01');
  const row = page.getByTestId('study-table').locator('tbody tr');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('5 → 6');
  await expect(row).toContainText('Different');
  await expect(page.getByTestId('study-summary')).toContainText('0 of 1');

  await row.getByRole('link', { name: /Edit Pig 01/ }).click();
  await page.locator('[data-field=actualIcs]').fill('5');
  await page.getByTestId('study-save').click();
  await expect(row).toContainText('As planned');

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('study-export').click()]);
  const csv = readFileSync((await download.path())!, 'utf8');
  expect(csv.split('\r\n')[0]).toMatch(/^id,subject,species,/);
  expect(csv).toContain('Pig 01,porcine');

  await page.getByTestId('study-import').setInputFiles({
    name: 'more.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv + 'r-new,Sheep 02,ovine,,2026-11-10,,,,,,false,4,1,5,,no,,\r\nr-bad,,porcine,,2026-11-10,,,,,,false,,,,,,,\r\n'),
  });
  await expect(page.getByTestId('study-notice')).toContainText('Imported 1 record; 1 already in the log');
  await expect(page.getByTestId('study-notice')).toContainText('Row 4:');
  await expect(page.getByTestId('study-table').locator('tbody tr')).toHaveCount(2);
});

test('the study log starts empty and says where records live', async ({ page }) => {
  await page.goto('/#/study');
  await expect(page.getByRole('heading', { level: 1, name: 'Study log' })).toBeVisible();
  await expect(page.getByText('Saved in this browser only')).toBeVisible();
  await expect(page.getByText('Don’t enter patient information')).toBeVisible();
  await expect(page.getByTestId('study-export')).toBeDisabled();
});
