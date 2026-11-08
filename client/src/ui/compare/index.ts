/**
 * Compare — "Is my route on the frontier?" (DESIGN.md: Screen inventory).
 * The overlay leads (frontier routes by colour, pattern and label, the player's route on top) with the weight
 * sliders beside it, then one routes table, then keep or switch. The engine decides everything: optimize() for the frontier,
 * routeFor for the player's own route, createRanker for the order.
 */
import type { Frontier, LoadedCase, OptimizeResult, Route, Weights, WirePresetId } from '../../contracts';
import { buildGraph, createRanker, normaliseWeights, optimize, routeFor, WIRE_PRESETS, type RouteGraph } from '../../optimize';
import { svgEl } from '../../render/case-svg';
import { createCompareView, type CompareView } from '../../render/compare-view';
import { anatomyFor } from '../body-context';
import { notFound } from '../brief';
import { createHandsVoice, type HandsVoice } from '../hands-voice';
import { dash, h } from '../dom';
import { labelled } from '../icons';
import { formatCost, FORMULA_TEXT, type CostRow } from '../plan/cost-rows';
import { warningsFor } from '../plan/warnings';
import { href } from '../router';
import { renderShell } from '../shell';
import { entry, loadBundled, loadedCase, savePlan, savedPlan, type SavedPlan } from '../store';
import './compare.css';
import { finding, groupRanks, groupRoutes, overlaySelection, startingWeights, visibleMeasures, type RouteGroup } from './model';

let liveView: CompareView | null = null;
/** Kept across redraws of the same case (every slider move redraws): the 3D camera stays put. */
let liveCase: LoadedCase | null = null;
/** Hands-free input for the live view (pan and zoom here): kept and disposed with it. */
let liveHands: HandsVoice | null = null;
export function disposeCompareView(): void {
  liveHands?.dispose();
  liveHands = null;
  liveView?.dispose();
  liveView = null;
  liveCase = null;
}

const graphs = new WeakMap<LoadedCase, RouteGraph>();
const graphFor = (c: LoadedCase): RouteGraph => {
  let g = graphs.get(c);
  if (!g) graphs.set(c, (g = buildGraph(c)));
  return g;
};

const presetName = (id: WirePresetId): string => WIRE_PRESETS.find((p) => p.id === id)?.name ?? id;

/** A legend swatch is the line itself, scaled down: same class, colour and pattern as in the view. */
function swatch(lineClass: string): HTMLSpanElement {
  const svg = svgEl('svg', { viewBox: '0 0 24 8', 'aria-hidden': 'true' });
  svg.append(svgEl('line', { x1: 1, y1: 4, x2: 23, y2: 4, class: lineClass }));
  const span = h('span', { class: 'swatch' });
  span.append(svg);
  return span;
}

function cell(row: CostRow, cost: Route['cost'] | undefined): HTMLTableCellElement {
  const f = formatCost(row, cost);
  const tip = `${FORMULA_TEXT[row.formulaRef] ?? ''}${row.illustrative ? ' Illustrative.' : ''}`.trim();
  return h(
    'td',
    { class: 'num', 'data-label': row.label, 'data-measure': row.key },
    h('span', { class: 'tip', tabindex: '0', 'data-tip': tip }, f.value === null ? dash('Not measured') : h('span', { class: 'figure' }, f.value, f.unit ? h('span', { class: 'unit' }, ` ${f.unit}`) : null)),
  );
}

interface Screen {
  root: HTMLElement;
  key: string;
  c: LoadedCase;
  graph: RouteGraph;
  plan: SavedPlan;
  player: Route | null;
  result: OptimizeResult;
  groups: RouteGroup[];
  rank: ((w: Weights) => ReturnType<ReturnType<typeof createRanker>>) | null;
  measures: CostRow[];
  weights: Weights;
  selected: string | null;
  note: string;
}

function playerRoute(graph: RouteGraph, plan: SavedPlan): Route | null {
  try {
    return routeFor(graph, plan.entryId, plan.targetId, plan.presetId, plan.edges);
  } catch {
    return null;
  }
}

function draw(sc: Screen): void {
  const { c, key, graph, plan, player, result } = sc;
  const frontier: Frontier | null = result.kind === 'frontier' ? result : null;
  const ranking = sc.rank ? sc.rank(sc.weights) : null;
  const ranks = ranking ? groupRanks(sc.groups, ranking) : new Map<string, number>();
  const overlay = overlaySelection(sc.groups, ranks);
  const shares = normaliseWeights(sc.weights);
  const redraw = (): void => draw(sc);

  // ---- overlay, the largest block
  if (!liveView || liveCase !== c) {
    disposeCompareView();
    const created = createCompareView(c, anatomyFor(entry(key), c));
    liveView = created;
    liveCase = c;
    liveHands = createHandsVoice({
      host: created.element,
      actions: ['zoom_in', 'zoom_out', 'undo'],
      onPan: (dx, dy, roll) => created.pan(dx, dy, roll),
      onVoice: (a) => (a === 'undo' ? 'Undo works on Plan.' : created.zoom(a === 'zoom_in' ? 0.75 : 1.33) ? null : 'Zoom works in the 3D view.'),
    });
    created.toolbar.append(liveHands.controls);
  }
  const view = liveView;
  const entryNode = graph.entries.get(plan.entryId);
  view.update({
    lines: overlay.map(({ group, slot }) => ({ id: group.id, slot, startNode: graph.entries.get(group.entryId), edges: group.edges })),
    selectedId: sc.selected,
    player: { startNode: entryNode, edges: plan.edges },
    entryNode,
    targetNode: graph.targets.get(plan.targetId),
  });
  const legend = h(
    'ul',
    { class: 'legend', 'aria-label': 'Lines in the view' },
    h('li', { class: 'legend-item' }, swatch('route-trace'), 'Your route'),
    overlay.map(({ group, slot }) => h('li', { class: 'legend-item', 'data-route': group.id }, swatch(`frontier-line route-${slot}`), group.name)),
  );
  const hidden = sc.groups.length - overlay.length;
  const well = h(
    'section',
    { class: 'compare-overlay', 'aria-label': 'Frontier routes and your route', 'data-testid': 'overlay' },
    h('div', { class: 'compare-well' }, view.element),
    legend,
    hidden > 0 ? h('p', { class: 'muted' }, `The view shows the top ${overlay.length} by your weights; the table lists all ${sc.groups.length}.`) : null,
  );

  // ---- sliders: one per measure the cost vectors carry, as the engine's normalised shares
  const sliders = frontier
    ? h(
        'section',
        { class: 'compare-weights', 'aria-labelledby': 'weights-heading', 'data-testid': 'weights' },
        h('h2', { id: 'weights-heading' }, 'Weights'),
        h('p', { class: 'muted' }, 'Illustrative: they change the order of the frontier, never which routes are feasible.'),
        h('div', { class: 'weight-list' }, sc.measures.map((m) => {
          const raw = sc.weights[m.key] ?? 0;
          const share = shares[m.key];
          const input = h('input', { type: 'range', min: '0', max: '10', step: '1', value: String(raw), id: `w-${m.key}`, 'data-measure': m.key, 'aria-valuetext': share === undefined ? 'no weight' : `${Math.round(share * 100)} percent of the weight` });
          input.addEventListener('input', () => {
            sc.weights = { ...sc.weights, [m.key]: Number(input.value) };
            sc.note = '';
            redraw();
            document.getElementById(`w-${m.key}`)?.focus();
          });
          return h(
            'div',
            { class: 'weight' },
            h('label', { for: `w-${m.key}` }, m.label),
            input,
            h('span', { class: 'weight-share num', 'data-share': m.key }, share === undefined ? dash('No weight') : `${Math.round(share * 100)}%`),
          );
        })),
        Object.keys(shares).length === 0 ? h('p', { class: 'muted' }, 'Every weight is zero, so the routes rank equal.') : null,
      )
    : null;

  // ---- routes table
  const head = h('tr', {}, h('th', { scope: 'col' }, 'Route'), h('th', { scope: 'col', class: 'num' }, h('span', { class: 'tip', tabindex: '0', 'data-tip': FORMULA_TEXT['rank.weighted'] ?? '' }, 'Rank')), sc.measures.map((m) => h('th', { scope: 'col', class: 'num' }, m.label, m.illustrative ? h('span', { class: 'illustrative' }, ' (illustrative)') : null)));
  const sortedGroups = [...sc.groups].sort((a, b) => (ranks.get(a.id) ?? Infinity) - (ranks.get(b.id) ?? Infinity));
  // On the frontier only when the engine says the route is safe (feasible, no heavy crossing) and a frontier row is that route.
  const playerOn = !!player && player.feasible && player.cost.heavyCrossings === 0 && sc.groups.some((g) => g.entryId === player.entryId && g.edges.join() === player.edges.join() && g.presetIds.includes(player.presetId));
  const rows = [
    player
      ? h(
          'tr',
          { class: 'row-player', 'data-route': 'player' },
          h('th', { scope: 'row' }, h('span', { class: 'row-name' }, 'Your route'), h('span', { class: 'row-sub' }, `${presetName(player.presetId)} wire${playerOn ? ' · on the frontier' : ''}`)),
          h('td', { class: 'num', 'data-label': 'Rank' }, dash('Your route is not ranked with the frontier')),
          sc.measures.map((m) => cell(m, player.cost)),
        )
      : null,
    ...sortedGroups.map((g) => {
      const tr = h(
        'tr',
        { class: g.id === sc.selected ? 'row-selected' : '', 'data-route': g.id, tabindex: '0', 'aria-selected': String(g.id === sc.selected) },
        h('th', { scope: 'row' }, h('span', { class: 'row-name' }, g.name), h('span', { class: 'row-sub' }, `${g.devices} wire`)),
        h('td', { class: 'num', 'data-label': 'Rank', 'data-rank': String(ranks.get(g.id) ?? '') }, String(ranks.get(g.id) ?? '—')),
        sc.measures.map((m) => cell(m, g.cost)),
      );
      const pick = (): void => {
        sc.selected = g.id === sc.selected ? null : g.id;
        redraw();
        document.querySelector<HTMLElement>(`tr[data-route="${CSS.escape(g.id)}"]`)?.focus();
      };
      tr.addEventListener('click', pick);
      tr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          pick();
        }
      });
      return tr;
    }),
  ];
  const table = h(
    'section',
    { class: 'compare-table', 'aria-labelledby': 'table-heading' },
    h('h2', { id: 'table-heading' }, frontier ? 'Routes' : 'Your route'),
    frontier ? h('p', { class: 'muted' }, 'Select a frontier route to highlight it in the view and switch to it.') : null,
    h('div', { class: 'table-scroll' }, h('table', { class: 'routes', 'data-testid': 'routes-table' }, h('thead', {}, head), h('tbody', {}, rows))),
  );

  // ---- the player's own warnings, in words
  const preset = WIRE_PRESETS.find((p) => p.id === plan.presetId) ?? WIRE_PRESETS[0]!;
  const warnings = warningsFor(c, player, preset);
  const warningBlock = warnings.length
    ? h(
        'ul',
        { class: 'warning-list', 'aria-label': 'Your route' },
        warnings.map((w) => h('li', { class: `plan-warning ${w.level === 'blocked' ? 'warning-blocked' : 'warning-risk'}` }, w.tier ? labelled(w.tier === 'forbidden' ? 'risk-forbidden' : w.tier === 'heavy' ? 'risk-heavy' : 'risk-proximity', w.text) : h('span', {}, w.text))),
      )
    : null;

  // ---- keep or switch
  const choose = (next: SavedPlan, note: string): void => {
    savePlan(key, next);
    sc.plan = next;
    sc.player = playerRoute(graph, next);
    sc.note = note;
    redraw();
  };
  const keep = h('button', { type: 'button', class: 'btn btn-secondary' }, 'Keep my route');
  keep.addEventListener('click', () => choose({ ...plan, weights: { ...sc.weights } }, 'Kept your route.'));
  const selectedGroup = sc.groups.find((g) => g.id === sc.selected);
  const switches = selectedGroup
    ? selectedGroup.presetIds.map((presetId) => {
        const label = selectedGroup.presetIds.length > 1 ? `Switch to ${selectedGroup.name}, ${presetName(presetId)} wire` : `Switch to ${selectedGroup.name}`;
        const b = h('button', { type: 'button', class: 'btn btn-secondary', 'data-testid': 'switch' }, label);
        b.addEventListener('click', () => choose({ entryId: selectedGroup.entryId, targetId: plan.targetId, presetId, edges: [...selectedGroup.edges], weights: { ...sc.weights } }, `Switched to ${selectedGroup.name}.`));
        return b;
      })
    : [];
  const decide = h('section', { class: 'compare-decide', 'aria-label': 'Keep or switch' }, h('div', { class: 'actions' }, keep, switches), h('p', { class: 'import-status', role: 'status', 'aria-live': 'polite' }, sc.note));

  const start = h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'start-drive' }, 'Start drive');
  start.addEventListener('click', () => {
    if (!savedPlan(key)?.weights) savePlan(key, { ...sc.plan, weights: { ...sc.weights } });
    location.hash = href.drive(key);
  });

  const body = h(
    'div',
    { class: 'compare' },
    h('div', { class: 'title-row' }, h('h1', {}, `Compare: ${c.title}`), h('p', { class: 'finding', 'data-testid': 'finding' }, finding(c, player, result, sc.groups, sc.measures))),
    // The overlay and the sliders side by side, the table full width below: at 1440 × 900 the sliders, the overlay
    // and the table's every column are on screen together while the ranking changes (rehearsal 1, issue 3).
    h('div', { class: 'compare-layout' }, h('div', { class: 'compare-lead' }, well, warningBlock), sliders),
    table,
    decide,
  );
  renderShell(
    sc.root,
    { crumbs: [{ label: 'Library', href: href.library() }, { label: c.title, href: href.brief(key) }, { label: 'Plan', href: href.plan(key) }, { label: 'Compare' }], layout: 'focus', primary: start, body },
    null,
  );
}

function noPlan(root: HTMLElement, key: string, c: LoadedCase): void {
  renderShell(
    root,
    {
      crumbs: [{ label: 'Library', href: href.library() }, { label: c.title, href: href.brief(key) }, { label: 'Compare' }],
      body: h(
        'div',
        { class: 'screen' },
        h('div', { class: 'title-row' }, h('h1', {}, `Compare: ${c.title}`), h('p', { class: 'subline' }, 'Plan a route first: Compare checks it against the frontier.')),
        h('a', { class: 'btn btn-primary', href: href.plan(key) }, 'Go to Plan'),
      ),
    },
    'library',
  );
}

export async function renderCompare(root: HTMLElement, key: string): Promise<void> {
  await loadBundled().catch(() => undefined);
  const e = entry(key);
  const c = loadedCase(e);
  if (!e || !c) return notFound(root, key);
  const plan = savedPlan(key);
  if (!plan) return noPlan(root, key, c);
  const graph = graphFor(c);
  const result = await optimize({ caseId: c.id, targetId: plan.targetId }, c);
  const player = playerRoute(graph, plan);
  const frontier = result.kind === 'frontier' ? result : null;
  const measures = visibleMeasures(frontier, player);
  draw({
    root,
    key,
    c,
    graph,
    plan,
    player,
    result,
    groups: frontier ? groupRoutes(c, frontier) : [],
    rank: frontier ? createRanker(frontier) : null,
    measures,
    weights: plan.weights ?? startingWeights(measures.filter((m) => frontier?.routes.some((r) => r.cost[m.key] !== undefined))),
    selected: null,
    note: '',
  });
}
