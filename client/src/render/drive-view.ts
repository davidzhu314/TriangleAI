/**
 * The Drive screen's view (spec §5.5), behind one interface like PlanView and CompareView.
 *
 * - Front view: translucent vessels, the planned route as a ghost trail, the wire opaque, the tip marked.
 * - X-ray view: grey ground; the wire as a dark line only while fluoro is held; vessels as a dark silhouette only
 *   during a contrast puff, fading over --duration-contrast-fade (1.5 s, spec §5.5).
 * - Difficulty ladder: "dim" lowers the front view (intermediate); the screen hides it for expert cases.
 *
 * 2D today (the shared front drawing); a three.js scene implements the same interface once `three` is added.
 */
import type { LoadedCase, Vec3 } from '../contracts';
import { drawCase, svgEl, toPoints } from './case-svg';
import { drawMarkers } from './plan-view';
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
  update(state: DriveViewState): void;
  /** Start a contrast puff: the X-ray silhouette shows, then fades. */
  puff(): void;
  dispose(): void;
}

export function createDriveView(c: LoadedCase, label: string): DriveView {
  const d = drawCase(c, label, 'drive-hatch');
  const ghost = svgEl('polyline', { points: '', class: 'ghost-trail' });
  const wire = svgEl('polyline', { points: '', class: 'wire-line' });
  const tip = svgEl('circle', { cx: 0, cy: 0, r: d.handle * 0.9, class: 'wire-tip' });
  const markers = svgEl('g', { class: 'markers' });
  d.svg.append(ghost, wire, tip, markers);
  const element = document.createElement('div');
  element.className = 'drive-view';
  element.append(d.svg);
  let fade: number | undefined;

  return {
    element,
    update(s) {
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
      element.remove();
    },
  };
}
