/**
 * Messages between the app and the measure Worker, plus the pure handler the Worker runs. Keeping
 * the handler pure lets tests drive it without a browser Worker.
 */

import type { LoadedCase, OptimizeRequest, OptimizeResult, RouteMeasures } from '../contracts';
import { buildGraph, type EdgeMeasures, type RouteGraph } from './graph';
import { measureRoute, type MeasureRouteOptions } from './measure-route';
import { optimizeCase, RouteEnumerator } from './optimizer';

/** The Worker never needs the mesh. Callers send the case without it (see `stripMesh`). */
export type MeasureCase = Omit<LoadedCase, 'mesh'>;

export type MeasureRequest =
  | { id: number; type: 'load'; case: MeasureCase }
  | { id: number; type: 'measureRoute'; edges: string[]; options?: MeasureRouteOptions }
  | { id: number; type: 'edgeMeasures'; edge: string }
  | { id: number; type: 'optimize'; request: OptimizeRequest };

/** Per-edge measures in a structured-clone-friendly shape (plain object instead of a Map). */
export type EdgeMeasuresMessage = Omit<EdgeMeasures, 'proximityClearanceM'> & { proximityClearanceM: Record<string, number> };

export type MeasureResponse =
  | { id: number; ok: true; type: 'load'; caseId: string; edges: number; buildMs: number }
  | { id: number; ok: true; type: 'measureRoute'; result: RouteMeasures }
  | { id: number; ok: true; type: 'edgeMeasures'; result: EdgeMeasuresMessage }
  | { id: number; ok: true; type: 'optimize'; result: OptimizeResult; ms: number }
  | { id: number; ok: false; error: string };

export function stripMesh(c: LoadedCase): MeasureCase {
  const { mesh: _mesh, ...rest } = c;
  return rest;
}

export function createMeasureHandler(now: () => number = () => performance.now()): (msg: MeasureRequest) => MeasureResponse {
  let graph: RouteGraph | null = null;
  let enumerator: RouteEnumerator | null = null;
  return (msg) => {
    try {
      switch (msg.type) {
        case 'load': {
          const t0 = now();
          // buildGraph never reads the mesh
          graph = buildGraph(msg.case as LoadedCase);
          enumerator = new RouteEnumerator(graph);
          return { id: msg.id, ok: true, type: 'load', caseId: graph.caseId, edges: graph.edges.size, buildMs: now() - t0 };
        }
        case 'measureRoute': {
          if (!graph) throw new Error('no case loaded');
          return { id: msg.id, ok: true, type: 'measureRoute', result: measureRoute(graph, msg.edges, msg.options) };
        }
        case 'optimize': {
          if (!graph || !enumerator) throw new Error('no case loaded');
          const t0 = now();
          const result = optimizeCase(graph, msg.request, enumerator);
          return { id: msg.id, ok: true, type: 'optimize', result, ms: now() - t0 };
        }
        case 'edgeMeasures': {
          if (!graph) throw new Error('no case loaded');
          const e = graph.edges.get(msg.edge);
          if (!e) throw new Error(`unknown edge ${msg.edge}`);
          const m = e.measures;
          return {
            id: msg.id,
            ok: true,
            type: 'edgeMeasures',
            result: { ...m, zonesOnEdge: [...m.zonesOnEdge], proximityClearanceM: Object.fromEntries(m.proximityClearanceM) },
          };
        }
      }
    } catch (err) {
      return { id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  };
}
