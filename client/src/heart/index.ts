/**
 * Heart — "What does this heart look like, part by part?" The 3D heart is the work surface and the largest block; the
 * part list beside it names every mesh in the model and shows or hides it.
 *
 * This module is the Heart tab's chunk: ui/app.ts imports it only when the tab is opened, and the viewer (three.js and
 * the GLB) loads after the page is drawn, behind a progress state. Hearts are built offline by tools/heartgen and
 * listed in client/public/hearts/index.json; every word about a part comes from the GLB's extras.
 */
import '../render/render.css';
import { webglAvailable } from '../render/tokens';
import { h, replace } from '../ui/dom';
import { href } from '../ui/router';
import { honestyLine, renderShell } from '../ui/shell';
import './heart.css';
import { DEFAULT_LIGHTING, DEFAULT_MODE, GROUPS, HEARTS_URL, isLighting, isMode, LIGHTINGS, MODES, type HeartEntry, type HeartIndex, type HeartPart, type LightingId, type ViewMode } from './parts';
import type { HeartViewer } from './viewer';

let viewer: HeartViewer | null = null;
/** Bumped on every render and on leaving, so a load that finishes late is dropped. */
let generation = 0;

export function disposeHeart(): void {
  generation++;
  viewer?.dispose();
  viewer = null;
}

// ---------------------------------------------------------------- small things remembered for the session

const storeKey = (id: string): string => `threadsim.heart.v1.${id}`;

function readHidden(id: string): Set<string> {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(storeKey(id)) ?? 'null');
    const hidden = saved && typeof saved === 'object' ? (saved as { hidden?: unknown }).hidden : null;
    return new Set(Array.isArray(hidden) ? hidden.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeHidden(id: string, hidden: Set<string>): void {
  try {
    sessionStorage.setItem(storeKey(id), JSON.stringify({ hidden: [...hidden] }));
  } catch {
    // Nothing depends on it.
  }
}

/** The lighting version is a taste, not a fact about one heart: kept per browser, for every heart. */
const LIGHTING_KEY = 'threadsim.heart.lighting.v1';

function readLighting(): LightingId {
  try {
    const saved = localStorage.getItem(LIGHTING_KEY);
    return isLighting(saved) ? saved : DEFAULT_LIGHTING;
  } catch {
    return DEFAULT_LIGHTING;
  }
}

function writeLighting(id: LightingId): void {
  try {
    localStorage.setItem(LIGHTING_KEY, id);
  } catch {
    // Nothing depends on it.
  }
}

// ---------------------------------------------------------------- pieces

/** "Light: Studio | Soft | Contrast | Overhead", the same segmented control as the case views' switches. */
function lightingSwitch(v: HeartViewer, current: LightingId): HTMLElement {
  const segments = LIGHTINGS.map((l) => {
    const b = h('button', { type: 'button', class: 'segment', 'aria-pressed': String(l.id === current), title: l.hint, 'data-lighting': l.id }, l.label);
    b.addEventListener('click', () => {
      v.setLighting(l.id);
      writeLighting(l.id);
      for (const s of segments) s.setAttribute('aria-pressed', String(s === b));
    });
    return b;
  });
  return h('div', { class: 'heart-lighting' }, h('span', { class: 'label', id: 'heart-lighting-label' }, 'Light'), h('div', { class: 'segmented', role: 'group', 'aria-labelledby': 'heart-lighting-label' }, segments));
}

const modeKey = (id: string): string => `threadsim.heart.mode.v1.${id}`;

/** The view mode is kept per heart for the session, like the hidden parts. */
function readMode(id: string): ViewMode {
  try {
    const saved = sessionStorage.getItem(modeKey(id));
    return isMode(saved) ? saved : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

function writeMode(id: string, mode: ViewMode): void {
  try {
    sessionStorage.setItem(modeKey(id), mode);
  } catch {
    // Nothing depends on it.
  }
}

/** "View: Solid | See-through | X-ray". `onMode` also tells the page, so the well and swatches follow the X-ray look. */
function modeSwitch(v: HeartViewer, heartId: string, current: ViewMode, onMode: (mode: ViewMode) => void): HTMLElement {
  const segments = MODES.map((m) => {
    const b = h('button', { type: 'button', class: 'segment', 'aria-pressed': String(m.id === current), title: m.hint, 'data-mode-choice': m.id }, m.label);
    b.addEventListener('click', () => {
      v.setMode(m.id);
      writeMode(heartId, m.id);
      onMode(m.id);
      for (const s of segments) s.setAttribute('aria-pressed', String(s === b));
    });
    return b;
  });
  return h('div', { class: 'heart-lighting' }, h('span', { class: 'label', id: 'heart-mode-label' }, 'View'), h('div', { class: 'segmented', role: 'group', 'aria-labelledby': 'heart-mode-label' }, segments));
}

async function loadIndex(): Promise<HeartEntry[]> {
  const res = await fetch(`${HEARTS_URL}index.json`);
  if (!res.ok) throw new Error(`index.json: ${res.status}`);
  const index = (await res.json()) as HeartIndex;
  return Array.isArray(index.hearts) ? index.hearts : [];
}

/** A state inside the stage that is not the heart: loading, or a plain sentence and a next step. */
function stageMessage(title: string, detail: string, action?: HTMLElement): HTMLElement {
  return h('div', { class: 'heart-message', role: 'status' }, h('h2', {}, title), h('p', { class: 'muted' }, detail), action ?? null);
}

function partList(heart: HeartEntry, parts: readonly HeartPart[], v: HeartViewer): HTMLElement {
  const hidden = readHidden(heart.id);
  const boxes = new Map<string, HTMLInputElement>();
  const apply = (name: string, on: boolean): void => {
    v.setVisible(name, on);
    if (on) hidden.delete(name);
    else hidden.add(name);
    const box = boxes.get(name);
    if (box) box.checked = on;
    showAll.disabled = hidden.size === 0;
  };

  const showAll = h('button', { type: 'button', class: 'btn btn-secondary heart-show-all', 'data-testid': 'heart-show-all' }, 'Show all');
  showAll.addEventListener('click', () => {
    for (const p of parts) apply(p.name, true);
    writeHidden(heart.id, hidden);
  });

  const row = (p: HeartPart): HTMLElement => {
    const box = h('input', { type: 'checkbox', 'data-part': p.name });
    box.checked = !hidden.has(p.name);
    box.addEventListener('change', () => {
      apply(p.name, box.checked);
      writeHidden(heart.id, hidden);
    });
    boxes.set(p.name, box);
    return h('li', {}, h('label', { class: 'heart-part', title: p.description }, box, h('span', { class: 'heart-swatch', style: `background: var(${p.look.token})`, 'aria-hidden': 'true' }), h('span', { class: 'heart-part-name' }, p.displayName)));
  };

  const known = new Set(GROUPS.map((g) => g.id));
  const groups = [...GROUPS, ...[...new Set(parts.map((p) => p.group))].filter((g) => !known.has(g)).map((g) => ({ id: g, label: g }))];
  const sections = groups
    .map((g) => ({ g, items: parts.filter((p) => p.group === g.id) }))
    .filter(({ items }) => items.length > 0)
    .map(({ g, items }) => h('section', { class: 'heart-group', 'aria-labelledby': `heart-group-${g.id}` }, h('h3', { id: `heart-group-${g.id}`, class: 'label' }, g.label), h('ul', { class: 'heart-parts' }, items.map(row))));

  for (const p of parts) v.setVisible(p.name, !hidden.has(p.name));
  showAll.disabled = hidden.size === 0;
  return h('div', { class: 'heart-panel-body' }, h('div', { class: 'heart-panel-head' }, h('h2', {}, 'Parts'), showAll), h('div', { class: 'heart-groups' }, sections));
}

// ---------------------------------------------------------------- screen

export async function renderHeart(root: HTMLElement, id: string | undefined): Promise<void> {
  disposeHeart();
  const mine = generation;

  const subline = h('p', { class: 'subline', 'data-testid': 'heart-title' }, 'Loading…');
  const stage = h('section', { class: 'heart-stage', 'data-state': 'loading', 'data-testid': 'heart-stage', 'aria-label': '3D heart' });
  const panel = h('aside', { class: 'heart-panel', 'aria-label': 'Parts of the heart' });
  const source = h('p', { class: 'heart-source' });
  const body = h(
    'div',
    { class: 'screen heart' },
    h('div', { class: 'title-row' }, h('h1', {}, 'Heart'), subline),
    h('div', { class: 'heart-layout' }, stage, panel),
    h('div', { class: 'heart-foot' }, source, honestyLine()),
  );
  const progress = h('progress', { class: 'heart-progress', 'aria-label': 'Loading the heart model' });
  replace(stage, h('div', { class: 'heart-message', role: 'status' }, h('p', { class: 'muted' }, 'Loading the heart…'), progress));
  renderShell(root, { crumbs: [{ label: 'Heart' }], body }, 'heart');

  const fail = (state: string, title: string, detail: string, action?: HTMLElement): void => {
    stage.dataset['state'] = state;
    replace(stage, stageMessage(title, detail, action));
    panel.hidden = true;
  };

  // ---- which heart
  let hearts: HeartEntry[];
  try {
    hearts = await loadIndex();
  } catch {
    if (mine !== generation) return;
    subline.textContent = 'No heart to show';
    fail('error', 'The list of hearts didn’t load', 'Check the connection, then try again.', retry());
    return;
  }
  if (mine !== generation) return;
  const heart = id ? hearts.find((x) => x.id === id) : hearts[0];
  if (!heart) {
    subline.textContent = 'No heart to show';
    if (id && hearts.length > 0) fail('empty', 'No heart with that name', 'It may have been renamed or removed.', h('a', { class: 'btn btn-primary', href: href.heart() }, 'Open the default heart'));
    else fail('empty', 'No heart has been built yet', 'Build one with tools/heartgen and publish it, then reload this page.');
    return;
  }
  subline.textContent = heart.title;
  source.textContent = `Shape from ${heart.source} (${heart.license}). A model for learning anatomy, not any patient’s heart. Valves are flat position markers for now; leaflets come next.`;

  if (!webglAvailable()) {
    fail('no-webgl', 'This browser can’t draw 3D here', 'The heart needs WebGL. Turn on hardware acceleration in the browser’s settings, or open this page in another browser.');
    return;
  }

  // ---- the view: three.js and the model load now, behind the progress bar
  try {
    const { createHeartViewer } = await import('./viewer');
    const lighting = readLighting();
    const mode = readMode(heart.id);
    const v = await createHeartViewer(`${HEARTS_URL}${heart.glb}`, `${heart.title}, in 3D. Drag to turn, scroll to zoom.`, lighting, mode, (fraction) => {
      if (fraction === null) progress.removeAttribute('value');
      else progress.value = fraction;
    });
    if (mine !== generation) {
      v.dispose();
      return;
    }
    viewer = v;
    const reset = h('button', { type: 'button', class: 'btn btn-secondary', 'data-testid': 'heart-reset' }, 'Reset view');
    reset.addEventListener('click', () => v.resetView());
    const onMode = (m: ViewMode): void => {
      body.dataset['mode'] = m;
    };
    onMode(mode);
    replace(stage, h('div', { class: 'view-toolbar' }, reset, modeSwitch(v, heart.id, mode, onMode), lightingSwitch(v, lighting)), h('div', { class: 'heart-view' }, v.canvas));
    replace(panel, partList(heart, v.parts, v));
    stage.dataset['triangles'] = String(v.triangles);
    // Two frames, so the heart is drawn before it fades in.
    requestAnimationFrame(() => requestAnimationFrame(() => (stage.dataset['state'] = 'ready')));
  } catch (error) {
    if (mine !== generation) return;
    console.error(error);
    fail('error', 'The heart model didn’t load', 'Check the connection, then try again.', retry());
  }

  function retry(): HTMLElement {
    const again = h('button', { type: 'button', class: 'btn btn-primary' }, 'Try again');
    again.addEventListener('click', () => void renderHeart(root, id));
    return again;
  }
}
