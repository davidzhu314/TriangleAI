/**
 * Plan marks (G5): the edges of the player's route that are a problem, for the Plan screen to highlight and
 * for Cathy's "is this right" answer. No new maths: each mark restates a result the engine already has.
 * - 'cannot_steer': a cannot_steer violation on the route, or (with the graph) a branch point where
 *   `steerableAt` finds no roll that enters the planned edge;
 * - 'off_frontier': the first edge where the route leaves every frontier route for its entry and wire
 *   (the prefix test planAssist uses);
 * - 'heavy_zone': an edge whose zone crossing is heavy or forbidden (the route's own `crossings`).
 * One mark per edge and reason, in route order, then by reason. Pure.
 */

import type { FeedbackLine, LoadedCase, OptimizeResult, RouteMeasures, WirePresetId, ZoneCrossing } from '../contracts';
import type { RouteGraph } from '../optimize/graph';
import { steerableAt } from '../optimize/steerability';
import { Names } from './feedback';
import { feedbackLine } from './templates';

export type PlanMarkWhy = 'cannot_steer' | 'off_frontier' | 'heavy_zone';

export interface PlanMark {
  edge: string;
  why: PlanMarkWhy;
  /** For 'heavy_zone': the zone crossed. */
  zone?: string;
}

export interface PlanMarksInput {
  /** Edges chosen so far, from the entry. */
  routeSoFar: readonly string[];
  /** measureRoute (or the optimizer) on routeSoFar: its violations and crossings. */
  measures: Pick<RouteMeasures, 'violations' | 'crossings'> | null;
  optimized: OptimizeResult;
  entryId: string;
  presetId: WirePresetId;
  /** The case's graph: with it, steering is checked at every branch point of the route so far. */
  graph?: RouteGraph;
}

const WHY_ORDER: readonly PlanMarkWhy[] = ['cannot_steer', 'off_frontier', 'heavy_zone'];
const HEAVY: ReadonlySet<ZoneCrossing['tier']> = new Set(['heavy', 'forbidden']);

export function planMarks(input: PlanMarksInput): PlanMark[] {
  const { routeSoFar: route, measures, optimized, entryId, presetId, graph } = input;
  if (route.length === 0) return [];
  const marks: PlanMark[] = [];
  const add = (m: PlanMark) => {
    if (route.includes(m.edge) && !marks.some((x) => x.edge === m.edge && x.why === m.why)) marks.push(m);
  };

  for (const v of measures?.violations ?? []) if (v.kind === 'cannot_steer') add({ edge: v.edge, why: 'cannot_steer' });
  if (graph) {
    const entry = graph.entries.get(entryId);
    for (const f of steerableAt(graph, route, presetId, entry).failures) add({ edge: f.edge, why: 'cannot_steer' });
  }

  if (optimized.kind === 'frontier') {
    const mine = optimized.routes.filter((r) => r.entryId === entryId && r.presetId === presetId);
    for (let k = 0; k < route.length; k++) {
      const prefix = route.slice(0, k + 1);
      if (!mine.some((r) => prefix.every((e, i) => r.edges[i] === e))) {
        add({ edge: route[k]!, why: 'off_frontier' });
        break;
      }
    }
  }

  for (const c of measures?.crossings ?? []) if (HEAVY.has(c.tier)) add({ edge: c.edge, why: 'heavy_zone', zone: c.zone });

  const at = (e: string) => route.indexOf(e);
  return marks.sort((a, b) => at(a.edge) - at(b.edge) || WHY_ORDER.indexOf(a.why) - WHY_ORDER.indexOf(b.why));
}

/** The spoken line for a mark. */
export function planMarkLine(m: PlanMark, c: LoadedCase): FeedbackLine {
  const n = new Names(c);
  const vessel = n.vesselOfEdge(m.edge);
  switch (m.why) {
    case 'cannot_steer':
      return feedbackLine('assist.mark_cannot_steer', { vessel }, 'plan.feasible');
    case 'off_frontier':
      return feedbackLine('assist.mark_off_frontier', { vessel }, 'rank.weighted');
    case 'heavy_zone':
      return feedbackLine('assist.mark_heavy_zone', { vessel, zone: m.zone ? n.zone(m.zone) : 'a heavy risk zone' }, 'plan.heavy_cap');
  }
}
