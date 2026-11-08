/**
 * Drive screen on the production build, before select.ts exists. The plan is put in session storage the way Plan
 * and Compare save it. With no wire, the HUD shows dashes and the screen says driving isn't available yet: no
 * number is made up. Controls, the view switch, the contrast puff and the difficulty ladder work without a wire.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/** A saved plan for a case: its first entry and target, and the edges listed in centerlines order from the entry. */
function planFor(caseId: string): { entryId: string; targetId: string; presetId: string; edges: string[] } {
  const dir = join(process.cwd(), 'client', 'public', 'cases', caseId);
  const c = JSON.parse(readFileSync(join(dir, 'case.json'), 'utf8')) as { entries: { id: string; node: string }[]; targets: { id: string; node: string }[] };
  const cl = JSON.parse(readFileSync(join(dir, 'centerlines.json'), 'utf8')) as { edges: { id: string; from: string; to: string }[] };
  const start = c.entries[0]!.node;
  // Shortest path by edge count from the entry to the first target (BFS on the stored graph).
  const goal = c.targets[0]!.node;
  const prev = new Map<string, { node: string; edge: string }>();
  const queue = [start];
  const seen = new Set([start]);
  while (queue.length) {
    const at = queue.shift()!;
    for (const e of cl.edges) {
      const next = e.from === at ? e.to : e.to === at ? e.from : null;
      if (!next || seen.has(next)) continue;
      seen.add(next);
      prev.set(next, { node: at, edge: e.id });
      queue.push(next);
    }
  }
  const edges: string[] = [];
  for (let n = goal; n !== start; ) {
    const p = prev.get(n)!;
    edges.unshift(p.edge);
    n = p.node;
  }
  return { entryId: c.entries[0]!.id, targetId: c.targets[0]!.id, presetId: 'soft_angled', edges };
}

async function openDrive(page: Page, caseId: string): Promise<void> {
  const plan = planFor(caseId);
  await page.addInitScript(([id, p]) => sessionStorage.setItem('threadsim.plans.v1', JSON.stringify({ [id as string]: p })), [caseId, plan] as const);
  await page.goto(`/#/case/${caseId}/drive`);
  await expect(page.getByTestId('drive-stage')).toBeVisible();
}

test('with no plan, Drive sends you to Plan in words', async ({ page }) => {
  await page.goto('/#/case/fixture-y/drive');
  await expect(page.getByText('Plan a route first: the drive follows it.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to Plan' })).toBeVisible();
});

test('without a wire, the HUD shows dashes and the screen says so; nothing is made up', async ({ page }) => {
  await openDrive(page, 'fixture-y');
  await expect(page.getByTestId('drive-banner')).toHaveText("Driving isn't available yet in this build. The view shows your planned route.");
  await expect(page.getByTestId('drive-mode')).toHaveText('Front view · wire not connected');
  for (const id of ['hud-vessel', 'hud-distance', 'hud-fluoro', 'hud-force']) await expect(page.getByTestId(id)).toContainText('—');
  await expect(page.getByText('Training case (not a patient)')).toBeVisible();
  await expect(page.getByText('Not a clinical device; no claim of patient benefit.')).toHaveCount(0); // never on the Drive HUD
  await expect(page.locator('.drive-view .ghost-trail')).not.toHaveAttribute('points', '');
});

test('keys and buttons light their control while held; Space is fluoro', async ({ page }) => {
  await openDrive(page, 'fixture-y');
  const push = page.locator('[data-control=push]');
  await page.keyboard.down('KeyW');
  await expect(push).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.up('KeyW');
  await expect(push).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.down('Space');
  await expect(page.locator('[data-control=fluoro]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.drive-view')).toHaveClass(/fluoro-on/);
  await page.keyboard.up('Space');
  await expect(page.locator('[data-control=fluoro]')).toHaveAttribute('aria-pressed', 'false');
});

test('X-ray view: vessels only during a contrast puff, which then fades', async ({ page }) => {
  await openDrive(page, 'fixture-y');
  await page.getByRole('button', { name: 'X-ray' }).click();
  const view = page.locator('.drive-view');
  await expect(view).toHaveAttribute('data-mode', 'xray');
  await expect(page.getByTestId('drive-mode')).toHaveText('X-ray · wire not connected');
  await page.keyboard.press('KeyC');
  await expect(view).toHaveClass(/contrast-fading/);
});

test('an expert case is X-ray only (spec §5.5 difficulty ladder)', async ({ page }) => {
  const expert = (JSON.parse(readFileSync(join(process.cwd(), 'client', 'public', 'cases', 'index.json'), 'utf8')) as { cases: { id: string }[] }).cases
    .map((x) => x.id)
    .find((id) => (JSON.parse(readFileSync(join(process.cwd(), 'client', 'public', 'cases', id, 'case.json'), 'utf8')) as { difficulty?: string }).difficulty === 'expert');
  test.skip(!expert, 'no expert case bundled');
  await openDrive(page, expert!);
  await expect(page.locator('.drive-view')).toHaveAttribute('data-mode', 'xray');
  await expect(page.getByText('Expert: X-ray only')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Front view' })).toHaveCount(0);
});
