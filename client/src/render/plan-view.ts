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
import type { AnatomyConfig } from './anatomy-config';
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

export function createPlanView(c: LoadedCase, onPick: PickHandler, ar?: ArHooks, anatomy?: Promise<AnatomyConfig | null>): PlanView {
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
  const dual = createDualView(c, `3D view of ${c.title}. Drag to turn it; click a branch point to extend the route, or use the list of next branch points.`, d.svg, 'plan-view', ar, () => last && draw3d(last), undefined, anatomy);
  const element = dual.element;

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
      last = state;
      draw3d(state);
    },
    dispose() {
      d.svg.removeEventListener('click', onClick);
      dual.dispose();
    },
  };
}
