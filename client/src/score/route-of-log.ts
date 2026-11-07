/**
 * The player's route, rebuilt from the event log's header: id `${entryId}|${presetId}|${path}`, looked
 * up among the optimizer's candidates. A path the optimizer did not enumerate (past the DFS cap, or
 * outside Yen's k) is measured and checked here with the optimizer's own `routeFor`.
 */

import type { EventLog, LoadedCase, OptimizeResult, Route } from '../contracts';
import { buildGraph } from '../optimize/graph';
import { routeFor, routeId } from '../optimize/optimizer';

export interface PlayerRoute {
  route: Route;
  /** True when the route is one of the optimizer's candidates. */
  inCandidates: boolean;
}

export function routeIdOfLog(log: EventLog): string {
  return routeId(log.entryId, log.presetId, log.path);
}

export function playerRoute(log: EventLog, optimized: OptimizeResult, c: LoadedCase): PlayerRoute {
  const id = routeIdOfLog(log);
  if (optimized.kind === 'frontier') {
    const found = optimized.candidates.find((r) => r.id === id);
    if (found) return { route: found, inCandidates: true };
  }
  return { route: routeFor(buildGraph(c), log.entryId, log.targetId, log.presetId, log.path), inCandidates: false };
}
