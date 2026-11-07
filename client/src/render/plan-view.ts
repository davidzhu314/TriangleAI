/**
 * The Plan screen's view of the case, behind one interface so screens never import a renderer directly.
 *
 * Today: the shared 2D front view (case-svg.ts) with the route trace, clickable branch-point handles and the entry
 * and target markers. Next: a three.js scene (translucent vessel mesh from LoadedCase.mesh with toWorld,
 * OrbitControls) implementing the same PlanView, once David adds `three`
 * (team/requests/to-david-from-aroovee-threejs.md).
 */
import type { LoadedCase } from '../contracts';
import { drawCase, svgEl } from './case-svg';
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

export function createPlanView(c: LoadedCase, onPick: PickHandler): PlanView {
  const d = drawCase(c, `Front view of ${c.title}. Build the route with the list of next branch points.`, 'plan-hatch');
  const route = svgEl('polyline', { points: '', class: 'route-trace' });
  const handles = svgEl('g', { class: 'handles' });
  const markers = svgEl('g', { class: 'markers' });
  d.svg.append(route, handles, markers);

  const element = document.createElement('div');
  element.className = 'plan-view';
  element.append(d.svg);

  const onClick = (ev: Event): void => {
    const id = (ev.target as Element).closest('[data-node]')?.getAttribute('data-node');
    if (id) onPick(id);
  };
  d.svg.addEventListener('click', onClick);

  return {
    element,
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
    },
    dispose() {
      d.svg.removeEventListener('click', onClick);
      element.remove();
    },
  };
}
