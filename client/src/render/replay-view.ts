/**
 * The Results replay's small front view (spec §6.3): the driven path over the best frontier route. The driven path
 * is the route trace (the same heavier teal line as on Plan and Compare); the best route takes a frontier colour
 * and its dash, so the two differ by pattern as well as colour. Points come from ReplayTimeline only.
 *
 * Wall contacts (Results' contact review) sit on top as numbered marks where the tip pressed on the wall; the list
 * beside the view uses the same numbers.
 */
import type { LoadedCase, Vec3 } from '../contracts';
import { drawCase, project, svgEl, toPoints } from './case-svg';
import './render.css';

export interface ContactMark {
  n: number;
  at: Vec3;
}

export function createReplayView(c: LoadedCase, drivenPath: readonly Vec3[], bestPath: readonly Vec3[], marks: readonly ContactMark[] = []): HTMLElement {
  const d = drawCase(c, `Front view of ${c.title}: your driven path, solid, over the best route at your weights, dashed. The legend names both.`, 'replay-hatch');
  d.svg.append(
    svgEl('polyline', { points: toPoints(bestPath), class: 'frontier-line route-2', 'data-testid': 'replay-best' }),
    svgEl('polyline', { points: toPoints(drivenPath), class: 'route-trace', 'data-testid': 'replay-driven' }),
  );
  if (marks.length) {
    const g = svgEl('g', { class: 'contact-marks' });
    const r = d.handle * 1.1;
    for (const m of marks) {
      const [x, y] = project(m.at);
      const mark = svgEl('g', { class: 'contact-mark', 'data-n': m.n, 'data-testid': 'contact-mark' });
      mark.append(svgEl('circle', { cx: x, cy: y, r }));
      const t = svgEl('text', { x, y, 'font-size': (r * 1.25).toFixed(2), 'text-anchor': 'middle', 'dominant-baseline': 'central' });
      t.textContent = String(m.n);
      mark.append(t);
      g.append(mark);
    }
    d.svg.append(g);
  }
  const element = document.createElement('div');
  element.className = 'plan-view replay-view';
  element.append(d.svg);
  return element;
}
