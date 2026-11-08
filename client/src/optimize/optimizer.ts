/**
 * The optimizer (spec §4.3–4.7): enumerate routes for each entry × target × preset, measure them,
 * apply the hard constraints, and return the Pareto frontier among safe routes, or "no safe route"
 * with a suggested change.
 *
 * - Enumeration: DFS for simple paths capped at 50 per entry × target × preset. On large graphs
 *   (more than LARGE_GRAPH_EDGES edges), Yen's k = 10 shortest paths on length instead, run per
 *   preset on the edges that preset can use (not too narrow, no forbidden zone).
 * - Hard constraints (§4.4): too narrow (2·r_min < device diameter + 1 mm), turn sharper than the
 *   preset's maximum (route-level 5 mm window, junctions included), forbidden zone.
 * - Safe = feasible with no heavy crossing (DECISIONS.md, "Safe route"). The frontier is taken
 *   among safe routes, so `minHeavyCrossings` is 0; heavy-crossing routes stay in `candidates`
 *   for the Plan score's cap.
 * - Without real recorded runs (D4), the §4.4 arch constraint and the two simulated measures are
 *   absent and `recordedRunsUsed` is false.
 *
 * Deterministic geometry and search; no AI model is involved.
 */

import type {
  ConstraintViolation,
  Frontier,
  FrontierRoute,
  NoSafeRoute,
  OptimizeRequest,
  OptimizeResult,
  Route,
  RouteSuggestion,
  WirePresetId,
  ZoneCrossing,
} from '../contracts';
import { frontierLabels, paretoFrontier } from './frontier';
import type { RouteGraph } from './graph';
import { measureRouteDetailed, type DetailedRouteMeasures } from './measure-route';
import { DFS_PATH_CAP, simplePaths, yenKShortest, YEN_K, type GraphPath } from './paths';
import { getPreset, PRESET_IDS } from './presets';
import { BRANCH_ENTRY_DEG, steerableAt, type Steerability } from './steerability';

/** Graphs with more edges than this switch from DFS to Yen's k-shortest. Illustrative. */
export const LARGE_GRAPH_EDGES = 64;

export function routeId(entryId: string, presetId: WirePresetId, edges: readonly string[]): string {
  return `${entryId}|${presetId}|${edges.join(',')}`;
}

export const isSafe = (r: Route): boolean => r.feasible && r.cost.heavyCrossings === 0;

/** Enumerates and measures routes, caching paths and measures across presets and calls. */
export class RouteEnumerator {
  private readonly paths = new Map<string, GraphPath[]>();
  private readonly measured = new Map<string, DetailedRouteMeasures>();
  private readonly steered = new Map<string, Steerability>();
  readonly large: boolean;

  /**
   * `steering: false` skips the cannot_steer check. Only for synthetic graphs that test path search
   * or timing (grids with 90° branches no wire can steer); the app and every case keep it on.
   */
  constructor(
    readonly graph: RouteGraph,
    readonly options: { steering?: boolean } = {},
  ) {
    this.large = graph.edges.size > LARGE_GRAPH_EDGES;
  }

  routes(entryId: string, targetId: string, presetId: WirePresetId): Route[] {
    const from = this.graph.entries.get(entryId);
    const to = this.graph.targets.get(targetId);
    if (from === undefined) throw new Error(`unknown entry ${entryId}`);
    if (to === undefined) throw new Error(`unknown target ${targetId}`);
    return this.pathsFor(from, to, presetId).map((p) => assembleRoute(entryId, targetId, presetId, p, this.measure(from, p), () => this.steer(from, p, presetId)));
  }

  private pathsFor(from: string, to: string, presetId: WirePresetId): GraphPath[] {
    const key = this.large ? `${from}>${to}>${presetId}` : `${from}>${to}`;
    let ps = this.paths.get(key);
    if (!ps) {
      if (this.large) {
        const preset = getPreset(presetId);
        const forbiddenZones = new Set(this.graph.zones.filter((z) => z.tier === 'forbidden').map((z) => z.id));
        const usable = (eid: string) => {
          const e = this.graph.edges.get(eid)!;
          return 2 * e.measures.rMinM >= preset.minVesselDiameterM && !e.measures.zonesOnEdge.some((z) => forbiddenZones.has(z));
        };
        ps = yenKShortest(this.graph, from, to, YEN_K, usable);
      } else {
        ps = simplePaths(this.graph, from, to, DFS_PATH_CAP);
      }
      this.paths.set(key, ps);
    }
    return ps;
  }

  private steer(from: string, p: GraphPath, presetId: WirePresetId): Steerability {
    if (this.options.steering === false) return { ok: true, failures: [] };
    const key = `${from}>${presetId}>${p.edges.join(',')}`;
    let s = this.steered.get(key);
    if (!s) {
      s = steerableAt(this.graph, p.edges, presetId, from);
      this.steered.set(key, s);
    }
    return s;
  }

  private measure(from: string, p: GraphPath): DetailedRouteMeasures {
    const key = `${from}>${p.edges.join(',')}`;
    let m = this.measured.get(key);
    if (!m) {
      m = measureRouteDetailed(this.graph, p.edges, { startNode: from });
      this.measured.set(key, m);
    }
    return m;
  }
}

/**
 * The steering violations (spec §5.3, contracts v2): one per branch point where the preset's tip can't
 * point into the planned edge, so the rail wire would take another branch (DECISIONS.md, "cannot_steer").
 * Checked only on routes that pass every other constraint, so a blocked route keeps one clear reason.
 */
export function steerViolations(s: Steerability): ConstraintViolation[] {
  return s.failures.map((f) => ({ kind: 'cannot_steer' as const, edge: f.edge, takeoffDeg: f.takeoffDeg, tipDeg: f.tipDeg, toleranceDeg: BRANCH_ENTRY_DEG }));
}

/** A Route from a measured path, with the preset's constraint checks (§4.4) and steering (§5.3). */
function assembleRoute(entryId: string, targetId: string, presetId: WirePresetId, p: GraphPath, m: DetailedRouteMeasures, steer: () => Steerability): Route {
  const preset = getPreset(presetId);
  const violations: ConstraintViolation[] = [];
  m.route.edges.forEach((e, i) => {
    const diameterM = 2 * e.measures.rMinM;
    if (diameterM < preset.minVesselDiameterM) {
      violations.push({ kind: 'too_narrow', edge: e.id, diameterM, requiredM: preset.minVesselDiameterM });
    }
    const turnDeg = m.edgeMaxTurnDeg[i]!;
    if (turnDeg > preset.maxTurnDeg) violations.push({ kind: 'turn_too_sharp', edge: e.id, turnDeg, maxTurnDeg: preset.maxTurnDeg });
  });
  violations.push(...m.measures.violations);
  if (violations.length === 0) violations.push(...steerViolations(steer()));
  return {
    id: routeId(entryId, presetId, p.edges),
    entryId,
    targetId,
    presetId,
    edges: [...p.edges],
    nodes: [...p.nodes],
    feasible: violations.length === 0,
    cost: { ...m.measures.cost },
    violations,
    crossings: m.measures.crossings.map((c) => ({ ...c })),
    sharpestTurnEdge: m.measures.sharpestTurnEdge,
  };
}

/**
 * Measure and check one route the optimizer may not have enumerated (a path past the DFS cap or
 * outside Yen's k). Same measures and constraint checks as the optimizer's own routes. Throws
 * RouteError if the edges don't connect from the entry.
 */
export function routeFor(graph: RouteGraph, entryId: string, targetId: string, presetId: WirePresetId, edges: readonly string[]): Route {
  const from = graph.entries.get(entryId);
  if (from === undefined) throw new Error(`unknown entry ${entryId}`);
  const m = measureRouteDetailed(graph, edges, { startNode: from });
  return assembleRoute(entryId, targetId, presetId, { edges: [...edges], nodes: m.route.nodes }, m, () => steerableAt(graph, edges, presetId, from));
}

function dedupe<T>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((x) => {
    const k = JSON.stringify(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const byLengthThenId = (a: Route, b: Route) => a.cost.lengthM - b.cost.lengthM || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function optimizeCase(graph: RouteGraph, request: OptimizeRequest, enumerator = new RouteEnumerator(graph)): OptimizeResult {
  if (request.caseId !== graph.caseId) throw new Error(`optimizer has case ${graph.caseId}, request is for ${request.caseId}`);
  const allEntries = [...graph.entries.keys()];
  const entries = request.entryIds ?? allEntries;
  const presets = request.presetIds ?? [...PRESET_IDS];
  const target = request.targetId;

  const candidates: Route[] = [];
  for (const e of entries) for (const p of presets) candidates.push(...enumerator.routes(e, target, p));

  const safe = candidates.filter(isSafe);
  if (safe.length > 0) {
    const front = paretoFrontier(safe).sort(byLengthThenId);
    const labels = frontierLabels(front);
    const routes: FrontierRoute[] = front.map((r, i) => ({ ...r, labels: labels[i]! }));
    const frontier: Frontier = {
      kind: 'frontier',
      caseId: graph.caseId,
      targetId: target,
      minHeavyCrossings: 0,
      routes,
      candidates,
      recordedRunsUsed: false,
    };
    return frontier;
  }

  const crossings: ZoneCrossing[] = dedupe(
    candidates.filter((r) => r.feasible).flatMap((r) => r.crossings.filter((c) => c.tier === 'heavy')),
  );
  const reasons = dedupe(candidates.flatMap((r) => r.violations));
  const result: NoSafeRoute = {
    kind: 'no_safe_route',
    caseId: graph.caseId,
    targetId: target,
    reasons,
    crossings,
    suggestion: suggestChange(enumerator, target, entries, presets, allEntries),
  };
  return result;
}

/**
 * The change that would give a safe route: another preset for the same entries first, then another
 * entry with the same presets, then both. Within each, the option whose best safe route is shortest
 * wins, with ties going to case and preset order. Null when no change helps, or nothing was left
 * out of the request.
 */
function suggestChange(
  en: RouteEnumerator,
  target: string,
  entries: readonly string[],
  presets: readonly WirePresetId[],
  allEntries: readonly string[],
): RouteSuggestion | null {
  const otherPresets = PRESET_IDS.filter((p) => !presets.includes(p));
  const otherEntries = allEntries.filter((e) => !entries.includes(e));
  const bestSafe = (es: readonly string[], ps: readonly WirePresetId[]): number => {
    let best = Infinity;
    for (const e of es) for (const p of ps) for (const r of en.routes(e, target, p)) if (isSafe(r)) best = Math.min(best, r.cost.lengthM);
    return best;
  };
  const pick = <T>(options: T[], score: (o: T) => number): T | null => {
    let best: T | null = null;
    let bestScore = Infinity;
    for (const o of options) {
      const s = score(o);
      if (s < bestScore) {
        best = o;
        bestScore = s;
      }
    }
    return best;
  };
  const preset = pick(otherPresets, (p) => bestSafe(entries, [p]));
  if (preset) return { change: 'preset', presetId: preset };
  const entry = pick(otherEntries, (e) => bestSafe([e], presets));
  if (entry) return { change: 'entry', entryId: entry };
  const pairs = otherEntries.flatMap((e) => otherPresets.map((p) => [e, p] as const));
  const pair = pick(pairs, ([e, p]) => bestSafe([e], [p]));
  if (pair) return { change: 'entry_and_preset', entryId: pair[0], presetId: pair[1] };
  return null;
}
