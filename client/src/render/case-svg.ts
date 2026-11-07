/**
 * The shared 2D front (AP) drawing of a case, used by the Plan and Compare views until the three.js scene lands.
 * Vessel bands come from the case's own centerlines and radii; risk zones carry their tier's mark. Every colour,
 * opacity and stroke is a token, applied through render.css classes.
 *
 * Positions are metres, Y-up: +X patient left (viewer's right), +Y superior. Drawing units are millimetres.
 */
import type { LoadedCase, RiskTier, Vec3 } from '../contracts';

const SVG = 'http://www.w3.org/2000/svg';

export function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** Screen coordinates in mm for the AP projection: x right, y down. */
export const project = (p: Vec3): [number, number] => [p[0] * 1000, -p[1] * 1000];
export const toPoints = (points: readonly Vec3[]): string => points.map((p) => project(p).map((n) => n.toFixed(2)).join(',')).join(' ');

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

export interface CaseDrawing {
  svg: SVGSVGElement;
  /** Marker size in mm, relative to the case so it reads at any scale. */
  handle: number;
  /** Polyline points of a route walked from a node along edges, joined end to end. */
  routePoints(startNode: string | undefined, edges: readonly string[]): string;
  nodePos(id: string): [number, number] | undefined;
}

/** Build the base drawing: vessels and risk zones. Callers add their own layers on top. */
export function drawCase(c: LoadedCase, label: string, hatchId: string): CaseDrawing {
  const nodes = new Map(c.nodes.map((n) => [n.id, n]));
  const edges = new Map(c.edges.map((e) => [e.id, e]));
  const all = c.edges.flatMap((e) => e.points).map(project);
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const maxR = Math.max(...c.edges.flatMap((e) => e.radiiM)) * 1000;
  const pad = maxR * 2.5;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) - Math.min(...xs) + pad * 2;
  const h = Math.max(...ys) - Math.min(...ys) + pad * 2;
  const handle = Math.max(w, h) * 0.018;

  const svg = svgEl('svg', { viewBox: `${minX} ${minY} ${w} ${h}`, class: 'plan-view-svg', role: 'img', preserveAspectRatio: 'xMidYMid meet' });
  svg.setAttribute('aria-label', label);
  const defs = svgEl('defs', {});
  const hatch = svgEl('pattern', { id: hatchId, width: handle * 0.6, height: handle * 0.6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
  hatch.append(svgEl('line', { x1: 0, y1: 0, x2: 0, y2: handle * 0.6, class: 'hatch-line' }));
  defs.append(hatch);
  svg.append(defs);

  const meanR = (radii: readonly number[]): number => (radii.reduce((a, b) => a + b, 0) / Math.max(1, radii.length)) * 1000;
  const vessels = svgEl('g', { class: 'vessels' });
  for (const e of c.edges) vessels.append(svgEl('polyline', { points: toPoints(e.points), class: 'vessel', 'stroke-width': (meanR(e.radiiM) * 2).toFixed(2) }));
  const zones = svgEl('g', { class: 'zones' });
  for (const z of c.riskZones) {
    const edge = edges.get(z.edge);
    if (!edge) continue;
    const seg = slice(edge.points, z.fromM, z.toM);
    if (seg.length < 2) continue;
    const zone = svgEl('polyline', { points: toPoints(seg), class: `zone ${TIER_CLASS[z.tier]}`, 'stroke-width': (meanR(edge.radiiM) * 2.4).toFixed(2) });
    if (z.tier === 'heavy') zone.setAttribute('stroke', `url(#${hatchId})`);
    zones.append(zone);
  }
  svg.append(vessels, zones);

  return {
    svg,
    handle,
    routePoints(startNode, routeEdges) {
      const out: Vec3[] = [];
      let at = startNode;
      for (const id of routeEdges) {
        const e = edges.get(id);
        if (!e || at === undefined) break;
        const forward = e.from === at;
        const p = forward ? e.points : [...e.points].reverse();
        out.push(...(out.length ? p.slice(1) : p));
        at = forward ? e.to : e.from;
      }
      return toPoints(out);
    },
    nodePos(id) {
      const n = nodes.get(id);
      return n ? project(n.pos) : undefined;
    },
  };
}
