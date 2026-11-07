/**
 * measureRoute: the measures of a full or partial route (spec §4.6), called by the Plan screen on
 * every click.
 *
 * - Sharpest turn and total turning run over the joined route polyline, so the 5 mm window spans
 *   branch points (DECISIONS.md, "Route-level turning").
 * - Length, narrowest radius, crossings and proximity come from the per-edge measures in the graph.
 * - Estimated fluoro uses the illustrative coefficients in ./constants.
 *
 * Preset constraints (too narrow, turn too sharp) need a preset and arrive with the optimizer in V3,
 * so `violations` here holds only the preset-independent forbidden-zone check. The two simulated
 * measures are never set here: they need real recorded runs.
 */

import type { ConstraintViolation, CostVector, RouteMeasures, ZoneCrossing } from '../contracts';
import { DEG_PER_TURN, FLUORO_S_PER_CM, FLUORO_S_PER_TURN, PROXIMITY_SCALE_M } from './constants';
import type { GraphEdge, RouteGraph } from './graph';
import { joinRoute, lengthMm, summarizeTurning, windowedTurning, type Point3 } from './measures';

export interface MeasureRouteOptions {
  /** Node the route starts from (usually the entry). Default: inferred from the edge chain. */
  startNode?: string;
}

export class RouteError extends Error {
  override name = 'RouteError';
}

export interface OrientedRoute {
  edges: GraphEdge[];
  /** Whether each edge is walked to → from. */
  reversed: boolean[];
  /** Node ids along the route, edges.length + 1. */
  nodes: string[];
}

/** Orient a chain of edge ids into a walk. Throws RouteError if the edges don't connect. */
export function orientRoute(graph: RouteGraph, edgeIds: readonly string[], options: MeasureRouteOptions = {}): OrientedRoute {
  if (edgeIds.length === 0) throw new RouteError('measureRoute: a route needs at least one edge');
  const edges = edgeIds.map((id) => {
    const e = graph.edges.get(id);
    if (!e) throw new RouteError(`measureRoute: unknown edge ${id}`);
    return e;
  });
  const first = edges[0]!;
  let start = options.startNode;
  if (start === undefined) {
    const second = edges[1];
    if (second) {
      const touches = (n: string) => n === second.from || n === second.to;
      // walk the first edge toward the node it shares with the second
      if (touches(first.to)) start = first.from;
      else if (touches(first.from)) start = first.to;
      else throw new RouteError(`measureRoute: edge ${second.id} does not continue from ${first.id}`);
    } else {
      start = graph.entryNodes.has(first.to) && !graph.entryNodes.has(first.from) ? first.to : first.from;
    }
  }

  const reversed: boolean[] = [];
  const nodes = [start];
  let at = start;
  for (const e of edges) {
    if (e.from === at) {
      reversed.push(false);
      at = e.to;
    } else if (e.to === at) {
      reversed.push(true);
      at = e.from;
    } else {
      throw new RouteError(`measureRoute: edge ${e.id} does not continue from node ${at}`);
    }
    nodes.push(at);
  }
  return { edges, reversed, nodes };
}

/**
 * Which route edge a window sample at arc length `s` belongs to (DECISIONS.md, "Turn attribution").
 *
 * A junction's turn is felt by every window within w of it, so a sample within w of a junction
 * belongs to the edge entered there: a turn into a branch counts once, against that branch. When
 * two junctions are less than w apart, the nearest junction wins and a tie goes to the junction
 * entered first. So a short middle edge keeps the turn into it and is never skipped. A sample
 * with no junction within w belongs to the edge it lies on.
 *
 * Returns an edge index: 0 is the first edge, and junction k (0-based) enters edge k + 1.
 */
export function attributeSample(s: number, junctionS: readonly number[], w: number): number {
  let nearest = -1;
  let best = Infinity;
  for (let k = 0; k < junctionS.length; k++) {
    const d = Math.abs(s - junctionS[k]!);
    if (d <= w && d < best) {
      best = d;
      nearest = k;
    }
  }
  if (nearest >= 0) return nearest + 1;
  let idx = 0;
  while (idx < junctionS.length && junctionS[idx]! <= s) idx++;
  return idx;
}

export function measureRoute(graph: RouteGraph, edgeIds: readonly string[], options: MeasureRouteOptions = {}): RouteMeasures {
  return measureRouteDetailed(graph, edgeIds, options).measures;
}

export interface DetailedRouteMeasures {
  measures: RouteMeasures;
  route: OrientedRoute;
  /** Largest 5 mm-window turn attributed to each route edge, degrees (junctions count for the entered edge). */
  edgeMaxTurnDeg: number[];
}

/** measureRoute plus what the optimizer's constraint checks need. */
export function measureRouteDetailed(graph: RouteGraph, edgeIds: readonly string[], options: MeasureRouteOptions = {}): DetailedRouteMeasures {
  const route = orientRoute(graph, edgeIds, options);
  const { points, junctionS } = joinRoute(
    route.edges.map((e) => e.pointsMm as readonly Point3[]),
    route.reversed,
  );
  const wt = windowedTurning(points, undefined, undefined, junctionS);
  const turning = summarizeTurning(wt);

  const edgeOf = (s: number) => attributeSample(s, junctionS, wt.windowUsed);
  const edgeMaxTurnDeg = route.edges.map(() => 0);
  let k = -1;
  for (let i = 0; i < wt.thetaRad.length; i++) {
    const idx = edgeOf(wt.s[i]!);
    const deg = (wt.thetaRad[i]! * 180) / Math.PI;
    if (deg > edgeMaxTurnDeg[idx]!) edgeMaxTurnDeg[idx] = deg;
    if (k < 0 || wt.thetaRad[i]! > wt.thetaRad[k]!) k = i;
  }
  let sharpestTurnEdge: string | null = null;
  if (turning.thetaMaxDeg > 0 && k >= 0) sharpestTurnEdge = route.edges[edgeOf(wt.s[k]!)]!.id;

  const onRoute = new Set(route.edges.map((e) => e.id));
  const crossings: ZoneCrossing[] = [];
  const violations: ConstraintViolation[] = [];
  const heavy = new Set<string>();
  for (const e of route.edges) {
    for (const zid of e.measures.zonesOnEdge) {
      const z = graph.zones.find((x) => x.id === zid)!;
      if (crossings.some((c) => c.zone === zid && c.edge === e.id)) continue;
      crossings.push({ zone: zid, tier: z.tier, edge: e.id });
      if (z.tier === 'heavy') heavy.add(zid);
      if (z.tier === 'forbidden') violations.push({ kind: 'forbidden_zone', edge: e.id, zone: zid });
    }
  }

  let proximityPenalty = 0;
  for (const z of graph.zones) {
    if (z.tier !== 'proximity') continue;
    let clearance = Infinity;
    for (const id of onRoute) clearance = Math.min(clearance, graph.edges.get(id)!.measures.proximityClearanceM.get(z.id)!);
    proximityPenalty += Math.max(0, 1 - clearance / PROXIMITY_SCALE_M);
  }

  const lengthM = lengthMm(points) / 1000;
  const cost: CostVector = {
    lengthM,
    sharpestTurnDeg: turning.thetaMaxDeg,
    totalTurningDeg: turning.thetaSumDeg,
    narrowestRadiusM: Math.min(...route.edges.map((e) => e.measures.rMinM)),
    heavyCrossings: heavy.size,
    proximityPenalty,
    estFluoroS: lengthM * 100 * FLUORO_S_PER_CM + (turning.thetaSumDeg / DEG_PER_TURN) * FLUORO_S_PER_TURN,
  };
  return { measures: { cost, violations, crossings, sharpestTurnEdge }, route, edgeMaxTurnDeg };
}
