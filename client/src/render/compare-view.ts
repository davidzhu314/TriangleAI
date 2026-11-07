/**
 * The Compare screen's overlay, behind one interface like PlanView. Frontier routes are drawn in their route colour
 * and line pattern (--color-route-1..4, --dash-route-1..4), the selected one heavier, and the player's route on top
 * as the solid route trace. Colour is never the only signal: the pattern and the legend's words name each line.
 * A three.js version implements the same interface once `three` is added.
 */
import type { LoadedCase } from '../contracts';
import { drawCase, svgEl } from './case-svg';
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

export function createCompareView(c: LoadedCase): CompareView {
  const d = drawCase(c, `Front view of ${c.title} with the frontier routes and your route. The table below lists the same routes in words.`, 'compare-hatch');
  const lines = svgEl('g', { class: 'frontier-lines' });
  const player = svgEl('polyline', { points: '', class: 'route-trace' });
  const markers = svgEl('g', { class: 'markers' });
  d.svg.append(lines, player, markers);
  const element = document.createElement('div');
  element.className = 'plan-view';
  element.append(d.svg);

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
    },
    dispose() {
      element.remove();
    },
  };
}
