/**
 * Route enumeration (spec §4.5).
 * - `simplePaths`: exhaustive depth-first search for simple paths (no node visited twice),
 *   capped at `cap` (50 per entry × target × preset).
 * - `yenKShortest`: Yen's k shortest simple paths on edge length, for large graphs (k = 10, run
 *   per preset on the edges that preset can use).
 * Both are deterministic: neighbours are visited in edge-id order, and ties break on the
 * edge-id sequence.
 */

import type { RouteGraph } from './graph';

export interface GraphPath {
  /** Edge ids, start to end. */
  edges: string[];
  /** Node ids, edges.length + 1. */
  nodes: string[];
}

export const DFS_PATH_CAP = 50;
export const YEN_K = 10;

function sortedIncident(graph: RouteGraph, node: string): string[] {
  return [...(graph.adjacency.get(node) ?? [])].sort();
}

function otherEnd(graph: RouteGraph, edgeId: string, node: string): string {
  const e = graph.edges.get(edgeId)!;
  return e.from === node ? e.to : e.from;
}

export function simplePaths(
  graph: RouteGraph,
  from: string,
  to: string,
  cap: number = DFS_PATH_CAP,
  allowEdge: (edgeId: string) => boolean = () => true,
): GraphPath[] {
  const out: GraphPath[] = [];
  if (from === to) return out;
  const nodes = [from];
  const edges: string[] = [];
  const onPath = new Set([from]);
  const walk = (at: string): void => {
    for (const eid of sortedIncident(graph, at)) {
      if (out.length >= cap) return;
      if (!allowEdge(eid)) continue;
      const next = otherEnd(graph, eid, at);
      if (onPath.has(next)) continue;
      edges.push(eid);
      nodes.push(next);
      if (next === to) out.push({ edges: [...edges], nodes: [...nodes] });
      else {
        onPath.add(next);
        walk(next);
        onPath.delete(next);
      }
      edges.pop();
      nodes.pop();
    }
  };
  walk(from);
  return out;
}

const pathLength = (graph: RouteGraph, p: GraphPath) => p.edges.reduce((a, e) => a + graph.edges.get(e)!.measures.lengthM, 0);
const pathKey = (p: GraphPath) => p.edges.join(',');

function comparePaths(graph: RouteGraph, a: GraphPath, b: GraphPath): number {
  const d = pathLength(graph, a) - pathLength(graph, b);
  if (Math.abs(d) > 1e-12) return d;
  const ka = pathKey(a);
  const kb = pathKey(b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/** Dijkstra on edge length, avoiding banned nodes and edges. Deterministic tie-breaking. */
function shortestPath(
  graph: RouteGraph,
  from: string,
  to: string,
  bannedNodes: ReadonlySet<string>,
  bannedEdges: ReadonlySet<string>,
  allowEdge: (edgeId: string) => boolean,
): GraphPath | null {
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, { node: string; edge: string }>();
  const done = new Set<string>();
  for (;;) {
    let at: string | null = null;
    let best = Infinity;
    for (const [n, d] of dist) {
      if (done.has(n)) continue;
      if (d < best - 1e-15 || (Math.abs(d - best) <= 1e-15 && at !== null && n < at)) {
        best = d;
        at = n;
      }
    }
    if (at === null) return null;
    if (at === to) break;
    done.add(at);
    for (const eid of sortedIncident(graph, at)) {
      if (bannedEdges.has(eid) || !allowEdge(eid)) continue;
      const next = otherEnd(graph, eid, at);
      if (bannedNodes.has(next) || done.has(next)) continue;
      const nd = best + graph.edges.get(eid)!.measures.lengthM;
      const cur = dist.get(next);
      if (cur === undefined || nd < cur - 1e-15) {
        dist.set(next, nd);
        prev.set(next, { node: at, edge: eid });
      }
    }
  }
  const edges: string[] = [];
  const nodes = [to];
  let at = to;
  while (at !== from) {
    const p = prev.get(at)!;
    edges.unshift(p.edge);
    nodes.unshift(p.node);
    at = p.node;
  }
  return { edges, nodes };
}

export function yenKShortest(
  graph: RouteGraph,
  from: string,
  to: string,
  k: number = YEN_K,
  allowEdge: (edgeId: string) => boolean = () => true,
): GraphPath[] {
  if (from === to) return [];
  const first = shortestPath(graph, from, to, new Set(), new Set(), allowEdge);
  if (!first) return [];
  const A: GraphPath[] = [first];
  const B: GraphPath[] = [];
  const seen = new Set([pathKey(first)]);
  while (A.length < k) {
    const last = A[A.length - 1]!;
    for (let i = 0; i < last.nodes.length - 1; i++) {
      const spur = last.nodes[i]!;
      const rootEdges = last.edges.slice(0, i);
      const rootNodes = last.nodes.slice(0, i + 1);
      const bannedEdges = new Set<string>();
      for (const p of A) {
        if (p.edges.length > i && p.edges.slice(0, i).join(',') === rootEdges.join(',')) bannedEdges.add(p.edges[i]!);
      }
      const bannedNodes = new Set(rootNodes.slice(0, -1));
      const spurPath = shortestPath(graph, spur, to, bannedNodes, bannedEdges, allowEdge);
      if (!spurPath) continue;
      const cand: GraphPath = { edges: [...rootEdges, ...spurPath.edges], nodes: [...rootNodes, ...spurPath.nodes.slice(1)] };
      const key = pathKey(cand);
      if (!seen.has(key)) {
        seen.add(key);
        B.push(cand);
      }
    }
    if (B.length === 0) break;
    B.sort((a, b) => comparePaths(graph, a, b));
    A.push(B.shift()!);
  }
  return A;
}
