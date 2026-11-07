/**
 * A3 acceptance on the production build: build a route on fixture-y's Plan with the keyboard path, and check the
 * cost panel against the engine. Expected values are computed here from the engine (routeFor) and the panel's own
 * formatter, loaded through Vite so import.meta.env resolves as in the app. Nothing is typed in.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import type { LoadedCase, Route, WirePresetId } from '../../client/src/contracts';

// One worker for this file: the engine is loaded once through Vite, not once per test worker.
test.describe.configure({ mode: 'serial' });

let vite: ViteDevServer;
let engine: typeof import('../../client/src/optimize');
let rows: typeof import('../../client/src/ui/plan/cost-rows');
let warn: typeof import('../../client/src/ui/plan/warnings');
let c: LoadedCase;
let graph: ReturnType<(typeof import('../../client/src/optimize'))['buildGraph']>;

test.beforeAll(async () => {
  vite = await createServer({ configFile: false, root: join(process.cwd(), 'client'), logLevel: 'silent', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
  engine = (await vite.ssrLoadModule('/src/optimize/index.ts')) as typeof engine;
  rows = (await vite.ssrLoadModule('/src/ui/plan/cost-rows.ts')) as typeof rows;
  warn = (await vite.ssrLoadModule('/src/ui/plan/warnings.ts')) as typeof warn;
  const { loadCase } = (await vite.ssrLoadModule('/src/case/index.ts')) as typeof import('../../client/src/case');
  const dir = join(process.cwd(), 'client', 'public', 'cases', 'fixture-y');
  const files = Object.fromEntries(['case.json', 'centerlines.json', 'vessels.glb'].map((n) => [n, new Uint8Array(readFileSync(join(dir, n)))]));
  const r = await loadCase({ kind: 'files', origin: 'bundled', files });
  if (!r.ok) throw new Error('fixture-y did not load');
  c = r.case;
  graph = engine.buildGraph(c);
});

test.afterAll(async () => {
  await vite?.close();
});

/** The simple path from the case's first entry to a target, found on the engine's graph (BFS). */
function pathTo(targetId: string): string[] {
  const start = graph.entries.get(c.entries[0]!.id)!;
  const goal = graph.targets.get(targetId)!;
  const prev = new Map<string, { node: string; edge: string }>();
  const queue = [start];
  const seen = new Set([start]);
  while (queue.length) {
    const at = queue.shift()!;
    if (at === goal) break;
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

const routeTo = (targetId: string, presetId: WirePresetId): Route => engine.routeFor(graph, c.entries[0]!.id, targetId, presetId, pathTo(targetId));

/** Targets the engine says are clean (no heavy crossing, feasible) and heavy (crosses a heavy zone). */
function targets(presetId: WirePresetId): { clean: string; heavy: string } {
  const reachable = c.targets.filter((t) => t.reachable).map((t) => t.id);
  const clean = reachable.find((t) => routeTo(t, presetId).feasible && routeTo(t, presetId).cost.heavyCrossings === 0);
  const heavy = reachable.find((t) => routeTo(t, presetId).cost.heavyCrossings > 0);
  if (!clean || !heavy) throw new Error('fixture-y no longer has a clean and a heavy target');
  return { clean, heavy };
}

/** Build the route with the keyboard: focus the step that reaches the target if offered, else the first, press Enter. */
async function buildWithKeyboard(page: Page, targetName: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const list = page.getByTestId('next-steps');
    if ((await list.count()) === 0) return;
    const direct = list.getByRole('button', { name: `To ${targetName}` });
    const step = (await direct.count()) ? direct : list.getByRole('button').first();
    await step.focus();
    await page.keyboard.press('Enter');
  }
}

async function openPlan(page: Page, presetId: WirePresetId, targetId: string): Promise<void> {
  await page.goto('/#/case/fixture-y/plan');
  await expect(page.getByTestId('cost-panel')).toBeVisible();
  await page.locator(`input[name=preset][value=${presetId}]`).check();
  await page.locator(`input[name=target][value=${targetId}]`).check();
}

test('keyboard route to a clean target: the panel equals routeFor, and Compare unlocks only when complete', async ({ page }) => {
  const presetId = engine.WIRE_PRESETS[0]!.id;
  const { clean } = targets(presetId);
  const targetName = c.targets.find((t) => t.id === clean)!.name;
  await openPlan(page, presetId, clean);
  await expect(page.getByTestId('compare')).toBeDisabled();

  await buildWithKeyboard(page, targetName);
  await expect(page.getByTestId('next-steps')).toHaveCount(0);
  await expect(page.getByTestId('compare')).toBeEnabled();

  const expected = routeTo(clean, presetId);
  for (const row of rows.COST_ROWS) {
    const f = rows.formatCost(row, expected.cost);
    const text = f.value === null ? '—' : `${f.value}${f.unit ? ` ${f.unit}` : ''}`;
    await expect(page.locator(`[data-measure=${row.key}] dd`)).toContainText(text);
  }
  await expect(page.getByTestId('verdict')).toContainText(expected.feasible ? 'Feasible' : 'not feasible');

  await page.getByRole('button', { name: 'Undo last step' }).click();
  await expect(page.getByTestId('compare')).toBeDisabled();
});

test('route toward the heavy target shows the heavy-crossing warning first', async ({ page }) => {
  const presetId = engine.WIRE_PRESETS[0]!.id;
  const { heavy } = targets(presetId);
  const targetName = c.targets.find((t) => t.id === heavy)!.name;
  await openPlan(page, presetId, heavy);
  await buildWithKeyboard(page, targetName);
  const preset = engine.WIRE_PRESETS.find((p) => p.id === presetId)!;
  const expectedFirst = warn.warningsFor(c, routeTo(heavy, presetId), preset)[0]!;
  expect(expectedFirst.level === 'heavy' || expectedFirst.level === 'blocked').toBe(true);
  await expect(page.getByTestId('first-warning')).toHaveText(expectedFirst.text);
  if (expectedFirst.level === 'heavy') await expect(page.getByTestId('first-warning')).toContainText('heavy risk zone');
});

test('Compare routes stores the plan and opens the Compare placeholder', async ({ page }) => {
  const presetId = engine.WIRE_PRESETS[0]!.id;
  const { clean } = targets(presetId);
  await openPlan(page, presetId, clean);
  await buildWithKeyboard(page, c.targets.find((t) => t.id === clean)!.name);
  await page.getByTestId('compare').click();
  await expect(page).toHaveURL(/#\/case\/fixture-y\/compare$/);
  await expect(page.getByRole('heading', { level: 1, name: `Compare: ${c.title}` })).toBeVisible();
  await expect(page.getByText('The comparison view is not built yet.')).toBeVisible();
});

test('the view draws the case and the route trace', async ({ page }) => {
  const presetId = engine.WIRE_PRESETS[0]!.id;
  const { clean } = targets(presetId);
  await openPlan(page, presetId, clean);
  await expect(page.locator('.plan-view-svg .vessel')).toHaveCount(c.edges.length);
  await buildWithKeyboard(page, c.targets.find((t) => t.id === clean)!.name);
  await expect(page.locator('.route-trace')).not.toHaveAttribute('points', '');
});

// The 3D scene needs three.js, a runtime dependency requested from David (team/requests/to-david-from-aroovee-threejs.md).
test.fixme('the WebGL canvas renders (three.js scene)', async () => {});
