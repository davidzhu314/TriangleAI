/**
 * Plan — "Is my route feasible, and what does it cost?" (DESIGN.md: Screen inventory).
 * Builder canvas: a palette panel (entry, target, wire, and the keyboard path), the view as a well, and the live
 * cost panel, the screen's largest readout. The engine decides everything: buildGraph once per case, routeFor on
 * every change. Nothing here knows any case's ids.
 */
import type { LoadedCase, Route, WirePreset, WirePresetId } from '../../contracts';
import './plan.css';
import { buildGraph, defaultWeights, optimize, planAssist, WIRE_PRESETS, type RouteGraph } from '../../optimize';
import { cathyFacts, planAssistLine, type CathyFacts } from '../../score';
import { planCheckLine } from '../../score/live';
import { planMarks } from '../../score/plan-marks';
import { measureRoute } from '../../optimize/measure-route';
import type { VoiceAction, VoiceMatch } from '../../input';
import { createHandsVoice, zoomToAnswer, type HandsVoice } from '../hands-voice';
import { createPlanView, type PlanView } from '../../render/plan-view';
import { anatomyFor } from '../body-context';
import { notFound } from '../brief';
import { dash, h } from '../dom';
import { entryIcon, labelled, type IconName } from '../icons';
import { href } from '../router';
import { renderShell } from '../shell';
import { entry, loadBundled, loadedCase, savePlan, savedPlan } from '../store';
import { COST_ROWS, formatCost, FORMULA_TEXT } from './cost-rows';
import { choose, clear, endNode, evaluate, extendTo, isComplete, nextSteps, undo, type RouteState } from './route-state';
import { vesselName, warningsFor, type PlanWarning } from './warnings';

const PRESET_ICON: Record<WirePresetId, IconName> = {
  soft_angled: 'preset-soft-angled',
  standard_j: 'preset-standard-j',
  stiff_straight: 'preset-stiff-straight',
};

const graphs = new WeakMap<LoadedCase, RouteGraph>();
const graphFor = (c: LoadedCase): RouteGraph => {
  let g = graphs.get(c);
  if (!g) graphs.set(c, (g = buildGraph(c)));
  return g;
};

/** The view of the screen currently shown, disposed when the screen re-renders or the route changes. */
let liveView: PlanView | null = null;
/** The view is kept across redraws of the same case, so the 3D camera stays where the player turned it. */
let liveCase: LoadedCase | null = null;
let pickNow: (node: string) => void = () => undefined;
let panelLines: string[] = [];
/** Hands-free input for the live view: kept and disposed with it. */
let liveHands: HandsVoice | null = null;
/** The current route for voice answers (updated on every redraw, like pickNow). */
let voiceNow: (action: VoiceAction, match?: VoiceMatch) => Promise<string | null> = async () => null;
export function disposePlanView(): void {
  liveHands?.dispose();
  liveHands = null;
  liveView?.dispose();
  liveView = null;
  liveCase = null;
}

/** Cathy's answer for the route so far, from the engine (planAssist, planAssistLine): never a model's numbers. */
async function assistLine(c: LoadedCase, graph: RouteGraph, s: RouteState, ask: 'best' | 'options'): Promise<string> {
  const optimized = await optimize({ caseId: c.id, targetId: s.targetId }, c);
  const weights = defaultWeights(optimized.kind === 'frontier' ? optimized.candidates : []);
  const assist = planAssist({ optimized, weights, entryId: s.entryId, presetId: s.presetId, routeSoFar: s.edges, graph });
  return planAssistLine(assist, c, s.targetId, ask).text;
}

/** "Is this right" (G5): the route's first problem edge (planMarks), else the best way on. Engine only. */
async function checkLine(c: LoadedCase, graph: RouteGraph, s: RouteState): Promise<string> {
  const optimized = await optimize({ caseId: c.id, targetId: s.targetId }, c);
  const weights = defaultWeights(optimized.kind === 'frontier' ? optimized.candidates : []);
  const assist = planAssist({ optimized, weights, entryId: s.entryId, presetId: s.presetId, routeSoFar: s.edges, graph });
  let measures = null;
  try {
    const startNode = graph.entries.get(s.entryId);
    measures = s.edges.length > 0 ? measureRoute(graph, s.edges, startNode === undefined ? {} : { startNode }) : null;
  } catch {
    measures = null; // a route that doesn't chain: no crossings to mark
  }
  const marks = planMarks({ routeSoFar: s.edges, measures, optimized, entryId: s.entryId, presetId: s.presetId, graph });
  return planCheckLine(marks, assist, c, s.targetId).text;
}

/**
 * The engine's facts on Plan now, for Cathy's AI wording (G5): the same pieces the "best next" and "is this right"
 * answers use (planAssist, planMarks, the route's measures), plus their template lines. Engine only.
 */
async function planFacts(c: LoadedCase, graph: RouteGraph, s: RouteState): Promise<CathyFacts> {
  const optimized = await optimize({ caseId: c.id, targetId: s.targetId }, c);
  const weights = defaultWeights(optimized.kind === 'frontier' ? optimized.candidates : []);
  const assist = planAssist({ optimized, weights, entryId: s.entryId, presetId: s.presetId, routeSoFar: s.edges, graph });
  let measures = null;
  try {
    const startNode = graph.entries.get(s.entryId);
    measures = s.edges.length > 0 ? measureRoute(graph, s.edges, startNode === undefined ? {} : { startNode }) : null;
  } catch {
    measures = null;
  }
  const marks = planMarks({ routeSoFar: s.edges, measures, optimized, entryId: s.entryId, presetId: s.presetId, graph });
  const lines = [planAssistLine(assist, c, s.targetId, 'best'), planAssistLine(assist, c, s.targetId, 'options'), planCheckLine(marks, assist, c, s.targetId)];
  return cathyFacts({ screen: 'plan', case: c, targetId: s.targetId, entryId: s.entryId, presetId: s.presetId, weights, optimized, lines, routeSoFar: s.edges, measures, assist, marks });
}

function presetOf(id: WirePresetId): WirePreset {
  return WIRE_PRESETS.find((p) => p.id === id) ?? WIRE_PRESETS[0]!;
}

function radioGroup<T extends string>(name: string, legend: string, options: { value: T; label: Node; disabled?: boolean; note?: Node | null }[], current: T, onChange: (v: T) => void): HTMLFieldSetElement {
  const set = h('fieldset', { class: 'choice' }, h('legend', {}, legend));
  for (const o of options) {
    const input = h('input', { type: 'radio', name, value: o.value, checked: o.value === current, disabled: !!o.disabled });
    input.addEventListener('change', () => onChange(o.value));
    set.append(h('label', { class: o.disabled ? 'choice-option choice-disabled' : 'choice-option' }, input, h('span', { class: 'choice-text' }, o.label, o.note ?? null)));
  }
  return set;
}

function stepLabel(c: LoadedCase, graph: RouteGraph, edgeId: string, node: string): string {
  for (const [targetId, targetNode] of graph.targets) {
    if (targetNode === node) return `To ${c.targets.find((t) => t.id === targetId)?.name ?? targetId}`;
  }
  return `Along the ${vesselName(c, edgeId)} to the next branch point`;
}

function warningItem(w: PlanWarning, first: boolean): HTMLElement {
  const pill = w.level === 'blocked' ? 'warning-blocked' : 'warning-risk';
  const icon: IconName | null = w.tier === 'forbidden' ? 'risk-forbidden' : w.tier === 'heavy' ? 'risk-heavy' : w.tier === 'proximity' ? 'risk-proximity' : null;
  const body = icon ? labelled(icon, w.text) : h('span', {}, w.text);
  return h('li', { class: `plan-warning ${pill}${first ? ' plan-warning-first' : ''}`, 'data-level': w.level }, body);
}

function costTable(route: Route | null): HTMLElement {
  return h(
    'dl',
    { class: 'cost-table', 'data-testid': 'cost-table' },
    COST_ROWS.map((row) => {
      const f = formatCost(row, route?.cost);
      const tip = `${FORMULA_TEXT[row.formulaRef] ?? ''}${row.illustrative ? ' Illustrative.' : ''}`.trim();
      return h(
        'div',
        { class: 'cost-row', 'data-measure': row.key },
        h('dt', {}, row.label, row.illustrative ? h('span', { class: 'illustrative' }, ' (illustrative)') : null),
        h(
          'dd',
          {},
          h(
            'span',
            { class: 'tip', tabindex: '0', 'data-tip': tip, 'aria-label': `${row.label}: ${f.value ?? 'not measured yet'}${f.unit ? ` ${f.unit}` : ''}. ${tip}` },
            f.value === null ? dash('Not measured yet') : h('span', { class: 'figure num' }, f.value, f.unit ? h('span', { class: 'unit' }, ` ${f.unit}`) : null),
          ),
        ),
      );
    }),
  );
}

function verdict(c: LoadedCase, graph: RouteGraph, s: RouteState, route: Route | null): HTMLElement {
  const target = c.targets.find((t) => t.id === s.targetId)?.name ?? s.targetId;
  const preset = presetOf(s.presetId).name;
  if (!s.edges.length) return h('p', { class: 'verdict' }, `Start at the entry and click a branch point, or use the list of next steps.`);
  if (!isComplete(graph, s)) return h('p', { class: 'verdict' }, `Route not finished: keep going to the ${target}.`);
  if (route?.feasible) return h('p', { class: 'verdict verdict-ok', 'data-testid': 'verdict' }, `Reaches the ${target}. Feasible with the ${preset} wire.`);
  return h('p', { class: 'verdict verdict-blocked', 'data-testid': 'verdict' }, `Reaches the ${target}, but not feasible with the ${preset} wire.`);
}

interface Screen {
  root: HTMLElement;
  key: string;
  c: LoadedCase;
  graph: RouteGraph;
  state: RouteState;
  paletteOpen: boolean;
}

function initialState(key: string, c: LoadedCase, graph: RouteGraph): RouteState {
  const saved = savedPlan(key);
  if (saved && graph.entries.has(saved.entryId) && graph.targets.has(saved.targetId)) return { ...saved };
  const reachable = c.targets.find((t) => t.reachable) ?? c.targets[0];
  return { entryId: c.entries[0]?.id ?? '', targetId: reachable?.id ?? '', presetId: WIRE_PRESETS[0]!.id, edges: [] };
}

function draw(sc: Screen): void {
  const { c, graph, key } = sc;
  const s = sc.state;
  const route = evaluate(graph, s);
  const preset = presetOf(s.presetId);
  const warnings = warningsFor(c, route, preset);
  const complete = isComplete(graph, s);
  const steps = nextSteps(graph, s);
  const set = (next: RouteState): void => {
    sc.state = next;
    draw(sc);
  };

  // ---- palette: entry, target, wire, and the keyboard path
  const palette = h(
    'section',
    { class: sc.paletteOpen ? 'plan-palette palette-open' : 'plan-palette', 'aria-labelledby': 'palette-heading', id: 'plan-palette' },
    h('div', { class: 'palette-head' }, h('h2', { id: 'palette-heading' }, 'Route setup'), h('button', { type: 'button', class: 'btn btn-secondary palette-done' }, 'Done')),
    radioGroup(
      'entry',
      c.entries.length === 1 ? 'Entry site' : 'Entry sites',
      c.entries.map((e) => {
        const icon = entryIcon(e.id);
        return { value: e.id, label: icon ? labelled(icon, e.name) : h('span', {}, e.name) };
      }),
      s.entryId,
      (v) => set(choose(s, { entryId: v })),
    ),
    radioGroup(
      'target',
      'Target',
      c.targets.map((t) => ({ value: t.id, label: labelled('target', t.name), disabled: !t.reachable, note: t.reachable ? null : h('span', { class: 'pill pill-neutral' }, 'Unreachable') })),
      s.targetId,
      (v) => set(choose(s, { targetId: v })),
    ),
    radioGroup(
      'preset',
      'Wire (illustrative presets)',
      WIRE_PRESETS.map((p) => ({
        value: p.id,
        label: labelled(PRESET_ICON[p.id], p.name),
        note: h('span', { class: 'choice-note', title: 'Illustrative value (spec §4.3)' }, 'Turns up to ', h('span', { class: 'num' }, String(p.maxTurnDeg)), '°'),
      })),
      s.presetId,
      (v) => set(choose(s, { presetId: v })),
    ),
    h(
      'div',
      { class: 'steps', role: 'group', 'aria-labelledby': 'steps-heading' },
      h('h3', { id: 'steps-heading' }, 'Next step'),
      steps.length
        ? h(
            'ul',
            { class: 'step-list', 'data-testid': 'next-steps' },
            steps.map((st) => {
              const b = h('button', { type: 'button', class: 'btn btn-secondary step-button' }, stepLabel(c, graph, st.edgeId, st.node));
              b.addEventListener('click', () => {
                const next = extendTo(graph, s, st.node);
                if (next) set(next);
              });
              return h('li', {}, b);
            }),
          )
        : h('p', { class: 'muted' }, complete ? 'The route reaches the target.' : 'No branch point left to reach from here.'),
      h(
        'div',
        { class: 'actions' },
        (() => {
          const b = h('button', { type: 'button', class: 'btn btn-secondary', disabled: !s.edges.length }, 'Undo last step');
          b.addEventListener('click', () => set(undo(s)));
          return b;
        })(),
        (() => {
          const b = h('button', { type: 'button', class: 'btn btn-secondary', disabled: !s.edges.length }, 'Clear route');
          b.addEventListener('click', () => set(clear(s)));
          return b;
        })(),
      ),
    ),
  );
  palette.querySelector('.palette-done')?.addEventListener('click', () => {
    sc.paletteOpen = false;
    draw(sc);
  });

  // ---- view
  pickNow = (node) => {
    const next = extendTo(graph, sc.state, node);
    if (next) set(next);
  };
  // The AR cost panel (A7): the same rows as the readout, in words, from the cost vector.
  panelLines = [
    'Route cost',
    ...COST_ROWS.map((row) => {
      const f = formatCost(row, route?.cost);
      return `${row.label}: ${f.value === null ? '—' : `${f.value}${f.unit ? ` ${f.unit}` : ''}`}`;
    }),
    ...(warnings[0] ? [warnings[0].text] : []),
  ];
  voiceNow = async (action, match) => {
    if (action === 'zoom_to') return zoomToAnswer(c, match, (edges) => liveView?.zoomTo(edges) ?? false);
    if (action === 'zoom_in' || action === 'zoom_out') {
      return liveView?.zoom(action === 'zoom_in' ? 0.75 : 1.33) ? null : 'Zoom works in the 3D view.';
    }
    if (action === 'assist_check') return checkLine(c, graph, sc.state);
    if (action === 'assist_best_next' || action === 'assist_options') return assistLine(c, graph, sc.state, action === 'assist_best_next' ? 'best' : 'options');
    if (action === 'hide_labels' || action === 'show_labels') {
      if (liveView?.bodyContext()) return 'No vessel names on this case.';
      return liveView?.setLabels(action === 'show_labels') ? null : 'Names show in the 3D view with Anatomy on.';
    }
    if (action === 'reset_view') {
      liveView?.resetView();
      return null;
    }
    if (action === 'undo') {
      // Exactly the Undo button: the same call, and nothing when it would be disabled.
      if (!sc.state.edges.length) return 'Nothing to undo yet.';
      set(undo(sc.state));
      return null;
    }
    return null;
  };
  if (!liveView || liveCase !== c) {
    disposePlanView();
    const created = createPlanView(c, (node) => pickNow(node), { panel: () => panelLines }, anatomyFor(entry(key), c));
    liveView = created;
    liveCase = c;
    // Hands-free: the pointer hovers in the view, and a pinch picks the branch point under it, like a click.
    liveHands = createHandsVoice({
      facts: () => planFacts(c, graph, sc.state),
      host: created.element,
      actions: ['zoom_in', 'zoom_out', 'zoom_to', 'reset_view', 'hide_labels', 'show_labels', 'assist_best_next', 'assist_options', 'assist_check', 'undo'],
      onPan: (dx, dy, roll) => created.pan(dx, dy, roll),
      onVoice: (a, m) => voiceNow(a, m),
      onGesture: (g) => {
        if (!g?.select || !g.pointer) return;
        const node = created.pickAt(g.pointer.x, g.pointer.y);
        if (node) pickNow(node);
      },
    });
    created.toolbar.append(liveHands.controls);
  }
  const view = liveView;
  view.update({ routeEdges: s.edges, pickable: steps.map((x) => x.node), entryNode: graph.entries.get(s.entryId), targetNode: graph.targets.get(s.targetId) });
  const well = h('section', { class: 'plan-well', 'aria-label': 'Case view' }, view.element);

  // ---- cost panel: the largest readout, first warning on top
  const [first, ...rest] = warnings;
  const readout = h(
    'section',
    { class: 'plan-readout', 'aria-labelledby': 'readout-heading', 'data-testid': 'cost-panel' },
    h('h2', { id: 'readout-heading' }, 'Route cost'),
    first ? h('ul', { class: 'warning-list', 'data-testid': 'first-warning' }, warningItem(first, true)) : null,
    verdict(c, graph, s, route),
    costTable(route),
    rest.length ? h('ul', { class: 'warning-list', 'data-testid': 'more-warnings' }, rest.map((w) => warningItem(w, false))) : null,
  );

  const paletteToggle = h('button', { type: 'button', class: 'btn btn-secondary palette-toggle', 'aria-controls': 'plan-palette', 'aria-expanded': String(sc.paletteOpen) }, `Route setup: ${preset.name}`);
  paletteToggle.addEventListener('click', () => {
    sc.paletteOpen = true;
    draw(sc);
  });

  const compare = h('button', { type: 'button', class: 'btn btn-primary', disabled: !complete, 'data-testid': 'compare' }, 'Compare routes');
  compare.addEventListener('click', () => {
    if (!isComplete(graph, sc.state)) return;
    savePlan(key, { ...sc.state, edges: [...sc.state.edges] });
    location.hash = href.compare(key);
  });

  const body = h(
    'div',
    { class: 'plan' },
    h('h1', { class: 'visually-hidden' }, `Plan: ${c.title}`),
    h('div', { class: 'plan-layout' }, palette, well, paletteToggle, readout),
  );
  renderShell(
    sc.root,
    { crumbs: [{ label: 'Library', href: href.library() }, { label: c.title, href: href.brief(key) }, { label: 'Plan' }], layout: 'focus', primary: compare, body },
    null,
  );
  const end = endNode(graph, s);
  sc.root.querySelector('.plan')?.setAttribute('data-route-end', end ?? '');
}

export async function renderPlan(root: HTMLElement, key: string): Promise<void> {
  await loadBundled().catch(() => undefined);
  const e = entry(key);
  const c = loadedCase(e);
  if (!e || !c) return notFound(root, key);
  const graph = graphFor(c);
  draw({ root, key, c, graph, state: initialState(key, c, graph), paletteOpen: false });
}
