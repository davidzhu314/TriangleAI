/**
 * A case view with two faces: the three.js scene (default) and the flat 2D front drawing. The 2D drawing stays as
 * the keyboard-friendly alternative and the fallback where WebGL isn't available. The choice is remembered per
 * browser. The AR entry (A7) sits in the same toolbar, and only where immersive-ar is supported.
 *
 * three.js is loaded only when a case view opens (a dynamic import), so the Library and the brief stay light. The
 * flat drawing shows until the scene is ready.
 */
import type { LoadedCase } from '../contracts';
import type { ArHooks } from './ar';
import type { CaseScene } from './scene3d';
import { webglAvailable } from './tokens';
import './render.css';

export type ViewKind = '3d' | 'flat';
const KEY = 'threadsim.view.v1';

export function preferredView(): ViewKind {
  try {
    return localStorage.getItem(KEY) === 'flat' ? 'flat' : '3d';
  } catch {
    return '3d';
  }
}

function remember(kind: ViewKind): void {
  try {
    localStorage.setItem(KEY, kind);
  } catch {
    // storage blocked: the choice lasts for this view
  }
}

export interface DualView {
  readonly element: HTMLElement;
  /** The view-style switch and AR entry; views may move it (Drive puts it in its HUD). */
  readonly toolbar: HTMLElement;
  /** Null until the scene has loaded, and always when WebGL isn't available. */
  scene(): CaseScene | null;
  kind(): ViewKind;
  dispose(): void;
}

/** onScene runs once the three.js scene is ready, so the view can draw its current state into it. */
export function createDualView(c: LoadedCase, label: string, flat: Element, className: string, ar: ArHooks | undefined, onScene: (s: CaseScene) => void): DualView {
  const element = document.createElement('div');
  element.className = className;
  element.append(flat);
  const toolbar = document.createElement('div');
  toolbar.className = 'view-toolbar';
  element.append(toolbar);
  let scene: CaseScene | null = null;
  let disposed = false;
  let wanted: ViewKind = preferredView();

  const set = (k: ViewKind): void => {
    wanted = k;
    // Until the scene is ready the flat drawing shows, whatever is wanted.
    element.dataset['viewKind'] = scene ? k : 'flat';
    for (const b of toolbar.querySelectorAll<HTMLButtonElement>('[data-view-kind]')) b.setAttribute('aria-pressed', String(b.dataset['viewKind'] === wanted));
  };
  set(wanted);

  if (webglAvailable()) {
    const group = document.createElement('div');
    group.className = 'segmented view-kind';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'View style');
    for (const [k, text] of [['3d', '3D'], ['flat', 'Flat']] as const) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'segment';
      b.dataset['viewKind'] = k;
      b.textContent = text;
      b.addEventListener('click', () => {
        set(k);
        remember(k);
      });
      group.append(b);
    }
    toolbar.append(group);
    set(wanted);
    void Promise.all([import('./scene3d'), ar ? import('./ar') : Promise.resolve(null)]).then(([m, arMod]) => {
      if (disposed) return;
      scene = m.createCaseScene(c, label);
      element.insertBefore(scene.canvas, toolbar.parentNode === element ? toolbar : null); // Drive moves the toolbar into its HUD
      if (arMod && ar) toolbar.append(arMod.arButton(scene, ar));
      set(wanted);
      element.dataset['scene'] = 'ready';
      onScene(scene);
    });
  }

  return {
    element,
    toolbar,
    scene: () => scene,
    kind: () => (scene ? wanted : 'flat'),
    dispose() {
      disposed = true;
      scene?.dispose();
      element.remove();
    },
  };
}
