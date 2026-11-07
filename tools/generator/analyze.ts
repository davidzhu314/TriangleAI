/**
 * Measure a generated case the way the app will: the real loader (client/src/case) and V2's
 * buildGraph + measureRoute (junction-aware 5 mm-window turning). Used for seed tuning and tests.
 */
import { loadCase } from '../../client/src/case';
import type { CaseLoadResult, FrontierRoute, LoadedCase, RouteMeasures } from '../../client/src/contracts';
import { buildGraph } from '../../client/src/optimize/graph';
import { measureRoute } from '../../client/src/optimize/measure-route';
import { optimizeCase } from '../../client/src/optimize/optimizer';
import { steerableAt, type Steerability } from '../../client/src/optimize/steerability';
import { writeGlb } from '../lib/glb';
import { stableStringify } from '../lib/stable-json';
import type { GeneratedCase } from './arch';

export interface MeasuredRoute {
  entry: string;
  target: string;
  edges: string[];
  measures: RouteMeasures;
}

export async function loadGenerated(g: GeneratedCase, withMesh = true): Promise<CaseLoadResult> {
  const enc = new TextEncoder();
  return loadCase({
    kind: 'files',
    origin: 'bundled',
    files: {
      'case.json': enc.encode(stableStringify(g.caseJson)),
      'centerlines.json': enc.encode(stableStringify(g.centerlines)),
      'vessels.glb': writeGlb(withMesh ? g.meshes : []),
    },
  });
}

/** Every simple path from `from` to `to` (the generated graphs are small). */
export function simplePaths(c: LoadedCase, from: string, to: string): string[][] {
  const out: string[][] = [];
  const walk = (at: string, seen: Set<string>, path: string[]) => {
    if (at === to) {
      out.push([...path]);
      return;
    }
    for (const e of c.edges) {
      const next = e.from === at ? e.to : e.to === at ? e.from : null;
      if (next === null || seen.has(next)) continue;
      seen.add(next);
      path.push(e.id);
      walk(next, seen, path);
      path.pop();
      seen.delete(next);
    }
  };
  walk(from, new Set([from]), []);
  return out;
}

/** Every simple route from every entry to every target, measured. */
export function measureAll(c: LoadedCase): MeasuredRoute[] {
  const graph = buildGraph(c);
  const nodeOf = (list: { id: string; node: string }[], id: string) => list.find((x) => x.id === id)!.node;
  const out: MeasuredRoute[] = [];
  for (const entry of c.entries) {
    for (const target of c.targets) {
      for (const edges of simplePaths(c, nodeOf(c.entries, entry.id), nodeOf(c.targets, target.id))) {
        out.push({ entry: entry.id, target: target.id, edges, measures: measureRoute(graph, edges, { startNode: entry.node }) });
      }
    }
  }
  return out;
}

/** A V3 frontier route with its §5.3 steerability for its own preset. */
export interface SteeredRoute {
  route: FrontierRoute;
  steer: Steerability;
  /**
   * Takeoff into each branch the tip has to be rolled into, degrees. Read from steerableAt with the
   * stiff straight preset (0° tip), which reports every takeoff beyond 25° as a failure; branches
   * the wire simply continues into are not listed.
   */
  takeoffs: { node: string; edge: string; deg: number }[];
}

/** V3's real frontier for one target, each route checked with steerableAt (spec §5.3). */
export function frontierWithSteering(c: LoadedCase, targetId: string): SteeredRoute[] | null {
  const graph = buildGraph(c);
  const res = optimizeCase(graph, { caseId: c.id, targetId });
  if (res.kind !== 'frontier') return null;
  const startOf = (entryId: string) => c.entries.find((e) => e.id === entryId)!.node;
  return res.routes.map((route) => ({
    route,
    steer: steerableAt(graph, route.edges, route.presetId, startOf(route.entryId)),
    takeoffs: steerableAt(graph, route.edges, 'stiff_straight', startOf(route.entryId)).failures.map((f) => ({ node: f.node, edge: f.edge, deg: f.takeoffDeg })),
  }));
}
