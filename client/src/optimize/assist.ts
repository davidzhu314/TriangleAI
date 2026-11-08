/**
 * Assistant answers while planning ("best next artery", "my options"), computed by the engine only:
 * no AI model computes any route or number (CLAUDE.md, spec §11).
 *
 * Given the edges chosen so far, the options are the next edges of the routes that continue this
 * prefix with the same entry and preset. Routes are ranked with V3's `rankRoutes` over
 * `measureRanges(candidates)`, the same choice the gentleness reference makes; ranks are within the
 * routes that match the prefix, so the best option has rank 0. Frontier routes first; if none
 * continues the prefix, safe candidates (`isSafe`) do, marked `source: 'candidates'`.
 *
 * Steering (Gibran's request, ts-s1404-cta -> lcca): with `graph`, each option says whether the wire
 * can steer at least one of its routes (`steerableAt`), steerable options come first, and `best` is
 * never one it can't steer. If no frontier route continuing the prefix is steerable, steerable safe
 * candidates are offered instead ('off_frontier'); if none is, the options stay listed, flagged, with
 * no best and reason 'cannot_steer'. Without `graph` nothing is checked, as before. Once the optimizer's
 * cannot_steer constraint lands, frontier routes are steerable and this is a double check.
 *
 * Pure: no clock, no randomness; ties go to route id, then edge id.
 */

import type { OptimizeResult, Route, RouteLabel, Weights, WirePresetId } from '../contracts';
import { LABEL_MEASURE } from './frontier';
import type { RouteGraph } from './graph';
import { isSafe } from './optimizer';
import { measureRanges, rankRoutes, type MeasureRanges } from './rank';
import { steerableAt } from './steerability';

export interface BranchOption {
  /** The next edge to add. */
  edge: string;
  /** The node it leads to (what the player pinches). */
  node: string;
  /** Routes continuing this way, sorted. */
  routeIds: string[];
  /** 0 = best at the player's weights, among the routes continuing the prefix. */
  bestRank: number;
  /** Union of those routes' labels, in label order. */
  labels: RouteLabel[];
  source: 'frontier' | 'candidates';
  /** With `graph` only: whether the wire can steer at least one of `routeIds` (steerableAt). */
  steerable?: boolean;
}

export interface PlanAssist {
  /** Ordered by bestRank, then edge id. */
  options: BranchOption[];
  /** options[0], or null; never an option the wire can't steer. */
  best: BranchOption | null;
  reason?: 'complete' | 'off_frontier' | 'no_safe_route' | 'no_continuation' | 'cannot_steer';
}

export interface PlanAssistInput {
  /** What the optimizer returned for the chosen target. */
  optimized: OptimizeResult;
  weights: Weights;
  entryId: string;
  presetId: WirePresetId;
  /** Edges chosen so far, from the entry. */
  routeSoFar: readonly string[];
  /** The case's graph (`buildGraph`). When given, routes the wire can't steer are never the best. */
  graph?: RouteGraph;
}

const LABEL_ORDER = Object.keys(LABEL_MEASURE) as RouteLabel[];

const startsWith = (edges: readonly string[], prefix: readonly string[]) => edges.length > prefix.length && prefix.every((e, i) => edges[i] === e);

function options(
  routes: readonly (Route & { labels?: RouteLabel[] })[],
  ranges: MeasureRanges,
  weights: Weights,
  prefix: readonly string[],
  source: BranchOption['source'],
  canSteer?: (r: Route) => boolean,
): BranchOption[] {
  const order = rankRoutes(routes, ranges, weights).order;
  const rank = new Map(order.map((r, i) => [r.routeId, i]));
  const byEdge = new Map<string, BranchOption>();
  for (const r of routes) {
    const edge = r.edges[prefix.length]!;
    const o = byEdge.get(edge) ?? { edge, node: r.nodes[prefix.length + 1]!, routeIds: [], bestRank: Infinity, labels: [], source };
    o.routeIds.push(r.id);
    o.bestRank = Math.min(o.bestRank, rank.get(r.id)!);
    for (const l of r.labels ?? []) if (!o.labels.includes(l)) o.labels.push(l);
    if (canSteer) o.steerable = o.steerable === true || canSteer(r);
    byEdge.set(edge, o);
  }
  const steerFirst = (a: BranchOption, b: BranchOption): number => (canSteer ? Number(b.steerable) - Number(a.steerable) : 0);
  return [...byEdge.values()]
    .map((o) => ({ ...o, routeIds: [...o.routeIds].sort(), labels: LABEL_ORDER.filter((l) => o.labels.includes(l)) }))
    .sort((a, b) => steerFirst(a, b) || a.bestRank - b.bestRank || (a.edge < b.edge ? -1 : a.edge > b.edge ? 1 : 0));
}

export function planAssist(input: PlanAssistInput): PlanAssist {
  const { optimized, weights, entryId, presetId, routeSoFar } = input;
  const none = (reason: NonNullable<PlanAssist['reason']>): PlanAssist => ({ options: [], best: null, reason });
  if (optimized.kind === 'no_safe_route') return none('no_safe_route');

  const mine = (r: Route) => r.entryId === entryId && r.presetId === presetId;
  if (routeSoFar.length > 0 && optimized.candidates.some((r) => mine(r) && r.edges.length === routeSoFar.length && r.edges.every((e, i) => e === routeSoFar[i]))) {
    return none('complete');
  }
  const ranges = measureRanges(optimized.candidates);
  const g = input.graph;
  const memo = new Map<string, boolean>();
  const canSteer = g
    ? (r: Route): boolean => {
        let ok = memo.get(r.id);
        if (ok === undefined) memo.set(r.id, (ok = steerableAt(g, r.edges, r.presetId, g.entries.get(r.entryId)).ok));
        return ok;
      }
    : undefined;
  const front = optimized.routes.filter((r) => mine(r) && startsWith(r.edges, routeSoFar));
  const frontOpts = front.length > 0 ? options(front, ranges, weights, routeSoFar, 'frontier', canSteer) : [];
  if (frontOpts.length > 0 && frontOpts[0]!.steerable !== false) return { options: frontOpts, best: frontOpts[0]! };

  // no frontier route continues the prefix, or (with graph) none the wire can steer: the safe candidates
  const safe = optimized.candidates.filter((r) => mine(r) && isSafe(r) && startsWith(r.edges, routeSoFar));
  const safeOpts = safe.length > 0 ? options(safe, ranges, weights, routeSoFar, 'candidates', canSteer) : [];
  if (safeOpts.length > 0 && safeOpts[0]!.steerable !== false) return { options: safeOpts, best: safeOpts[0]!, reason: 'off_frontier' };

  if (frontOpts.length > 0 || safeOpts.length > 0) return { options: frontOpts.length > 0 ? frontOpts : safeOpts, best: null, reason: 'cannot_steer' };
  // nothing safe at all for this entry and wire (every route blocked, e.g. by cannot_steer): say so, don't ask to undo
  if (!optimized.candidates.some((r) => mine(r) && isSafe(r))) return none('no_safe_route');
  return none('no_continuation');
}
