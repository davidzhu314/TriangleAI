/**
 * The Drive screen's Rail / Physics (beta) switch: it flips the ?wire=chain dev switch for the trainee, the planned
 * route survives the reload (it is saved per tab), and Rail stays the default.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/** low-tort's first entry → first target, shortest by edge count (the chain simulation drives low-tort). */
function planFor(caseId: string): { entryId: string; targetId: string; presetId: string; edges: string[] } {
  const dir = join(process.cwd(), 'client', 'public', 'cases', caseId);
  const c = JSON.parse(readFileSync(join(dir, 'case.json'), 'utf8')) as { entries: { id: string; node: string }[]; targets: { id: string; node: string }[] };
  const cl = JSON.parse(readFileSync(join(dir, 'centerlines.json'), 'utf8')) as { edges: { id: string; from: string; to: string }[] };
  const start = c.entries[0]!.node;
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

/** Save the plan once, in this tab only (not on every load), so the test proves the reload keeps it. */
async function openDrive(page: Page, caseId: string): Promise<void> {
  await page.goto('/#/library');
  await page.evaluate(([id, p]) => sessionStorage.setItem('threadsim.plans.v1', JSON.stringify({ [id as string]: p })), [caseId, planFor(caseId)] as const);
  await page.goto(`/#/case/${caseId}/drive`);
  await expect(page.getByTestId('drive-stage')).toBeVisible();
}

const pressed = (page: Page, wire: 'rail' | 'chain') => page.getByTestId('wire-switch').locator(`[data-wire="${wire}"]`);

test('Rail is the default; Physics (beta) switches to chain mode and keeps the planned route; Rail switches back', async ({ page }) => {
  await openDrive(page, 'low-tort');
  await expect(page.getByTestId('drive-mode')).toHaveText('Front view · rail mode');
  await expect(pressed(page, 'rail')).toHaveAttribute('aria-pressed', 'true');
  await expect(pressed(page, 'chain')).toHaveAttribute('aria-pressed', 'false');

  await pressed(page, 'chain').click();
  await expect(page).toHaveURL(/\?wire=chain#\/case\/low-tort\/drive$/);
  await expect(page.getByTestId('drive-stage')).toBeVisible(); // the plan survived the reload
  await expect(page.getByText('Plan a route first: the drive follows it.')).toHaveCount(0);
  await expect(page.getByTestId('drive-mode')).toHaveText('Front view · chain mode');
  await expect(pressed(page, 'chain')).toHaveAttribute('aria-pressed', 'true');

  await pressed(page, 'rail').click();
  await expect(page).not.toHaveURL(/wire=chain/);
  await expect(page.getByTestId('drive-mode')).toHaveText('Front view · rail mode');
  await expect(pressed(page, 'rail')).toHaveAttribute('aria-pressed', 'true');
});

test('clicking the wire already in use does nothing (no reload)', async ({ page }) => {
  await openDrive(page, 'low-tort');
  const url = page.url();
  await pressed(page, 'rail').click();
  await expect(page.getByTestId('drive-mode')).toHaveText('Front view · rail mode');
  expect(page.url()).toBe(url);
});
