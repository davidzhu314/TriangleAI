/**
 * Measure a generated case the way the app will: the real loader (client/src/case) and V2's
 * buildGraph + measureRoute (junction-aware 5 mm-window turning). Used for seed tuning and tests.
 */
import { loadCase } from '../../client/src/case';
import type { CaseLoadResult, CostVector, LoadedCase, RouteMeasures } from '../../client/src/contracts';
import { buildGraph } from '../../client/src/optimize/graph';
import { measureRoute } from '../../client/src/optimize/measure-route';
import { writeGlb } from '../lib/glb';
import { stableStringify } from '../lib/stable-json';
import type { GeneratedCase } from './arch';

export interface MeasuredRoute {
  entry: string;
  target: string;
  edges: string[];
  measures: RouteMeasures;
}

/**
 * Turn and diameter limits of V3's illustrative presets, read from lane/vaibhav (not imported).
 * Used only to check the Type III case keeps three routes some preset could take.
 */
export const SOFT_ANGLED_MAX_TURN_DEG = 110;
export const MIN_VESSEL_DIAMETER_M = 0.00089 + 0.001;

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

const LOWER_BETTER: (keyof CostVector)[] = ['lengthM', 'sharpestTurnDeg', 'totalTurningDeg', 'heavyCrossings', 'proximityPenalty', 'estFluoroS'];

/** a dominates b: no worse on every measure and better on one (narrowest radius: higher is better). */
export function dominates(a: CostVector, b: CostVector): boolean {
  let better = false;
  for (const k of LOWER_BETTER) {
    const x = a[k] as number, y = b[k] as number;
    if (x > y) return false;
    if (x < y) better = true;
  }
  if (a.narrowestRadiusM < b.narrowestRadiusM) return false;
  if (a.narrowestRadiusM > b.narrowestRadiusM) better = true;
  return better;
}

/** Routes a soft angled wire could take with no heavy crossing (V3's "safe"), then the non-dominated ones. */
export function safeFrontier(routes: MeasuredRoute[], target: string): MeasuredRoute[] {
  const safe = routes.filter(
    (r) =>
      r.target === target &&
      r.measures.cost.sharpestTurnDeg <= SOFT_ANGLED_MAX_TURN_DEG &&
      2 * r.measures.cost.narrowestRadiusM >= MIN_VESSEL_DIAMETER_M &&
      r.measures.cost.heavyCrossings === 0 &&
      r.measures.violations.length === 0,
  );
  return safe.filter((r) => !safe.some((o) => o !== r && dominates(o.measures.cost, r.measures.cost)));
}
