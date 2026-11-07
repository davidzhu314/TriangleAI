/**
 * Compare's logic on the real engine and fixture-y (loaded with loadCase). Where fixture-y can't produce a case
 * (a dominated route, more than four frontier routes, recorded runs), the test builds cost vectors from the
 * engine's own routes and changes one field, so no value is invented from nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCase } from '../../case';
import type { Frontier, LoadedCase, NoSafeRoute, Route } from '../../contracts';
import { buildGraph, normaliseWeights, optimize, routeFor, WIRE_PRESETS, type RouteGraph } from '../../optimize';
import { MEASURE_ROWS } from '../plan/cost-rows';
import { finding, groupRanks, groupRoutes, overlaySelection, startingWeights, visibleMeasures, type RouteGroup } from './model';

const DIR = join(process.cwd(), 'client', 'public', 'cases', 'fixture-y');
let c: LoadedCase;
let graph: RouteGraph;
let frontier: Frontier;
let blocked: NoSafeRoute;

/** The simple path from the first entry to a target node, by walking the graph. */
function pathTo(targetId: string): string[] {
  const start = graph.entries.get(c.entries[0]!.id)!;
  const goal = graph.targets.get(targetId)!;
  const prev = new Map<string, { node: string; edge: string }>();
  const queue = [start];
  const seen = new Set([start]);
  while (queue.length) {
    const at = queue.shift()!;
    for (const edgeId of graph.adjacency.get(at) ?? []) {
      const e = graph.edges.get(edgeId)!;
      const next = e.from === at ? e.to : e.from;
      if (seen.has(next)) continue;
      seen.add(next);
      prev.set(next, { node: at, edge: edgeId });
      queue.push(next);
    }
  }
  const edges: string[] = [];
  for (let n = goal; n !== start; ) {
    const p = prev.get(n)!;
    edges.unshift(p.edge);
    n = p.node;
  }
  return edges;
}

beforeAll(async () => {
  const files = Object.fromEntries(['case.json', 'centerlines.json', 'vessels.glb'].map((n) => [n, new Uint8Array(readFileSync(join(DIR, n)))]));
  const r = await loadCase({ kind: 'files', origin: 'bundled', files });
  if (!r.ok) throw new Error('fixture-y did not load');
  c = r.case;
  graph = buildGraph(c);
  const results = await Promise.all(c.targets.map((t) => optimize({ caseId: c.id, targetId: t.id }, c)));
  frontier = results.find((x): x is Frontier => x.kind === 'frontier')!;
  blocked = results.find((x): x is NoSafeRoute => x.kind === 'no_safe_route')!;
  if (!frontier || !blocked) throw new Error('fixture-y no longer gives one frontier and one no-safe-route target');
});

const rows = () => visibleMeasures(frontier, null);

describe('grouping and naming', () => {
  it('merges frontier routes with identical costs that differ only by preset, naming both devices', () => {
    const groups = groupRoutes(c, frontier);
    const merged = groups.find((g) => g.presetIds.length > 1);
    expect(merged, 'fixture-y left gives two presets with identical costs').toBeTruthy();
    const names = merged!.presetIds.map((id) => WIRE_PRESETS.find((p) => p.id === id)!.name);
    expect(merged!.devices).toBe(names.join(' or '));
    expect(groups.reduce((n, g) => n + g.routes.length, 0)).toBe(frontier.routes.length);
  });

  it('gives a route with no labels a neutral name from its path in case data', () => {
    const unlabelled = groupRoutes(c, frontier).find((g) => g.labels.length === 0);
    if (!unlabelled) return; // every route labelled: nothing to check on this case
    for (const e of unlabelled.edges) expect(unlabelled.name).toContain(c.vessels.find((v) => v.id === c.edges.find((x) => x.id === e)!.vessel)!.name);
  });
});

describe('the finding', () => {
  it('says the route is on the frontier when it is a frontier route', () => {
    const groups = groupRoutes(c, frontier);
    expect(finding(c, frontier.routes[0]!, frontier, groups, rows())).toBe('Your route is on the frontier: no other safe route beats it on every measure.');
  });

  it('names the dominating route and the measures it is better on', () => {
    const groups = groupRoutes(c, frontier);
    const base = frontier.routes[0]!;
    const worse: Route = { ...base, id: 'worse', cost: { ...base.cost, lengthM: base.cost.lengthM + 0.01 } };
    const text = finding(c, worse, frontier, groups, rows());
    expect(text).toContain(`The ${groups[0]!.name.charAt(0).toLowerCase()}${groups[0]!.name.slice(1)} route is better on length`);
    expect(text).toContain('no worse on the rest');
    expect(text).not.toMatch(/optimal/i);
  });

  it('says a feasible route over a heavy zone is not safe, so not on the frontier', () => {
    const heavyTarget = c.targets.find((t) => {
      const r = routeFor(graph, c.entries[0]!.id, t.id, WIRE_PRESETS[0]!.id, pathTo(t.id));
      return r.feasible && r.cost.heavyCrossings > 0;
    })!;
    const player = routeFor(graph, c.entries[0]!.id, heavyTarget.id, WIRE_PRESETS[0]!.id, pathTo(heavyTarget.id));
    const text = finding(c, player, frontier, groupRoutes(c, frontier), rows());
    expect(text).toMatch(/^Your route is feasible but crosses the .+, a heavy risk zone, so it isn't safe and can't be on the frontier\.$/);
  });

  it('says a blocked route cannot be on the frontier, in words', () => {
    const base = frontier.routes[0]!;
    const player = routeFor(graph, base.entryId, base.targetId, 'stiff_straight', base.edges);
    if (player.feasible) return; // this preset passes on this case: nothing to check
    expect(finding(c, player, frontier, groupRoutes(c, frontier), rows())).toMatch(/^Your route can't be on the frontier because it is blocked: /);
  });

  it('explains no safe route with its reason and the suggestion, or says no change helps', () => {
    const none = finding(c, null, blocked, [], []);
    expect(none).toMatch(/^No safe route to the .+ with these entries and wires\./);
    expect(none).toContain(blocked.suggestion ? 'Try the' : 'No change of entry or wire gives a safe route.');
    const withPreset: NoSafeRoute = { ...blocked, suggestion: { change: 'preset', presetId: 'soft_angled' } };
    expect(finding(c, null, withPreset, [], [])).toContain('Try the Soft angled wire.');
    const withEntry: NoSafeRoute = { ...blocked, suggestion: { change: 'entry', entryId: c.entries[0]!.id } };
    expect(finding(c, null, withEntry, [], [])).toContain(`Try the ${c.entries[0]!.name} entry.`);
    const withNone: NoSafeRoute = { ...blocked, suggestion: null };
    expect(finding(c, null, withNone, [], [])).toContain('No change of entry or wire gives a safe route.');
  });
});

describe('overlay, weights and measures', () => {
  it('draws at most four routes, the top four by rank, with slots kept in frontier order', () => {
    const base = groupRoutes(c, frontier)[0]!;
    const groups: RouteGroup[] = Array.from({ length: 6 }, (_, i) => ({ ...base, id: `g${i}`, name: `Route ${i}` }));
    const ranks = new Map(groups.map((g, i) => [g.id, [6, 1, 5, 2, 3, 4][i]!]));
    const shown = overlaySelection(groups, ranks);
    expect(shown.map((s) => s.group.id)).toEqual(['g1', 'g3', 'g4', 'g5']);
    expect(shown.map((s) => s.slot)).toEqual([1, 2, 3, 4]);
  });

  it('ranks groups by their best member in the engine ranking', () => {
    const groups = groupRoutes(c, frontier);
    const ranking = { weights: {}, order: [...frontier.routes].reverse().map((r) => ({ routeId: r.id, s: 0 })) };
    const ranks = groupRanks(groups, ranking);
    expect([...ranks.values()].sort()).toEqual(groups.map((_, i) => i + 1));
  });

  it('starts with equal weights on every measure shown, which the engine normalises to equal shares', () => {
    const measures = rows();
    const shares = normaliseWeights(startingWeights(measures));
    const values = Object.values(shares);
    expect(Object.keys(shares).sort()).toEqual(measures.map((m) => m.key).sort());
    for (const v of values) expect(v).toBeCloseTo(1 / measures.length, 12);
  });

  it('hides the simulated measures unless real recorded runs supplied them', () => {
    const withSim = (used: boolean): Frontier => ({ ...frontier, recordedRunsUsed: used, routes: frontier.routes.map((r) => ({ ...r, cost: { ...r.cost, simPeakForceN: r.cost.lengthM, simSuccessRate: 1 } })) });
    const off = visibleMeasures(withSim(false), null).map((m) => m.key);
    const on = visibleMeasures(withSim(true), null).map((m) => m.key);
    expect(off).not.toContain('simPeakForceN');
    expect(off).not.toContain('simSuccessRate');
    expect(on).toContain('simPeakForceN');
    expect(on).toContain('simSuccessRate');
    expect(visibleMeasures(frontier, null).length).toBeLessThan(MEASURE_ROWS.length);
  });
});
