/**
 * Controls for the anatomy layer, in a case view's toolbar: an "Anatomy" button opening a small panel with
 * Arteries, Veins, Labels, Opacity and Reset camera. The settings are remembered per browser. The GLB loads the
 * first time the layer is turned on, so a case view costs nothing extra until then.
 *
 * The panel is a disclosure, not a dialog: nothing behind it is blocked, and Escape closes it.
 */
import type { AnatomyConfig } from './anatomy-config';
import type { AnatomyLayer } from './anatomy-layer';
import { defaultState, readState, type AnatomyState } from './anatomy-model';
import type { CaseScene } from './scene3d';
import { tokenNumber } from './tokens';

const KEY = 'threadsim.anatomy.v1';

function load(): AnatomyState {
  const fallback = defaultState(tokenNumber('--opacity-anatomy'));
  try {
    return readState(JSON.parse(localStorage.getItem(KEY) ?? 'null'), fallback);
  } catch {
    return fallback;
  }
}

function save(s: AnatomyState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage blocked: the settings last for this view
  }
}

export interface AnatomyControls {
  /** The button and its panel, for the view's toolbar. */
  readonly element: HTMLElement;
  /** The current settings. */
  state(): AnatomyState;
  /** Change settings from outside (another control, the assistant later). Saved like a click. */
  set(change: Partial<AnatomyState>): AnatomyState;
  /** Hide the layer whatever the settings say (the X-ray view), without changing them. */
  suppress(on: boolean): void;
  dispose(): void;
}

export interface AnatomyControlOptions {
  scene: CaseScene;
  config: AnatomyConfig;
  /** The view element: the labels' overlay goes here, and the layer reports its state on it. */
  host: HTMLElement;
  /** Put the camera back where the view opened. */
  onResetCamera: () => void;
}

let uid = 0;

export function createAnatomyControls({ scene, config, host, onResetCamera }: AnatomyControlOptions): AnatomyControls {
  let current = load();
  let suppressed = false;
  let layer: AnatomyLayer | null = null;
  let loading: Promise<AnatomyLayer> | null = null;
  const id = `anatomy-panel-${++uid}`;

  const element = document.createElement('div');
  element.className = 'anatomy-controls';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'btn btn-secondary anatomy-toggle';
  toggle.textContent = 'Anatomy';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', id);
  const panel = document.createElement('div');
  panel.className = 'anatomy-panel';
  panel.id = id;
  panel.hidden = true;
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', 'Anatomy layer');

  const check = (key: 'visible' | 'arteries' | 'veins' | 'labels' | 'body', text: string): HTMLInputElement => {
    const label = document.createElement('label');
    label.className = 'anatomy-row';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset['anatomy'] = key;
    input.addEventListener('change', () => set({ [key]: input.checked }));
    label.append(input, document.createTextNode(text));
    panel.append(label);
    return input;
  };
  // A case with its own body context gets one switch, "Body". The vascular rows are for the generic model, which is
  // never drawn on such a case, so they don't appear there.
  const context = config.context === true;
  const body = context ? check('body', 'Body') : null;
  const show = check('visible', 'Show anatomy');
  const arteries = check('arteries', 'Arteries');
  const veins = check('veins', 'Veins');
  const labels = check('labels', 'Labels');
  for (const i of [show, arteries, veins, labels]) i.closest('label')!.hidden = context;

  const opacityRow = document.createElement('label');
  opacityRow.className = 'anatomy-row anatomy-opacity';
  const opacityText = document.createElement('span');
  opacityText.textContent = 'Opacity';
  const opacity = document.createElement('input');
  opacity.type = 'range';
  opacity.min = '0';
  opacity.max = '100';
  opacity.step = '5';
  opacity.dataset['anatomy'] = 'opacity';
  opacity.addEventListener('input', () => set({ opacity: Number(opacity.value) / 100 }));
  opacityRow.append(opacityText, opacity);
  opacityRow.hidden = context; // the body keeps its own quiet opacities (tokens)
  panel.append(opacityRow);

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'btn btn-secondary anatomy-reset';
  reset.textContent = 'Reset camera';
  reset.addEventListener('click', onResetCamera);
  panel.append(reset);

  const note = document.createElement('p');
  note.className = 'anatomy-note';
  note.textContent = config.placeholder
    ? 'Placeholder model, fitted to this case. Not anatomy.'
    : context
      ? "Bone and heart from this case's scan, for scale and orientation only."
      : '';
  note.hidden = !note.textContent;
  panel.append(note);
  const status = document.createElement('p');
  status.className = 'anatomy-note';
  status.setAttribute('role', 'status');
  panel.append(status);

  element.append(toggle, panel);

  const open = (on: boolean): void => {
    // Open toward the side of the view with room: the toolbar wraps on narrow views, so the button can sit at
    // either edge, and a panel hanging outside the view would land under the screen's own panels.
    const b = toggle.getBoundingClientRect();
    const v = host.getBoundingClientRect();
    panel.dataset['align'] = b.left - v.left < v.right - b.right ? 'left' : 'right';
    panel.hidden = !on;
    toggle.setAttribute('aria-expanded', String(on));
  };
  toggle.addEventListener('click', () => open(toggle.getAttribute('aria-expanded') !== 'true'));
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      open(false);
      toggle.focus();
    }
  });

  const ensureLayer = (): void => {
    if (layer || loading) return;
    status.textContent = 'Loading the model…';
    loading = import('./anatomy-layer').then((m) => {
      layer = m.createAnatomyLayer(scene, config, host);
      layer.ready.then(
        () => (status.textContent = ''),
        () => (status.textContent = 'The anatomy model could not be loaded.'),
      );
      sync();
      return layer;
    });
  };

  const sync = (): void => {
    if (body) body.checked = current.body;
    show.checked = current.visible;
    arteries.checked = current.arteries;
    veins.checked = current.veins;
    labels.checked = current.labels;
    for (const i of [arteries, veins, labels, opacity]) i.disabled = !current.visible;
    opacity.value = String(Math.round(current.opacity * 100));
    opacity.setAttribute('aria-valuetext', `${opacity.value} percent`);
    const on = context ? current.body : current.visible;
    toggle.setAttribute('aria-pressed', String(on));
    if (on) ensureLayer();
    // Suppressed (Drive's X-ray): nothing of the layer shows, whatever the settings.
    layer?.apply({ ...current, visible: !context && current.visible && !suppressed, body: context && current.body && !suppressed });
    host.dataset['anatomySuppressed'] = String(suppressed);
  };

  function set(change: Partial<AnatomyState>): AnatomyState {
    current = { ...current, ...change };
    save(current);
    sync();
    return current;
  }

  sync();
  return {
    element,
    state: () => ({ ...current }),
    set,
    suppress(on) {
      if (suppressed === on) return;
      suppressed = on;
      sync();
    },
    dispose() {
      layer?.dispose();
      element.remove();
    },
  };
}
