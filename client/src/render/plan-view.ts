/**
 * The Plan screen's view of the case, behind one interface so screens never import a renderer directly.
 *
 * Two faces (dual-view.ts): the three.js scene by default (the translucent vessel mesh from LoadedCase.mesh with
 * toWorld, OrbitControls, risk zones, the route as the heavier teal trace, clickable branch-point handles, entry
 * and target markers) and the shared 2D front drawing (case-svg.ts) as the flat alternative and WebGL fallback.
 * In AR (A7) the same handles are picked with a controller, and the cost panel floats beside the model.
 */
import type { LoadedCase } from '../contracts';
import type { ArHooks } from './ar';
import { drawCase, svgEl } from './case-svg';
import { createDualView } from './dual-view';
import './render.css';

export interface PlanViewState {
  /** Edges of the player's route, in order. */
  routeEdges: readonly string[];
  /** Nodes one step from the route's end: shown as handles the player can click. */
  pickable: readonly string[];
  entryNode: string | undefined;
  targetNode: string | undefined;
}

export interface PlanView {
  readonly element: HTMLElement;
  /** The view's toolbar (3D | Flat, camera, anatomy): screens may add their own controls to it. */
  readonly toolbar: HTMLElement;
  /** The branch-point node under a point of the view (0..1 of its width and height), in 3D or flat. */
  pickAt(x: number, y: number): string | null;
  /** Zoom the 3D view; false in the flat view, which has no zoom. */
  zoom(factor: number): boolean;
  /** Pan the view (3D or flat) by a share of its size. */
  pan(dx: number, dy: number, roll?: number): void;
  update(state: PlanViewState): void;
  dispose(): void;
}

export type PickHandler = (nodeId: string) => void;

/** Add entry and target markers to a layer. */
export function drawMarkers(d: ReturnType<typeof drawCase>, layer: SVGGElement, entryNode: string | undefined, targetNode: string | undefined): void {
  layer.replaceChildren();
  for (const [id, cls] of [[entryNode, 'marker-entry'], [targetNode, 'marker-target']] as const) {
    const at = id ? d.nodePos(id) : undefined;
    if (at) layer.append(svgEl('circle', { cx: at[0], cy: at[1], r: d.handle * 1.1, class: cls }));
  }
}

export function createPlanView(c: LoadedCase, onPick: PickHandler, ar?: ArHooks): PlanView {
  const d = drawCase(c, `Front view of ${c.title}. Build the route with the list of next branch points.`, 'plan-hatch');
  const route = svgEl('polyline', { points: '', class: 'route-trace' });
  const handles = svgEl('g', { class: 'handles' });
  const markers = svgEl('g', { class: 'markers' });
  d.svg.append(route, handles, markers);

  let last: PlanViewState | null = null;
  const draw3d = (state: PlanViewState): void => {
    const scene = dual.scene();
    if (!scene) return;
    const route = scene.routePoints(state.entryNode, state.routeEdges);
    scene.setRoute('player', route, { colorToken: '--color-route-player', heavy: true });
    // The camera starts on the whole tree and closes in on the arch once the route gets there.
    dual.follow(route.at(-1) ?? c.nodes.find((n) => n.id === state.entryNode)?.pos ?? null);
    scene.setHandles(state.pickable, onPick);
    scene.setMarkers(state.entryNode, state.targetNode);
  };
  const dual = createDualView(c, `3D view of ${c.title}. Drag to turn it; click a branch point to extend the route, or use the list of next branch points.`, d.svg, 'plan-view', ar, () => last && draw3d(last));
  const element = dual.element;

  const onClick = (ev: Event): void => {
    const id = (ev.target as Element).closest('[data-node]')?.getAttribute('data-node');
    if (id) onPick(id);
  };
  d.svg.addEventListener('click', onClick);

  return {
    element,
    toolbar: dual.toolbar,
    pan: (dx, dy, roll) => dual.pan(dx, dy, roll),
    pickAt(x, y) {
      const scene = dual.scene();
      if (scene && dual.kind() === '3d') return scene.pickAt(x, y);
      const r = d.svg.getBoundingClientRect();
      const at = document.elementFromPoint(r.left + x * r.width, r.top + y * r.height);
      return at?.closest('[data-node]')?.getAttribute('data-node') ?? null;
    },
    zoom(factor) {
      const scene = dual.scene();
      if (!scene || dual.kind() !== '3d') return false;
      scene.zoom(factor);
      return true;
    },
    update(state) {
      route.setAttribute('points', d.routePoints(state.entryNode, state.routeEdges));
      handles.replaceChildren();
      for (const id of state.pickable) {
        const at = d.nodePos(id);
        if (!at) continue;
        const g = svgEl('g', { class: 'handle', 'data-node': id });
        g.append(svgEl('circle', { cx: at[0], cy: at[1], r: d.handle * 2.2, class: 'handle-hit' }), svgEl('circle', { cx: at[0], cy: at[1], r: d.handle, class: 'handle-dot' }));
        handles.append(g);
      }
      drawMarkers(d, markers, state.entryNode, state.targetNode);
      last = state;
      draw3d(state);
    },
    dispose() {
      d.svg.removeEventListener('click', onClick);
      dual.dispose();
    },
  };
}
