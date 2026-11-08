/**
 * Replay timeline (spec §6.3): "the driven path over the best frontier route, with force spikes and
 * wrong branches marked on the timeline", as data for the Results/Replay screen, so the screen never
 * parses the raw event log.
 *
 * Pure: no clock, no randomness. The best route is the same choice the gentleness reference makes
 * (`bestFrontierRoute`); with no safe route it is the player's own route. Marker labels come from
 * the `replay.*` feedback templates, so every number in a label is in its `values`.
 */

import { WIRE_EVENT_KINDS, type EventLog, type LoadedCase, type Vec3, type WireEvent } from '../contracts';
import { buildGraph } from '../optimize/graph';
import { orientRoute } from '../optimize/measure-route';
import { joinRoute, type Point3 } from '../optimize/measures';
import { timeOf } from './drive';
import { Names } from './feedback';
import { routeIdOfLog } from './route-of-log';
import { bestFrontierRoute, type ScoreInput } from './score';
import { feedbackLine, round, type TemplateValues } from './templates';

export interface ReplayMarker {
  t: number;
  kind: WireEvent['kind'];
  /** The sample tip at or just before the event's t, m. */
  tip: Vec3;
  /** From a `replay.*` template; every number in it is in `values`. */
  label: string;
  values: TemplateValues;
}

export interface ReplayTimeline {
  /** Seconds to the target, or to the last sample (CaseResult.drive.timeS). */
  durationS: number;
  /** Sample tips, in order, m. */
  drivenPath: Vec3[];
  /** Best frontier route at the player's weights; the player's own route with no safe route. */
  bestRouteId: string;
  /** Its centerline, entry to target, m. */
  bestPath: Vec3[];
  /** Ordered by t, then event kind (WIRE_EVENT_KINDS order). One per event. */
  markers: ReplayMarker[];
}

/** Index of the last sample with t ≤ time (0 if none). Samples are ordered by t. */
function sampleAt(log: EventLog, time: number): number {
  let lo = 0;
  let hi = log.samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (log.samples[mid]!.t <= time) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function label(e: WireEvent, n: Names, targetId: string): { label: string; values: TemplateValues } {
  const line = (() => {
    switch (e.kind) {
      case 'wrong_branch':
        return feedbackLine('replay.wrong_branch', { vessel: n.vesselOfEdge(e.edge), expected_vessel: n.vesselOfEdge(e.expectedEdge) }, 'drive.errors');
      case 'prolapse':
        return feedbackLine('replay.prolapse', { vessel: n.vesselOfEdge(e.edge) }, 'drive.errors');
      case 'force_spike':
        return feedbackLine('replay.force_spike', { force_n: round(e.forceN, 3), threshold_n: round(e.thresholdN, 2) }, 'drive.gentleness');
      case 'back_out':
        return feedbackLine('replay.back_out', { dist_mm: round((e.fromS - e.toS) * 1000, 0) }, 'drive.errors');
      case 'contrast_puff':
        return feedbackLine('replay.contrast_puff', {}, 'drive.radiation');
      case 'target_reached':
        return feedbackLine('replay.target_reached', { target: n.target(e.target || targetId) }, 'result.stars');
    }
  })();
  return { label: line.text, values: line.values };
}

export function replayTimeline(input: ScoreInput): ReplayTimeline {
  const { log, case: c } = input;
  const best = bestFrontierRoute(input.optimized, input.weights);
  const route = best ?? { id: routeIdOfLog(log), entryId: log.entryId, edges: log.path };
  const graph = buildGraph(c);
  const oriented = orientRoute(graph, route.edges, { startNode: graph.entries.get(route.entryId)! });
  const byId = new Map(c.edges.map((e) => [e.id, e]));
  const { points } = joinRoute(
    route.edges.map((id) => byId.get(id)!.points as Point3[]),
    oriented.reversed,
  );

  const n = new Names(c);
  const order = (k: WireEvent['kind']) => WIRE_EVENT_KINDS.indexOf(k);
  const markers = log.events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.t - b.e.t || order(a.e.kind) - order(b.e.kind) || a.i - b.i)
    .map(({ e }): ReplayMarker => {
      const s = log.samples[sampleAt(log, e.t)];
      return { t: e.t, kind: e.kind, tip: s ? [s.tip[0], s.tip[1], s.tip[2]] : [0, 0, 0], ...label(e, n, log.targetId) };
    });

  return {
    durationS: timeOf(log),
    drivenPath: log.samples.map((s) => [s.tip[0], s.tip[1], s.tip[2]] as Vec3),
    bestRouteId: route.id,
    bestPath: points.map((p) => [p[0], p[1], p[2]] as Vec3),
    markers,
  };
}

/** The events that count as mistakes on the drive (the route overview's red dots). */
export const MISTAKE_KINDS: readonly WireEvent['kind'][] = ['wrong_branch', 'prolapse', 'back_out', 'force_spike'];

/**
 * The drive's mistakes so far, for the route overview: each wrong branch, prolapse, back-out and force spike, in
 * time order, with the tip where it happened and the same plain line Replay shows. Works on a partial log
 * (RailWireSource.logSoFar) or a finished one, and needs no optimizer result.
 */
export function mistakeMarkers(log: EventLog, c: LoadedCase): ReplayMarker[] {
  const n = new Names(c);
  return log.events
    .filter((e) => MISTAKE_KINDS.includes(e.kind))
    .sort((a, b) => a.t - b.t)
    .map((e): ReplayMarker => {
      const s = log.samples[sampleAt(log, e.t)];
      return { t: e.t, kind: e.kind, tip: s ? [s.tip[0], s.tip[1], s.tip[2]] : [0, 0, 0], ...label(e, n, log.targetId) };
    });
}
