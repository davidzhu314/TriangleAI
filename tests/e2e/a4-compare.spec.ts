/**
 * A4 acceptance on the production build. Plan a route on fixture-y, open Compare, and check it against the engine:
 * optimize(), routeFor and createRanker, loaded through Vite so import.meta.env resolves as in the app. Expected
 * values are computed here, never typed in. Targets are picked by what the engine says, not by fixture-y's ids.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import type { Frontier, LoadedCase, OptimizeResult, WirePresetId } from '../../client/src/contracts';

test.describe.configure({ mode: 'serial' });

let vite: ViteDevServer;
let engine: typeof import('../../client/src/optimize');
let rowsMod: typeof import('../../client/src/ui/plan/cost-rows');
let model: typeof import('../../client/src/ui/compare/model');
let c: LoadedCase;
let graph: ReturnType<(typeof import('../../client/src/optimize'))['buildGraph']>;
const results = new Map<string, OptimizeResult>();

test.beforeAll(async () => {
  vite = await createServer({ configFile: false, root: join(process.cwd(), 'client'), logLevel: 'silent', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
  engine = (await vite.ssrLoadModule('/src/optimize/index.ts')) as typeof engine;
  rowsMod = (await vite.ssrLoadModule('/src/ui/plan/cost-rows.ts')) as typeof rowsMod;
  model = (await vite.ssrLoadModule('/src/ui/compare/model.ts')) as typeof model;
  const { loadCase } = (await vite.ssrLoadModule('/src/case/index.ts')) as typeof import('../../client/src/case');
  const dir = join(process.cwd(), 'client', 'public', 'cases', 'fixture-y');
  const files = Object.fromEntries(['case.json', 'centerlines.json', 'vessels.glb'].map((n) => [n, new Uint8Array(readFileSync(join(dir, n)))]));
  const r = await loadCase({ kind: 'files', origin: 'bundled', files });
  if (!r.ok) throw new Error('fixture-y did not load');
  c = r.case;
  graph = engine.buildGraph(c);
  for (const t of c.targets) results.set(t.id, await engine.optimize({ caseId: c.id, targetId: t.id }, c));
});

test.afterAll(async () => {
  await vite?.close();
});

const frontierTarget = (): string => [...results].find(([, r]) => r.kind === 'frontier')![0];
const blockedTarget = (): string => [...results].find(([, r]) => r.kind === 'no_safe_route')![0];

/** Plan a route with the keyboard path, then press Compare routes. */
async function planAndCompare(page: Page, presetId: WirePresetId, targetId: string): Promise<void> {
  const targetName = c.targets.find((t) => t.id === targetId)!.name;
  await page.goto('/#/case/fixture-y/plan');
  await expect(page.getByTestId('cost-panel')).toBeVisible();
  await page.locator(`input[name=preset][value=${presetId}]`).check();
  await page.locator(`input[name=target][value=${targetId}]`).check();
  for (let i = 0; i < 20; i++) {
    const list = page.getByTestId('next-steps');
    if ((await list.count()) === 0) break;
    const direct = list.getByRole('button', { name: `To ${targetName}` });
    await ((await direct.count()) ? direct : list.getByRole('button').first()).press('Enter');
  }
  await page.getByTestId('compare').click();
  await expect(page).toHaveURL(/#\/case\/fixture-y\/compare$/);
}

/** The edges the keyboard path walks: the simple path from the entry to the target on the engine's graph. */
function pathTo(targetId: string): string[] {
  const start = graph.entries.get(c.entries[0]!.id)!;
  const goal = graph.targets.get(targetId)!;
  const prev = new Map<string, { node: string; edge: string }>();
  const queue = [start];
  const seen = new Set([start]);
  while (queue.length) {
    const at = queue.shift()!;
    for (const edgeId of graph.adjacency.get(at) ?? []) {
      const e = graph.edges.get(edgeId)!;
      const next = e.from === at ? e.to : e.from;
      if (seen.has(next)) continue;
      seen.add(next);
      prev.set(next, { node: at, edge: edgeId });
      queue.push(next);
    }
  }
  const edges: string[] = [];
  for (let n = goal; n !== start; ) {
    const p = prev.get(n)!;
    edges.unshift(p.edge);
    n = p.node;
  }
  return edges;
}

test('Compare shows the overlay and a table equal to optimize() and routeFor', async ({ page }) => {
  const targetId = frontierTarget();
  const presetId = engine.WIRE_PRESETS[0]!.id;
  await planAndCompare(page, presetId, targetId);
  await expect(page.getByTestId('overlay').locator('.plan-view-svg')).toBeVisible();
  await expect(page.getByTestId('overlay').locator('.plan-view-svg .route-trace')).not.toHaveAttribute('points', '');

  const frontier = results.get(targetId) as Frontier;
  const player = engine.routeFor(graph, c.entries[0]!.id, targetId, presetId, pathTo(targetId));
  const measures = model.visibleMeasures(frontier, player);
  const groups = model.groupRoutes(c, frontier);
  const ranks = model.groupRanks(groups, engine.createRanker(frontier)(model.startingWeights(measures)));
  const table = page.getByTestId('routes-table');

  const expectRow = async (rowSel: string, cost: (typeof player)['cost']): Promise<void> => {
    for (const m of measures) {
      const f = rowsMod.formatCost(m, cost);
      await expect(table.locator(`${rowSel} td[data-measure=${m.key}]`)).toContainText(f.value === null ? '—' : `${f.value}${f.unit ? ` ${f.unit}` : ''}`);
    }
  };
  await expectRow('tr[data-route=player]', player.cost);
  for (const g of groups) {
    await expect(table.locator(`tr[data-route="${g.id}"] th`)).toContainText(g.name);
    await expect(table.locator(`tr[data-route="${g.id}"] td[data-label=Rank]`)).toHaveText(String(ranks.get(g.id)));
    await expectRow(`tr[data-route="${g.id}"]`, g.cost);
  }
  await expect(page.getByTestId('finding')).toHaveText(model.finding(c, player, frontier, groups, measures));
});

test('moving a weight slider gives the ranks and shares createRanker and normaliseWeights give', async ({ page }) => {
  const targetId = frontierTarget();
  await planAndCompare(page, engine.WIRE_PRESETS[0]!.id, targetId);
  const frontier = results.get(targetId) as Frontier;
  const measures = model.visibleMeasures(frontier, null);
  const moved = measures[0]!;
  const slider = page.locator(`input[data-measure=${moved.key}]`);
  await slider.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  const weights = { ...model.startingWeights(measures), [moved.key]: Number(await slider.inputValue()) };
  const shares = engine.normaliseWeights(weights);
  await expect(page.locator(`[data-share=${moved.key}]`)).toHaveText(`${Math.round(shares[moved.key]! * 100)}%`);
  const groups = model.groupRoutes(c, frontier);
  const ranks = model.groupRanks(groups, engine.createRanker(frontier)(weights));
  for (const g of groups) await expect(page.getByTestId('routes-table').locator(`tr[data-route="${g.id}"] td[data-label=Rank]`)).toHaveText(String(ranks.get(g.id)));
});

test('Switch to a frontier route saves it, and Plan shows it', async ({ page }) => {
  const targetId = frontierTarget();
  const frontier = results.get(targetId) as Frontier;
  const group = model.groupRoutes(c, frontier)[0]!;
  const other = engine.WIRE_PRESETS.find((p) => !group.presetIds.includes(p.id))?.id ?? engine.WIRE_PRESETS[0]!.id;
  await planAndCompare(page, other, targetId);
  await page.getByTestId('routes-table').locator(`tr[data-route="${group.id}"]`).click();
  await page.getByTestId('switch').first().click();
  await expect(page.getByRole('status')).toContainText(`Switched to ${group.name}`);
  await page.getByRole('link', { name: 'Plan' }).click();
  await expect(page.locator(`input[name=preset][value=${group.presetIds[0]}]`)).toBeChecked();
  await expect(page.locator('.plan-view-svg .route-trace')).not.toHaveAttribute('points', '');
  const expected = engine.routeFor(graph, group.entryId, targetId, group.presetIds[0]!, group.edges);
  await expect(page.getByTestId('cost-table').locator('[data-measure=lengthM] dd')).toContainText(rowsMod.formatCost(rowsMod.COST_ROWS[0]!, expected.cost).value!);
});

test('a target with no safe route says so in words', async ({ page }) => {
  const targetId = blockedTarget();
  await planAndCompare(page, engine.WIRE_PRESETS[0]!.id, targetId);
  const result = results.get(targetId)!;
  const player = engine.routeFor(graph, c.entries[0]!.id, targetId, engine.WIRE_PRESETS[0]!.id, pathTo(targetId));
  const text = model.finding(c, player, result, [], model.visibleMeasures(null, player));
  await expect(page.getByTestId('finding')).toHaveText(text);
  await expect(page.getByTestId('finding')).toContainText('No safe route');
  await expect(page.getByTestId('weights')).toHaveCount(0);
});
