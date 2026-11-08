/**
 * The Drive controls card lists the keys (unchanged, still press-and-hold buttons), every hand gesture and the
 * "Hey Cathy" commands Drive answers, with text from client/src/input/help.ts.
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

const GESTURES = ['Gun', 'Push', 'Hold', 'Pull', 'Rotate', 'Pan', 'Two hands', 'Point', 'Pinch'];
const DRIVE_PHRASES = ['zoom in', 'zoom out', 'reset view', 'best next artery', 'how am I doing', 'undo'];

test('the controls card keeps the keys and lists every gesture and the "Hey Cathy" commands', async ({ page }) => {
  await openDrive(page, 'low-tort');
  const card = page.getByRole('region', { name: 'Controls' });
  await expect(card.locator('[data-control]')).toHaveCount(6); // W, S, A, D, Space, C
  const hands = page.getByTestId('help-hands');
  for (const g of GESTURES) await expect(hands).toContainText(`${g}:`);
  const voice = page.getByTestId('help-voice');
  await expect(voice).toContainText('Hey Cathy');
  for (const p of DRIVE_PHRASES) await expect(voice).toContainText(`“${p}”`);
  await expect(voice).toContainText('On Plan, also: “what are my options”.');
});
