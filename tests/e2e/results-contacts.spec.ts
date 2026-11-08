/**
 * Results' wall contact review, on the production build, from Vaibhav's golden scoring logs for fixture-y: the
 * prolapse drive has one force spike, the clean drive none. Expected values are read from the golden log, never
 * typed in.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { EventLog, Weights } from '../../client/src/contracts';

interface Golden {
  weights: Weights;
  log: EventLog;
}
const golden = (name: string): Golden => JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'logs', `score-${name}-fixture-y.json`), 'utf8')) as Golden;
const fmt = (v: number, d: number): string => Number(v.toFixed(d)).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

async function openResults(page: Page, g: Golden): Promise<void> {
  const drive = { plan: { entryId: g.log.entryId, targetId: g.log.targetId, presetId: g.log.presetId, edges: g.log.path, weights: g.weights }, log: g.log };
  await page.addInitScript((d) => {
    localStorage.setItem('threadsim.tutorial.v1', 'dismissed');
    if (sessionStorage.getItem('test.seeded')) return;
    sessionStorage.setItem('test.seeded', '1');
    sessionStorage.setItem('threadsim.drives.v1', JSON.stringify({ 'fixture-y': d }));
  }, drive);
  await page.goto('/#/case/fixture-y/results');
  await expect(page.getByTestId('finding')).toBeVisible({ timeout: 20_000 });
}

test('a drive with a force spike: one numbered contact on the replay and in the list, with its numbers and a tip', async ({ page }) => {
  const g = golden('prolapse');
  const spike = g.log.events.find((e) => e.kind === 'force_spike') as Extract<EventLog['events'][number], { kind: 'force_spike' }>;
  await openResults(page, g);
  const panel = page.getByTestId('contacts');
  await expect(page.getByTestId('contacts-summary')).toContainText(`1 wall contact reached the ${fmt(spike.thresholdN, 2)} N threshold`);
  const items = panel.getByTestId('contact-item');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText(`at ${fmt(spike.t, 1)} s`);
  await expect(items.first()).toContainText(`against the ${fmt(spike.thresholdN, 2)} N threshold`);
  await expect(items.first().locator('.contact-tip')).not.toBeEmpty();
  await expect(page.getByTestId('contact-mark')).toHaveCount(1);

  // Selecting the contact highlights its mark on the replay; selecting again clears it.
  await items.first().click();
  await expect(items.first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.contact-mark-active')).toHaveCount(1);
  await items.first().click();
  await expect(page.locator('.contact-mark-active')).toHaveCount(0);

  // Technique, not a patient: the context line says the forces are illustrative.
  await expect(panel).toContainText('illustrative');
  await expect(panel).not.toContainText(/inflam|the patient/i);
});

test('a clean drive: the panel says no contact reached the threshold, and there are no marks', async ({ page }) => {
  await openResults(page, golden('clean'));
  await expect(page.getByTestId('contacts-summary')).toContainText('No wall contact reached the');
  await expect(page.getByTestId('contact-item')).toHaveCount(0);
  await expect(page.getByTestId('contact-mark')).toHaveCount(0);
});
