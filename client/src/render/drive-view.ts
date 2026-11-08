/**
 * The Drive screen's view (spec §5.5), behind one interface like PlanView and CompareView.
 *
 * - Front view: translucent vessels, the planned route as a ghost trail, the wire opaque, the tip marked.
 * - X-ray view: grey ground; the wire as a dark line only while fluoro is held; vessels as a dark silhouette only
 *   during a contrast puff, fading over --duration-contrast-fade (1.5 s, spec §5.5).
 * - Difficulty ladder: "dim" lowers the front view (intermediate); the screen hides it for expert cases.
 *
 * Two faces (dual-view.ts): the three.js scene by default and the 2D front drawing as the flat alternative and
 * WebGL fallback. In 3D the X-ray look is the same scene re-coloured from the X-ray tokens: the silhouette's opacity
 * runs from --opacity-xray-contrast to zero over --duration-contrast-fade after a puff. The element's data-wire and
 * data-contrast attributes report what the 3D view shows, for tests and assistive checks. In AR (A7) the
 * controller drives like a gamepad and the HUD floats beside the model.
 */
import type { LoadedCase, Vec3 } from '../contracts';
import { drawCase, svgEl, toPoints } from './case-svg';
import type { ArHooks } from './ar';
import type { AnatomyConfig } from './anatomy-config';
import { createDualView, type DualView } from './dual-view';
import { drawMarkers } from './plan-view';
import { tokenMs, tokenNumber } from './tokens';
import './render.css';

export type DriveViewMode = 'front' | 'xray';

export interface DriveViewState {
  mode: DriveViewMode;
  /** Planned route, drawn as the ghost trail. */
  plan: { startNode: string | undefined; edges: readonly string[] };
  /** Wire body points, base to tip, metres; empty before the wire starts. */
  wire: readonly Vec3[];
  tip: Vec3 | null;
  fluoro: boolean;
  /** Front view dimmed (intermediate difficulty). */
  dim: boolean;
  entryNode: string | undefined;
  targetNode: string | undefined;
}

export interface DriveView {
  readonly element: HTMLElement;
  /** The 3D/Flat switch and the AR entry, for the screen to place in its HUD. */
  readonly toolbar: HTMLElement | null;
  update(state: DriveViewState): void;
  /** Zoom the 3D view; false in the flat view, which has no zoom. */
  zoom(factor: number): boolean;
  /** Pan the view (3D or flat) by a share of its size. */
  pan(dx: number, dy: number, roll?: number): void;
  /** Back to where the view opened: exactly what the Reset view button does. */
  resetView(): void;
  /** Start a contrast puff: the X-ray silhouette shows, then fades. */
  puff(): void;
  dispose(): void;
}

export function createDriveView(c: LoadedCase, label: string, ar?: ArHooks, anatomy?: Promise<AnatomyConfig | null>): DriveView {
  const d = drawCase(c, label, 'drive-hatch');
  const ghost = svgEl('polyline', { points: '', class: 'ghost-trail' });
  const wire = svgEl('polyline', { points: '', class: 'wire-line' });
  const tip = svgEl('circle', { cx: 0, cy: 0, r: d.handle * 0.9, class: 'wire-tip' });
  const markers = svgEl('g', { class: 'markers' });
  d.svg.append(ghost, wire, tip, markers);
  const dual: DualView = createDualView(c, label, d.svg, 'drive-view', ar, (scene) => {
    scene.onFrame(fadeFrame);
    if (last) draw3d(last);
  }, undefined, anatomy);
  const element = dual.element;
  const toolbar = dual.toolbar;
  toolbar.remove();
  let fade: number | undefined;
  let last: DriveViewState | null = null;
  // The 3D silhouette's opacity during and after a puff (X-ray only).
  let contrast = 0;
  let fadeLeftMs = 0;

  const draw3d = (s: DriveViewState): void => {
    const scene = dual.scene();
    if (!scene) return;
    const xray = s.mode === 'xray';
    const wireShown = !xray || s.fluoro;
    scene.setBackground(xray ? '--color-xray-bg' : null);
    const front = tokenNumber('--opacity-scene-vessel');
    scene.setVessels(xray ? { colorToken: '--color-xray-ink', opacity: contrast, zones: false, wall: false } : { colorToken: '--color-scene-vessel', opacity: s.dim ? front * front : front, zones: !s.dim });
    scene.setRoute('ghost', xray ? null : scene.routePoints(s.plan.startNode, s.plan.edges), { colorToken: '--color-scene-ghost', opacityToken: '--opacity-scene-ghost' });
    scene.setRoute('wire', wireShown && s.wire.length > 1 ? s.wire : null, { colorToken: xray ? '--color-xray-ink' : '--color-scene-wire', heavy: true });
    scene.setPoint('tip', wireShown ? s.tip : null, xray ? '--color-xray-ink' : '--color-scene-ghost');
    dual.anatomy()?.suppress(xray); // X-ray shows only the silhouette, wire and contrast
    dual.follow(s.tip); // the whole tree from the entry, then the close-up once the tip reaches the arch
    scene.setMarkers(s.entryNode, s.targetNode);
    scene.showMarkers(!xray);
    element.dataset['wire'] = wireShown && s.wire.length > 1 ? 'shown' : 'hidden';
    element.dataset['contrast'] = contrast.toFixed(2);
  };
  function fadeFrame(dt: number): void {
    const scene = dual.scene();
    if (fadeLeftMs <= 0 || !last || !scene) return;
    const total = tokenMs('--duration-contrast-fade');
    fadeLeftMs = Math.max(0, fadeLeftMs - dt);
    contrast = tokenNumber('--opacity-xray-contrast') * (fadeLeftMs / total);
    if (last.mode === 'xray') {
      scene.setVessels({ colorToken: '--color-xray-ink', opacity: contrast, zones: false, wall: false });
      element.dataset['contrast'] = contrast.toFixed(2);
    }
  }

  return {
    element,
    toolbar,
    pan: (dx, dy, roll) => dual.pan(dx, dy, roll),
    resetView: () => dual.resetCamera(),
    zoom(factor) {
      const scene = dual.scene();
      if (!scene || dual.kind() !== '3d') return false;
      scene.zoom(factor);
      return true;
    },
    update(s) {
      last = s;
      draw3d(s);
      element.dataset['mode'] = s.mode;
      element.classList.toggle('drive-dim', s.dim && s.mode === 'front');
      element.classList.toggle('fluoro-on', s.fluoro);
      ghost.setAttribute('points', d.routePoints(s.plan.startNode, s.plan.edges));
      wire.setAttribute('points', s.wire.length ? toPoints(s.wire) : '');
      if (s.tip) {
        const [x, y] = [s.tip[0] * 1000, -s.tip[1] * 1000];
        tip.setAttribute('cx', String(x));
        tip.setAttribute('cy', String(y));
        tip.removeAttribute('hidden');
      } else tip.setAttribute('hidden', '');
      drawMarkers(d, markers, s.entryNode, s.targetNode);
    },
    puff() {
      contrast = tokenNumber('--opacity-xray-contrast');
      fadeLeftMs = tokenMs('--duration-contrast-fade');
      if (last) draw3d(last);
      window.clearTimeout(fade);
      element.classList.remove('contrast-fading');
      element.classList.add('contrast-on');
      // One frame at full contrast, then the CSS transition fades it over --duration-contrast-fade.
      fade = window.setTimeout(() => {
        element.classList.add('contrast-fading');
        element.classList.remove('contrast-on');
      }, 50);
    },
    dispose() {
      window.clearTimeout(fade);
      toolbar.remove();
      dual.dispose();
    },
  };
}
