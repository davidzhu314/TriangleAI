/**
 * The Compare screen's overlay, behind one interface like PlanView. Frontier routes are drawn in their route colour
 * and line pattern (--color-route-1..4, --dash-route-1..4), the selected one heavier, and the player's route on top
 * as the solid route trace. Colour is never the only signal: the pattern and the legend's words name each line.
 * Two faces (dual-view.ts): the three.js scene by default, with the same colours and dash patterns from their
 * tokens, and the 2D front drawing as the flat alternative and WebGL fallback.
 */
import type { LoadedCase } from '../contracts';
import { drawCase, svgEl } from './case-svg';
import type { AnatomyConfig } from './anatomy-config';
import { createDualView } from './dual-view';
import { drawMarkers } from './plan-view';
import './render.css';

export interface OverlayLine {
  id: string;
  /** 1..4: picks --color-route-N and --dash-route-N. */
  slot: 1 | 2 | 3 | 4;
  startNode: string | undefined;
  edges: readonly string[];
}

export interface CompareViewState {
  lines: readonly OverlayLine[];
  selectedId: string | null;
  player: { startNode: string | undefined; edges: readonly string[] };
  entryNode: string | undefined;
  targetNode: string | undefined;
}

export interface CompareView {
  readonly element: HTMLElement;
  update(state: CompareViewState): void;
  dispose(): void;
}

export function createCompareView(c: LoadedCase, anatomy?: Promise<AnatomyConfig | null>): CompareView {
  const d = drawCase(c, `Front view of ${c.title} with the frontier routes and your route. The table below lists the same routes in words.`, 'compare-hatch');
  const lines = svgEl('g', { class: 'frontier-lines' });
  const player = svgEl('polyline', { points: '', class: 'route-trace' });
  const markers = svgEl('g', { class: 'markers' });
  d.svg.append(lines, player, markers);
  let drawn: string[] = [];
  let last: CompareViewState | null = null;
  const draw3d = (state: CompareViewState): void => {
    const scene = dual.scene();
    if (!scene) return;
    const ordered = [...state.lines].sort((a, b) => Number(a.id === state.selectedId) - Number(b.id === state.selectedId));
    for (const name of drawn) scene.setRoute(name, null);
    drawn = ordered.map((l) => `frontier-${l.id}`);
    for (const l of ordered) {
      scene.setRoute(`frontier-${l.id}`, scene.routePoints(l.startNode, l.edges), { colorToken: `--color-route-${l.slot}`, dashToken: `--dash-route-${l.slot}`, heavy: l.id === state.selectedId });
    }
    scene.setRoute('player', scene.routePoints(state.player.startNode, state.player.edges), { colorToken: '--color-route-player', heavy: true });
    scene.setMarkers(state.entryNode, state.targetNode);
  };
  const dual = createDualView(c, `3D view of ${c.title} with the frontier routes and your route. Drag to turn it. The table below lists the same routes in words.`, d.svg, 'plan-view', undefined, () => last && draw3d(last), 'close', anatomy);
  const element = dual.element;

  return {
    element,
    update(state) {
      lines.replaceChildren();
      // The selected line last, so it sits above the other frontier lines (the player's route stays on top).
      const ordered = [...state.lines].sort((a, b) => Number(a.id === state.selectedId) - Number(b.id === state.selectedId));
      for (const l of ordered) {
        lines.append(svgEl('polyline', { points: d.routePoints(l.startNode, l.edges), class: `frontier-line route-${l.slot}${l.id === state.selectedId ? ' frontier-selected' : ''}`, 'data-route': l.id }));
      }
      player.setAttribute('points', d.routePoints(state.player.startNode, state.player.edges));
      drawMarkers(d, markers, state.entryNode, state.targetNode);
      last = state;
      draw3d(state);
    },
    dispose() {
      dual.dispose();
    },
  };
}
