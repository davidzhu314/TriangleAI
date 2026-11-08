/**
 * Drive — "Where is my tip, and am I pushing on the wall?" (DESIGN.md: Screen inventory; spec §5.4–5.5).
 *
 * The view fills the stage; the HUD floats in its corners: the case panel (vessel, distance to target, fluoro
 * budget, wall force), the controls legend, the route overview, and exit. No honesty line on the Drive HUD.
 *
 * The wire comes only from client/src/wire/select.ts (David). Until that file exists the glob below finds nothing,
 * the screen says driving isn't available yet, and the HUD shows dashes: never a made-up number.
 */
import type { EventLog, LoadedCase, Route, WireFallback, WireSource, WireState } from '../../contracts';
import { buildGraph, routeFor, type RouteGraph } from '../../optimize';
import { ILLUSTRATIVE_CONSTANTS } from '../../score';
import { createDriveView, type DriveView, type DriveViewMode } from '../../render/drive-view';
import { drawCase, svgEl } from '../../render/case-svg';
import { notFound } from '../brief';
import { dash, h } from '../dom';
import { labelled, type IconName } from '../icons';
import { vesselName } from '../plan/warnings';
import { href } from '../router';
import { renderShell } from '../shell';
import { entry, loadBundled, loadedCase, saveDrive, savedPlan, type SavedPlan } from '../store';
import './drive.css';
import { capFluoroAtTarget } from './fluoro-cap';
import { controlFrame, KEY_BINDINGS, padPuff, type PadSnapshot } from './input';
import { mergeControl } from '../../input';
import { createHandsVoice } from '../hands-voice';

type SelectModule = { selectWireSource?: (c: LoadedCase) => Promise<WireSource> };
/** Empty until David adds select.ts; Vite resolves the glob at build time, so a missing file is not an error. */
const SELECT = import.meta.glob<SelectModule>('../../wire/select.ts');

/** Where the Drive screen gets its wire. Null means no wire is available in this build. */
export type WireFactory = (c: LoadedCase) => Promise<WireSource | null>;

/** The app's only wire factory: David's select.ts. The screen never constructs a concrete source itself. */
export const selectTsWireSource: WireFactory = async (c) => {
  const load = SELECT['../../wire/select.ts'];
  const select = load ? (await load()).selectWireSource : undefined;
  return select ? select(c) : null;
};

/** Each fallback reason in words for the trainee (contracts/wire.ts WireFallbackReason). */
export const FALLBACK_WORDS: Readonly<Record<WireFallback['reason'], string>> = {
  socket_failed: 'the connection to the physics process failed',
  socket_stalled: 'the physics process stopped answering',
  server_unavailable: 'the physics process isn\'t running',
};

const FORCE_THRESHOLD = ILLUSTRATIVE_CONSTANTS.find((r) => r.id === 'rail.force_spike');

let teardown: (() => void) | null = null;
export function disposeDrive(): void {
  teardown?.();
  teardown = null;
}

interface Live {
  state: WireState | null;
  fluoroUsedS: number;
  /** The wire has reached the target in this drive: fluoro stops counting (fluoro-cap.ts). */
  reached: boolean;
  lastT: number | null;
  mode: DriveViewMode;
}

const fmt = (v: number, decimals: number): string => v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

function routeOverview(c: LoadedCase, startNode: string | undefined, edges: readonly string[]): { el: HTMLElement; setWire: (points: string) => void } {
  const d = drawCase(c, 'Route overview: the planned route and where the wire is.', 'overview-hatch');
  const plan = svgEl('polyline', { points: d.routePoints(startNode, edges), class: 'route-trace' });
  const wire = svgEl('polyline', { points: '', class: 'wire-line' });
  d.svg.append(plan, wire);
  const el = h('section', { class: 'hud-card hud-overview', 'aria-label': 'Route overview' }, h('p', { class: 'hud-title' }, 'Route overview'), h('div', { class: 'overview-svg' }));
  el.querySelector('.overview-svg')?.append(d.svg);
  return { el, setWire: (points) => wire.setAttribute('points', points) };
}

function noPlan(root: HTMLElement, key: string, c: LoadedCase): void {
  renderShell(
    root,
    {
      crumbs: [{ label: 'Library', href: href.library() }, { label: c.title, href: href.brief(key) }, { label: 'Drive' }],
      body: h(
        'div',
        { class: 'screen' },
        h('div', { class: 'title-row' }, h('h1', {}, `Drive: ${c.title}`), h('p', { class: 'subline' }, 'Plan a route first: the drive follows it.')),
        h('a', { class: 'btn btn-primary', href: href.plan(key) }, 'Go to Plan'),
      ),
    },
    'library',
  );
}

export async function renderDrive(root: HTMLElement, key: string, getWireSource: WireFactory = selectTsWireSource): Promise<void> {
  disposeDrive();
  await loadBundled().catch(() => undefined);
  const e = entry(key);
  const c = loadedCase(e);
  if (!e || !c) return notFound(root, key);
  const plan = savedPlan(key);
  if (!plan) return noPlan(root, key, c);
  mountDrive(root, { key, c, plan, getWireSource });
}

export interface DriveOptions {
  key: string;
  c: LoadedCase;
  plan: SavedPlan;
  /** The app passes selectTsWireSource; tests may inject a real or fake source here. */
  getWireSource: WireFactory;
}

/** Mount the Drive screen for a case and a saved plan. */
export function mountDrive(root: HTMLElement, { key, c, plan, getWireSource }: DriveOptions): void {
  disposeDrive();
  const graph: RouteGraph = buildGraph(c);
  let planned: Route | null = null;
  try {
    planned = routeFor(graph, plan.entryId, plan.targetId, plan.presetId, plan.edges);
  } catch {
    planned = null;
  }
  mount(root, key, c, graph, plan, planned, getWireSource);
}

function mount(root: HTMLElement, key: string, c: LoadedCase, graph: RouteGraph, plan: SavedPlan, planned: Route | null, getWireSource: WireFactory): void {
  const target = c.targets.find((t) => t.id === plan.targetId)?.name ?? plan.targetId;
  const expert = c.difficulty === 'expert';
  const live: Live = { state: null, fluoroUsedS: 0, reached: false, lastT: null, mode: expert ? 'xray' : 'front' };
  const held = new Set<'push' | 'pull' | 'left' | 'right' | 'fluoro'>();
  let puffPending = false;
  let source: WireSource | null = null;

  // ---- view
  // AR (A7): the controller drives through the same step as a gamepad (window animation frames pause in an
  // immersive session), and the HUD's words float beside the model.
  let arStep: (pad: PadSnapshot | null) => void = () => undefined;
  const view: DriveView = createDriveView(c, `Drive view of ${c.title}: the planned route as a ghost trail and the wire. Drag to turn it.`, {
    onFrame: (pad) => arStep(pad),
    panel: () => [...casePanel.querySelectorAll('.hud-row')].map((r) => (r.textContent ?? '').replace(/\s+/g, ' ').trim()),
  });
  const startNode = graph.entries.get(plan.entryId);
  const targetNode = graph.targets.get(plan.targetId);
  const overview = routeOverview(c, startNode, plan.edges);

  // ---- case panel
  const vesselCell = h('dd', { 'data-testid': 'hud-vessel' }, dash('The wire has not started'));
  const distanceCell = h('dd', { class: 'num', 'data-testid': 'hud-distance' }, dash('The wire has not started'), h('span', { class: 'unit' }, ' cm'));
  const budget = c.fluoroBudgetS;
  const fluoroCell = h('dd', { class: 'num', 'data-testid': 'hud-fluoro' }, dash('No fluoro used yet'), h('span', { class: 'unit' }, budget !== undefined ? ` of ${fmt(budget, 0)} s` : ' s'));
  const fluoroBar = h('div', { class: 'meter', role: 'meter', 'aria-label': 'Fluoro budget used', 'aria-valuemin': '0', 'aria-valuemax': String(budget ?? 0), 'aria-valuenow': '0' }, h('span', { class: 'meter-fill' }));
  const threshold = FORCE_THRESHOLD?.value;
  const forceBar = h(
    'div',
    { class: 'meter meter-force', role: 'meter', 'aria-label': 'Wall force', 'aria-valuemin': '0', 'aria-valuemax': String((threshold ?? 0) * 2), 'aria-valuenow': '0' },
    h('span', { class: 'meter-fill' }),
    threshold !== undefined ? h('span', { class: 'meter-tick', title: `${FORCE_THRESHOLD?.label}: ${threshold} ${FORCE_THRESHOLD?.unit} (illustrative)` }) : null,
  );
  const forceCell = h('dd', { class: 'num', 'data-testid': 'hud-force' }, dash('The wire has not started'), h('span', { class: 'unit' }, ' N'));
  const casePanel = h(
    'section',
    { class: 'hud-card hud-case', 'aria-label': 'Case and wire' },
    h('p', { class: 'hud-title' }, 'Training case (not a patient)'),
    h(
      'dl',
      { class: 'hud-rows' },
      h('div', { class: 'hud-row' }, h('dt', {}, 'Current vessel'), vesselCell),
      h('div', { class: 'hud-row' }, h('dt', {}, `Distance to the ${target}`), distanceCell),
      h('div', { class: 'hud-row hud-row-stack' }, h('div', { class: 'hud-row-line' }, h('dt', {}, 'Fluoro used'), fluoroCell), fluoroBar),
      h(
        'div',
        { class: 'hud-row hud-row-stack' },
        h('div', { class: 'hud-row-line' }, h('dt', {}, 'Wall force ', h('span', { class: 'illustrative' }, '(illustrative)')), forceCell),
        forceBar,
        threshold !== undefined ? h('p', { class: 'hud-note' }, 'The mark is the force-spike threshold, ', h('span', { class: 'num' }, fmt(threshold, 1)), ' N.') : null,
      ),
    ),
  );

  // ---- controls legend: one row per control, as in the mockup; each key chip is also a press-and-hold button
  const keyButton = (key: string, name: string, control: 'push' | 'pull' | 'left' | 'right' | 'fluoro' | 'puff'): HTMLButtonElement => {
    const b = h('button', { type: 'button', class: 'kbd key-button', 'aria-pressed': 'false', 'aria-keyshortcuts': key === 'Space' ? 'Space' : key, 'aria-label': `${name} (${key})`, 'data-control': control }, key);
    const down = (ev: Event): void => {
      ev.preventDefault();
      if (control === 'puff') return triggerPuff();
      held.add(control);
      sync();
    };
    const up = (): void => {
      if (control === 'puff') return;
      held.delete(control);
      sync();
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointerleave', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('keydown', (ev) => {
      if ((ev.key === 'Enter' || ev.key === ' ') && control === 'puff') {
        ev.preventDefault();
        triggerPuff();
      }
    });
    return b;
  };
  const controlRow = (icon: IconName, label: string, ...keys: HTMLButtonElement[]): HTMLElement =>
    h('div', { class: 'control-row' }, labelled(icon, label), h('div', { class: 'control-keys' }, keys));
  const controls = h(
    'section',
    { class: 'hud-card hud-controls', 'aria-label': 'Controls' },
    h('p', { class: 'hud-title' }, 'Controls'),
    controlRow('push-pull', 'Push / pull', keyButton('W', 'Push', 'push'), keyButton('S', 'Pull', 'pull')),
    controlRow('rotate', 'Rotate', keyButton('A', 'Rotate left', 'left'), keyButton('D', 'Rotate right', 'right')),
    controlRow('fluoro', 'Hold for fluoro', keyButton('Space', 'Hold for fluoro', 'fluoro')),
    controlRow('contrast-puff', 'Contrast puff', keyButton('C', 'Contrast puff', 'puff')),
    h('p', { class: 'hud-note' }, 'Hold a key, or press and hold its button. Gamepad: sticks push and rotate, right trigger for fluoro, A for contrast.'),
  );

  // ---- top: view label, view switch, banner
  const modeLabel = h('p', { class: 'drive-mode', 'data-testid': 'drive-mode' });
  const viewSwitch = h(
    'div',
    { class: 'segmented', role: 'group', 'aria-label': 'View' },
    ...(['front', 'xray'] as const).map((m) => {
      const b = h('button', { type: 'button', class: 'segment', 'aria-pressed': String(live.mode === m), 'data-view': m }, m === 'front' ? 'Front view' : 'X-ray');
      b.addEventListener('click', () => {
        live.mode = m;
        for (const s of viewSwitch.querySelectorAll<HTMLElement>('.segment')) s.setAttribute('aria-pressed', String(s.dataset['view'] === m));
        sync();
      });
      return b;
    }),
  );
  const banner = h('p', { class: 'drive-banner', role: 'status', 'aria-live': 'polite', 'data-testid': 'drive-banner' });
  /** The fallback notice stays up for the rest of the drive (DESIGN.md: notices never stop the drive). */
  const notice = h('p', { class: 'drive-banner', role: 'status', 'aria-live': 'polite', 'data-testid': 'drive-notice' });
  // Hands-free (integration/hands-voice): the hand pushes and rotates through the same frame as the keys, and any
  // key pressed wins (mergeControl); voice zooms. Off until the trainee turns it on.
  const hands = createHandsVoice({
    host: view.element,
    actions: ['zoom_in', 'zoom_out'],
    onVoice: (a) => (view.zoom(a === 'zoom_in' ? 0.75 : 1.33) ? null : 'Zoom works in the 3D view.'),
  });
  const top = h('div', { class: 'hud-top' }, h('div', { class: 'hud-top-row' }, modeLabel, expert ? h('span', { class: 'pill pill-neutral' }, 'Expert: X-ray only') : viewSwitch, view.toolbar, hands.controls), notice, banner);

  // ---- bottom right
  const restart = h('button', { type: 'button', class: 'btn btn-secondary' }, 'Restart');
  restart.addEventListener('click', () => void start());
  const exit = h('a', { class: 'btn btn-secondary', href: href.brief(key) }, 'Exit to case');
  const finish = h('button', { type: 'button', class: 'btn btn-primary', hidden: true, 'data-testid': 'finish-drive' }, 'Finish drive');
  finish.addEventListener('click', () =>
    void stopAndSave().then((saved) => {
      if (!saved) return;
      setBanner('Drive saved. Opening Results.', 'neutral');
      location.hash = href.results(key);
    }),
  );
  const actions = h('div', { class: 'hud-actions' }, restart, exit, finish);

  const stage = h('div', { class: 'drive-stage', 'data-testid': 'drive-stage' }, h('div', { class: 'drive-canvas' }, view.element), top, h('div', { class: 'hud-left' }, casePanel, controls), overview.el, actions);
  const body = h('div', { class: 'drive' }, h('h1', { class: 'visually-hidden' }, `Drive: ${c.title}`), stage);
  renderShell(root, { crumbs: [{ label: 'Library', href: href.library() }, { label: c.title, href: href.brief(key) }, { label: 'Drive' }], layout: 'focus', body }, null);

  // ---- state → screen
  function setBanner(text: string, tone: 'warning' | 'negative' | 'neutral' | null): void {
    banner.textContent = text;
    banner.className = tone ? `drive-banner drive-banner-${tone}` : 'drive-banner';
  }

  function sync(): void {
    const s = live.state;
    for (const b of controls.querySelectorAll<HTMLElement>('[data-control]')) {
      const k = b.dataset['control'] as 'push' | 'pull' | 'left' | 'right' | 'fluoro' | 'puff';
      b.setAttribute('aria-pressed', String(k !== 'puff' && held.has(k)));
    }
    const fluoroOn = s ? s.fluoro : held.has('fluoro');
    view.update({ mode: live.mode, plan: { startNode, edges: plan.edges }, wire: s?.wire ?? [], tip: s?.tip ?? null, fluoro: fluoroOn, dim: c.difficulty === 'intermediate', entryNode: startNode, targetNode });
    // The wire's own state says which mode is driving: after a fallback it reports rail.
    const wireMode = s?.mode ?? fellBackTo ?? source?.mode;
    modeLabel.textContent = `${live.mode === 'front' ? 'Front view' : 'X-ray'} · ${wireMode ? `${wireMode} mode` : 'wire not connected'}`;
    finish.hidden = !(s?.atTarget && source);
    if (!s) return;
    vesselCell.textContent = vesselName(c, s.edge);
    const remaining = planned ? Math.max(0, planned.cost.lengthM - s.s) : null;
    distanceCell.replaceChildren(remaining === null ? dash('No planned length') : fmt(remaining * 100, 1), h('span', { class: 'unit' }, ' cm'));
    fluoroCell.replaceChildren(fmt(live.fluoroUsedS, 1), h('span', { class: 'unit' }, budget !== undefined ? ` of ${fmt(budget, 0)} s` : ' s'));
    if (budget) {
      fluoroBar.style.setProperty('--fill', String(Math.min(1, live.fluoroUsedS / budget)));
      fluoroBar.setAttribute('aria-valuenow', fmt(live.fluoroUsedS, 1));
      fluoroBar.classList.toggle('meter-over', live.fluoroUsedS > budget);
    }
    forceCell.replaceChildren(fmt(s.contactForceN, 2), h('span', { class: 'unit' }, ' N'));
    if (threshold) {
      forceBar.style.setProperty('--fill', String(Math.min(1, s.contactForceN / (threshold * 2))));
      forceBar.setAttribute('aria-valuenow', fmt(s.contactForceN, 2));
      forceBar.classList.toggle('meter-over', s.contactForceN > threshold);
    }
    overview.setWire(s.wire.map((p) => `${(p[0] * 1000).toFixed(2)},${(-p[1] * 1000).toFixed(2)}`).join(' '));
    const offRoute = !plan.edges.includes(s.edge);
    if (s.atTarget) setBanner(`The wire reached the ${target}.`, 'neutral');
    else if (threshold !== undefined && s.contactForceN > threshold) setBanner('Wall force over the threshold. Ease off and rotate.', 'warning');
    else if (offRoute) setBanner(`Off the planned route: the tip is in the ${vesselName(c, s.edge)}. Pull back and rotate toward the planned branch.`, 'warning');
    else if (budget !== undefined && live.fluoroUsedS > budget) setBanner('Fluoro is over this case\'s budget.', 'warning');
    else if (banner.classList.contains('drive-banner-warning')) setBanner('', null);
  }

  function triggerPuff(): void {
    puffPending = true;
    view.puff();
  }

  // ---- input
  const onKey = (down: boolean) => (ev: KeyboardEvent): void => {
    const target = ev.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    const control = KEY_BINDINGS[ev.code];
    if (!control) return;
    if (control === 'fluoro' || target?.tagName !== 'BUTTON') ev.preventDefault();
    if (control === 'puff') {
      if (down && !ev.repeat) triggerPuff();
      return;
    }
    if (down) held.add(control);
    else held.delete(control);
    sync();
  };
  const keydown = onKey(true);
  const keyup = onKey(false);
  const blur = (): void => {
    held.clear();
    sync();
  };
  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);
  window.addEventListener('blur', blur);

  let lastPad: PadSnapshot | null = null;
  let raf = 0;
  const step = (pad: PadSnapshot | null): void => {
    if (padPuff(lastPad, pad)) triggerPuff();
    lastPad = pad;
    const keys = controlFrame(held, pad, puffPending);
    const g = hands.gesture();
    const frame = g ? mergeControl(g, keys) : keys;
    puffPending = false;
    source?.control(frame);
  };
  arStep = step;
  const tick = (): void => {
    const gp = typeof navigator.getGamepads === 'function' ? [...navigator.getGamepads()].find((g) => g) : null;
    step(gp ? { axes: [...gp.axes], buttons: gp.buttons.map((b) => b.value) } : null);
    raf = requestAnimationFrame(tick);
  };

  let unsubscribe: (() => void)[] = [];
  let fellBackTo: 'rail' | null = null;

  /** End the drive and keep its EventLog with the plan and weights for Results (A6). Scores are not computed here. */
  async function stopAndSave(): Promise<boolean> {
    const running = source;
    if (!running || !live.state) return false;
    source = null;
    unsubscribe.forEach((u) => u());
    unsubscribe = [];
    const log = await running.stop().catch(() => null);
    if (!log) return false;
    saveDrive(key, { plan, log: capFluoroAtTarget(log) }); // fluoro after the target is not counted, as on the HUD
    sync();
    return true;
  }

  async function start(): Promise<void> {
    unsubscribe.forEach((u) => u());
    unsubscribe = [];
    if (source) await source.stop().catch(() => undefined); // a restart discards the unfinished drive
    source = null;
    live.state = null;
    live.fluoroUsedS = 0;
    live.reached = false;
    live.lastT = null;
    fellBackTo = null;
    notice.textContent = '';
    notice.className = 'drive-banner';
    const next = await getWireSource(c);
    if (!next) {
      setBanner('Driving isn\'t available yet in this build. The view shows your planned route.', 'neutral');
      sync();
      return;
    }
    source = next;
    unsubscribe.push(
      next.onState((s) => {
        // Fluoro counts up to the state that reaches the target, then stops (the saved log is capped the same way).
        if (live.lastT !== null && s.fluoro && !live.reached) live.fluoroUsedS += Math.max(0, s.t - live.lastT);
        live.reached ||= s.atTarget;
        live.lastT = s.t;
        live.state = s;
        sync();
      }),
      next.onFallback((f) => {
        fellBackTo = f.to;
        notice.textContent = `The ${f.from} wire stopped because ${FALLBACK_WORDS[f.reason]}. The drive starts again from the entry in rail mode.`;
        notice.className = 'drive-banner drive-banner-warning';
        sync();
      }),
    );
    setBanner('', null);
    await next.start({ case: c, entryId: plan.entryId, targetId: plan.targetId, presetId: plan.presetId, path: plan.edges });
    sync();
  }

  raf = requestAnimationFrame(tick);
  sync();
  void start();

  teardown = (): void => {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('keyup', keyup);
    window.removeEventListener('blur', blur);
    void stopAndSave(); // leaving mid-drive keeps what was driven
    unsubscribe.forEach((u) => u());
    hands.dispose();
    view.dispose();
  };
}
