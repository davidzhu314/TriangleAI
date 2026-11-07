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
 * Pure: no clock, no randomness; ties go to route id, then edge id.
 */

import type { OptimizeResult, Route, RouteLabel, Weights, WirePresetId } from '../contracts';
import { LABEL_MEASURE } from './frontier';
import { isSafe } from './optimizer';
import { measureRanges, rankRoutes, type MeasureRanges } from './rank';

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
}

export interface PlanAssist {
  /** Ordered by bestRank, then edge id. */
  options: BranchOption[];
  /** options[0], or null. */
  best: BranchOption | null;
  reason?: 'complete' | 'off_frontier' | 'no_safe_route' | 'no_continuation';
}

export interface PlanAssistInput {
  /** What the optimizer returned for the chosen target. */
  optimized: OptimizeResult;
  weights: Weights;
  entryId: string;
  presetId: WirePresetId;
  /** Edges chosen so far, from the entry. */
  routeSoFar: readonly string[];
}

const LABEL_ORDER = Object.keys(LABEL_MEASURE) as RouteLabel[];

const startsWith = (edges: readonly string[], prefix: readonly string[]) => edges.length > prefix.length && prefix.every((e, i) => edges[i] === e);

function options(routes: readonly (Route & { labels?: RouteLabel[] })[], ranges: MeasureRanges, weights: Weights, prefix: readonly string[], source: BranchOption['source']): BranchOption[] {
  const order = rankRoutes(routes, ranges, weights).order;
  const rank = new Map(order.map((r, i) => [r.routeId, i]));
  const byEdge = new Map<string, BranchOption>();
  for (const r of routes) {
    const edge = r.edges[prefix.length]!;
    const o = byEdge.get(edge) ?? { edge, node: r.nodes[prefix.length + 1]!, routeIds: [], bestRank: Infinity, labels: [], source };
    o.routeIds.push(r.id);
    o.bestRank = Math.min(o.bestRank, rank.get(r.id)!);
    for (const l of r.labels ?? []) if (!o.labels.includes(l)) o.labels.push(l);
    byEdge.set(edge, o);
  }
  return [...byEdge.values()]
    .map((o) => ({ ...o, routeIds: [...o.routeIds].sort(), labels: LABEL_ORDER.filter((l) => o.labels.includes(l)) }))
    .sort((a, b) => a.bestRank - b.bestRank || (a.edge < b.edge ? -1 : a.edge > b.edge ? 1 : 0));
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
  const front = optimized.routes.filter((r) => mine(r) && startsWith(r.edges, routeSoFar));
  if (front.length > 0) {
    const opts = options(front, ranges, weights, routeSoFar, 'frontier');
    return { options: opts, best: opts[0]! };
  }
  const safe = optimized.candidates.filter((r) => mine(r) && isSafe(r) && startsWith(r.edges, routeSoFar));
  if (safe.length > 0) {
    const opts = options(safe, ranges, weights, routeSoFar, 'candidates');
    return { options: opts, best: opts[0]!, reason: 'off_frontier' };
  }
  return none('no_continuation');
}
