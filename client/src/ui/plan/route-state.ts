/**
 * Route building on the vessel graph (spec §4.1). Pure functions over the engine's RouteGraph: no DOM, no ids
 * from any particular case. The route is a list of edges walked from the chosen entry; it may only grow along
 * an edge touching its current end, never revisits a node, and is complete when it ends on the chosen target.
 * Measures and preset checks come from the engine (routeFor), never from here.
 */
import type { Route, WirePresetId } from '../../contracts';
import { routeFor, RouteError, type RouteGraph } from '../../optimize';

export interface RouteState {
  entryId: string;
  targetId: string;
  presetId: WirePresetId;
  edges: readonly string[];
}

export interface NextStep {
  edgeId: string;
  /** The node the step reaches. */
  node: string;
}

/** Nodes the route has visited, entry first. */
export function routeNodes(graph: RouteGraph, s: RouteState): string[] {
  const start = graph.entries.get(s.entryId);
  if (start === undefined) return [];
  const nodes = [start];
  for (const id of s.edges) {
    const e = graph.edges.get(id);
    const at = nodes.at(-1);
    if (!e || at === undefined) break;
    nodes.push(e.from === at ? e.to : e.from);
  }
  return nodes;
}

export function endNode(graph: RouteGraph, s: RouteState): string | undefined {
  return routeNodes(graph, s).at(-1);
}

export function isComplete(graph: RouteGraph, s: RouteState): boolean {
  return s.edges.length > 0 && endNode(graph, s) === graph.targets.get(s.targetId);
}

/** Edges that may extend the route: touching its end, leading to a node not yet visited. None once complete. */
export function nextSteps(graph: RouteGraph, s: RouteState): NextStep[] {
  if (isComplete(graph, s)) return [];
  const nodes = routeNodes(graph, s);
  const at = nodes.at(-1);
  if (at === undefined) return [];
  const visited = new Set(nodes);
  const steps: NextStep[] = [];
  for (const edgeId of graph.adjacency.get(at) ?? []) {
    const e = graph.edges.get(edgeId);
    if (!e) continue;
    const node = e.from === at ? e.to : e.from;
    if (!visited.has(node) && !steps.some((x) => x.node === node)) steps.push({ edgeId, node });
  }
  return steps;
}

/** Extend the route to a node. Returns null when the node is not one step from the route's end. */
export function extendTo(graph: RouteGraph, s: RouteState, node: string): RouteState | null {
  const step = nextSteps(graph, s).find((x) => x.node === node);
  return step ? { ...s, edges: [...s.edges, step.edgeId] } : null;
}

export function undo(s: RouteState): RouteState {
  return { ...s, edges: s.edges.slice(0, -1) };
}

export function clear(s: RouteState): RouteState {
  return { ...s, edges: [] };
}

/** A new entry starts a new route; target and preset changes keep the edges (the engine re-measures them). */
export function choose(s: RouteState, change: Partial<Pick<RouteState, 'entryId' | 'targetId' | 'presetId'>>): RouteState {
  const next = { ...s, ...change };
  return change.entryId !== undefined && change.entryId !== s.entryId ? clear(next) : next;
}

/** The engine's verdict on the route so far: measures, preset violations and crossings. Null with no edges. */
export function evaluate(graph: RouteGraph, s: RouteState): Route | null {
  if (!s.edges.length) return null;
  try {
    return routeFor(graph, s.entryId, s.targetId, s.presetId, s.edges);
  } catch (err) {
    if (err instanceof RouteError) return null;
    throw err;
  }
}
