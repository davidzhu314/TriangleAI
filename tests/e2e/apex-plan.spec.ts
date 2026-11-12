/**
 * Apex plan: a CT case with an apex.json shows the plan, the trade-offs switch the selected line, draft landmarks
 * say so, and the Access check's transapical row links to it. A generated case says it has no heart to plan through.
 * apex.json is served from a synthetic fixture here, so the test doesn't depend on hand-marked landmarks.
 */
import { expect, test, type Page } from '@playwright/test';

const cand = (id: string, coaxial: number, clearance: number, depth: number, ics: number) => ({
  id,
  pos: [-50 - coaxial, 205, -160],
  coaxial_deg: coaxial,
  from_apex_mm: 12,
  to_valve_mm: 80,
  wall_depth_mm: depth,
  lung_mm: 0,
  bone_clearance_mm: clearance,
  nearest_bone: 'Left rib 6',
  ics,
});

const APEX = {
  schema: 'threadsim.apex/1',
  units: 'mm',
  axes: 'RAS',
  landmarks: 'draft',
  valve: { center: [-3, 164, -105], axis: [-0.5, 0.5, -0.7071], hinges: [[8, 164, -105], [-8, 170, -105], [-8, 158, -105]] },
  apex: [-55, 212, -163],
  candidate_radius_mm: 30,
  candidates: [cand('c001', 9, 3, 30, 5), cand('c002', 24, 9, 22, 6)],
};

async function serveApex(page: Page): Promise<void> {
  await page.route('**/cases/ts-s1404-cta/apex.json', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(APEX) }));
}

test('a CT case with an apex plan shows it, and the trade-offs switch the line', async ({ page }) => {
  await serveApex(page);
  await page.goto('/#/case/ts-s1404-cta/access');
  await page.getByTestId('access-row-apex').getByRole('link', { name: 'Through the heart’s apex' }).click();
  await expect(page).toHaveURL(/#\/case\/ts-s1404-cta\/apex$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Through the heart’s apex' })).toBeVisible();
  await expect(page.getByTestId('apex-landmarks')).toHaveText('Draft landmarks: not anatomy');

  const detail = page.getByTestId('apex-detail');
  await expect(detail.getByRole('heading')).toHaveText('Through the 5th intercostal space');
  await expect(detail.locator('[data-verdict]')).toHaveAttribute('data-verdict', 'fair');
  await page.locator('[data-candidate="c002"]').click();
  await expect(page.locator('[data-candidate="c002"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(detail.getByRole('heading')).toHaveText('Through the 6th intercostal space');
  await expect(page.locator('.honesty')).toBeVisible();

  // The 3D view's toolbar, where WebGL is available.
  if (await page.getByTestId('apex-body').count()) {
    await page.getByTestId('apex-body').click();
    await expect(page.getByTestId('apex-body')).toHaveAttribute('aria-pressed', 'false');
    await page.getByTestId('apex-reset').click();
  }
});

test('a generated case has no heart to plan through', async ({ page }) => {
  await page.goto('/#/case/type-ii/apex');
  await expect(page.getByTestId('apex-missing')).toContainText('Generated cases');
});
