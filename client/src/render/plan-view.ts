/**
 * The Plan screen's view of the case, behind one interface so screens never import a renderer directly.
 *
 * Today: a flat front (AP) projection in SVG, drawn from the case's own centerlines and radii. Every colour,
 * opacity and stroke comes from tokens through CSS classes (render.css), so it follows the theme on its own.
 * Next: a three.js scene (translucent vessel mesh from LoadedCase.mesh with toWorld, OrbitControls) implementing
 * the same PlanView, once David adds `three` (team/requests/to-david-from-aroovee-threejs.md).
 *
 * Positions are metres, Y-up: +X patient left (viewer's right), +Y superior. The AP view looks along −Z.
 */
import type { LoadedCase, RiskTier, Vec3 } from '../contracts';
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

const SVG = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** Screen coordinates in mm for the AP projection: x right, y down. */
const project = (p: Vec3): [number, number] => [p[0] * 1000, -p[1] * 1000];
const pts = (points: readonly Vec3[]): string => points.map((p) => project(p).map((n) => n.toFixed(2)).join(',')).join(' ');

/** The part of an edge's polyline between two arc lengths (metres from its `from` node), for risk zones. */
function slice(points: readonly Vec3[], fromM: number, toM: number): Vec3[] {
  const out: Vec3[] = [];
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    if (i > 0) {
      const q = points[i - 1]!;
      s += Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    }
    if (s >= fromM && s <= toM) out.push(p);
  }
  return out;
}

const TIER_CLASS: Record<RiskTier, string> = { forbidden: 'zone-forbidden', heavy: 'zone-heavy', proximity: 'zone-proximity' };

export function createPlanView(c: LoadedCase, onPick: PickHandler): PlanView {
  const nodes = new Map(c.nodes.map((n) => [n.id, n]));
  const all = c.edges.flatMap((e) => e.points).map(project);
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const maxR = Math.max(...c.edges.flatMap((e) => e.radiiM)) * 1000;
  const pad = maxR * 2.5;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) - Math.min(...xs) + pad * 2;
  const h = Math.max(...ys) - Math.min(...ys) + pad * 2;
  /** Marker size in mm, relative to the case so it reads at any scale. */
  const handle = Math.max(w, h) * 0.018;

  const svg = el('svg', { viewBox: `${minX} ${minY} ${w} ${h}`, class: 'plan-view-svg', role: 'img', preserveAspectRatio: 'xMidYMid meet' });
  svg.setAttribute('aria-label', `Front view of ${c.title}. Build the route with the list of next branch points.`);
  const defs = el('defs', {});
  const hatch = el('pattern', { id: 'plan-hatch', width: handle * 0.6, height: handle * 0.6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
  hatch.append(el('line', { x1: 0, y1: 0, x2: 0, y2: handle * 0.6, class: 'hatch-line' }));
  defs.append(hatch);
  svg.append(defs);

  const vessels = el('g', { class: 'vessels' });
  for (const e of c.edges) {
    const meanR = (e.radiiM.reduce((a, b) => a + b, 0) / Math.max(1, e.radiiM.length)) * 1000;
    vessels.append(el('polyline', { points: pts(e.points), class: 'vessel', 'stroke-width': (meanR * 2).toFixed(2) }));
  }
  const zones = el('g', { class: 'zones' });
  for (const z of c.riskZones) {
    const edge = c.edges.find((e) => e.id === z.edge);
    if (!edge) continue;
    const seg = slice(edge.points, z.fromM, z.toM);
    if (seg.length < 2) continue;
    const meanR = (edge.radiiM.reduce((a, b) => a + b, 0) / Math.max(1, edge.radiiM.length)) * 1000;
    zones.append(el('polyline', { points: pts(seg), class: `zone ${TIER_CLASS[z.tier]}`, 'stroke-width': (meanR * 2.4).toFixed(2) }));
  }
  const route = el('polyline', { points: '', class: 'route-trace' });
  const handles = el('g', { class: 'handles' });
  const markers = el('g', { class: 'markers' });
  svg.append(vessels, zones, route, handles, markers);

  const element = document.createElement('div');
  element.className = 'plan-view';
  element.append(svg);

  const onClick = (ev: Event): void => {
    const target = (ev.target as Element).closest('[data-node]');
    const id = target?.getAttribute('data-node');
    if (id) onPick(id);
  };
  svg.addEventListener('click', onClick);

  const marker = (id: string | undefined, cls: string, scale: number): void => {
    const n = id ? nodes.get(id) : undefined;
    if (!n) return;
    const [x, y] = project(n.pos);
    markers.append(el('circle', { cx: x, cy: y, r: handle * scale, class: cls }));
  };

  return {
    element,
    update(state) {
      const routePoints: Vec3[] = [];
      let at = state.entryNode;
      for (const id of state.routeEdges) {
        const e = c.edges.find((x) => x.id === id);
        if (!e || at === undefined) break;
        const forward = e.from === at;
        const p = forward ? e.points : [...e.points].reverse();
        routePoints.push(...(routePoints.length ? p.slice(1) : p));
        at = forward ? e.to : e.from;
      }
      route.setAttribute('points', pts(routePoints));
      handles.replaceChildren();
      for (const id of state.pickable) {
        const n = nodes.get(id);
        if (!n) continue;
        const [x, y] = project(n.pos);
        const g = el('g', { class: 'handle', 'data-node': id });
        g.append(el('circle', { cx: x, cy: y, r: handle * 2.2, class: 'handle-hit' }), el('circle', { cx: x, cy: y, r: handle, class: 'handle-dot' }));
        handles.append(g);
      }
      markers.replaceChildren();
      marker(state.entryNode, 'marker-entry', 1.1);
      marker(state.targetNode, 'marker-target', 1.1);
    },
    dispose() {
      svg.removeEventListener('click', onClick);
      element.remove();
    },
  };
}
