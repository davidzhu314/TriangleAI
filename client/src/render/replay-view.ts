/**
 * The Results replay's small front view (spec §6.3): the driven path over the best frontier route. The driven path
 * is the route trace (the same heavier teal line as on Plan and Compare); the best route takes a frontier colour
 * and its dash, so the two differ by pattern as well as colour. Points come from ReplayTimeline only.
 */
import type { LoadedCase, Vec3 } from '../contracts';
import { drawCase, svgEl, toPoints } from './case-svg';
import './render.css';

export function createReplayView(c: LoadedCase, drivenPath: readonly Vec3[], bestPath: readonly Vec3[]): HTMLElement {
  const d = drawCase(c, `Front view of ${c.title}: your driven path, solid, over the best route at your weights, dashed. The legend names both.`, 'replay-hatch');
  d.svg.append(
    svgEl('polyline', { points: toPoints(bestPath), class: 'frontier-line route-2', 'data-testid': 'replay-best' }),
    svgEl('polyline', { points: toPoints(drivenPath), class: 'route-trace', 'data-testid': 'replay-driven' }),
  );
  const element = document.createElement('div');
  element.className = 'plan-view replay-view';
  element.append(d.svg);
  return element;
}
