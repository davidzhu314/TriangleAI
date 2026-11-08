/**
 * A case view with two faces: the three.js scene (default) and the flat 2D front drawing. The 2D drawing stays as
 * the keyboard-friendly alternative and the fallback where WebGL isn't available. The choice is remembered per
 * browser. The AR entry (A7) sits in the same toolbar, and only where immersive-ar is supported.
 *
 * three.js is loaded only when a case view opens (a dynamic import), so the Library and the brief stay light. The
 * flat drawing shows until the scene is ready.
 */
import type { LoadedCase, Vec3 } from '../contracts';
import { anatomyConfig, type AnatomyConfig } from './anatomy-config';
import { createAnatomyControls, type AnatomyControls } from './anatomy-controls';
import type { ArHooks } from './ar';
import type { CaseScene } from './scene3d';
import { webglAvailable } from './tokens';
import './render.css';

export type ViewKind = '3d' | 'flat';
/** Where the 3D camera looks: the arch-and-target close-up, or the whole tree (framing.ts). */
export type FrameKind = 'close' | 'whole';
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
  /**
   * Zoom toward the route as it is built or driven: the close-up once `p` (the route's end, or the wire tip) is
   * inside it, the whole tree before. It stops once the user picks Close-up or Whole tree.
   */
  follow(p: Vec3 | null): void;
  /** The anatomy layer's controls, once the scene is ready (null without WebGL, or before). */
  anatomy(): AnatomyControls | null;
  /** Put the camera back where the view opened. */
  resetCamera(): void;
  dispose(): void;
}

/**
 * onScene runs once the three.js scene is ready, so the view can draw its current state into it. `startFrame` is
 * where the camera opens (DECISIONS.md 2026-11-07, "3D framing").
 */
export function createDualView(c: LoadedCase, label: string, flat: Element, className: string, ar: ArHooks | undefined, onScene: (s: CaseScene) => void, startFrame: FrameKind = 'whole', anatomy: AnatomyConfig | null | Promise<AnatomyConfig | null> = anatomyConfig()): DualView {
  const element = document.createElement('div');
  element.className = className;
  element.append(flat);
  const toolbar = document.createElement('div');
  toolbar.className = 'view-toolbar';
  element.append(toolbar);
  let scene: CaseScene | null = null;
  let disposed = false;
  let wanted: ViewKind = preferredView();
  let framed: FrameKind = startFrame;
  let userFramed = false;
  let frameGroup: HTMLElement | null = null;
  let anatomyControls: AnatomyControls | null = null;
  const resetCamera = (): void => {
    userFramed = false;
    if (scene?.closeUp) frameTo(startFrame);
    else scene?.frame('whole');
  };

  const set = (k: ViewKind): void => {
    wanted = k;
    // Until the scene is ready the flat drawing shows, whatever is wanted.
    element.dataset['viewKind'] = scene ? k : 'flat';
    for (const b of toolbar.querySelectorAll<HTMLButtonElement>('[data-view-kind]')) b.setAttribute('aria-pressed', String(b.dataset['viewKind'] === wanted));
    if (frameGroup) frameGroup.hidden = !scene || k !== '3d';
  };
  const frameTo = (f: FrameKind): void => {
    framed = f;
    element.dataset['frame'] = f;
    scene?.frame(f);
    for (const b of frameGroup?.querySelectorAll<HTMLButtonElement>('[data-frame]') ?? []) b.setAttribute('aria-pressed', String(b.dataset['frame'] === f));
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
      const ready3d = scene;
      element.insertBefore(scene.canvas, toolbar.parentNode === element ? toolbar : null); // Drive moves the toolbar into its HUD
      if (scene.closeUp) {
        // Close-up or whole tree: the same segmented control as 3D | Flat.
        frameGroup = document.createElement('div');
        frameGroup.className = 'segmented view-frame';
        frameGroup.setAttribute('role', 'group');
        frameGroup.setAttribute('aria-label', 'Camera');
        for (const [f, text] of [['close', 'Close-up'], ['whole', 'Whole tree']] as const) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'segment';
          b.dataset['frame'] = f;
          b.textContent = text;
          b.addEventListener('click', () => {
            userFramed = true;
            frameTo(f);
          });
          frameGroup.append(b);
        }
        toolbar.append(frameGroup);
        frameTo(framed);
      }
      // The model may still be deciding (a case's own context.glb is probed first): the controls wait for it, so
      // the placeholder never flashes up on a case that turns out to have its own body context.
      const ready = scene;
      void Promise.resolve(anatomy).then((cfg) => {
        if (!cfg || disposed) return;
        anatomyControls = createAnatomyControls({ scene: ready, config: cfg, host: element, onResetCamera: resetCamera });
        const ar = toolbar.querySelector('.ar-enter');
        toolbar.insertBefore(anatomyControls.element, ar);
        element.dataset['anatomyModel'] = cfg.context ? 'context' : cfg.placeholder ? 'placeholder' : 'model';
      });
      if (arMod && ar) toolbar.append(arMod.arButton(scene, ar));
      set(wanted);
      element.dataset['scene'] = 'ready';
      // Under automation only (navigator.webdriver): where the branch handles are, so a test can click one in 3D.
      if (navigator.webdriver) {
        let since = 0;
        scene.onFrame((dt) => {
          since += dt;
          if (since < 200) return;
          since = 0;
          element.dataset['handles'] = JSON.stringify(ready3d.handlesOnScreen());
        });
      }
      onScene(scene);
    });
  }

  return {
    element,
    toolbar,
    scene: () => scene,
    kind: () => (scene ? wanted : 'flat'),
    follow(p) {
      if (!scene?.closeUp || userFramed || !p) return;
      const want: FrameKind = scene.inCloseUp(p) ? 'close' : 'whole';
      if (want !== framed) frameTo(want);
    },
    anatomy: () => anatomyControls,
    resetCamera,
    dispose() {
      disposed = true;
      anatomyControls?.dispose();
      scene?.dispose();
      element.remove();
    },
  };
}
