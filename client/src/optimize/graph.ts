/**
 * Vessel graph from a LoadedCase (spec §4.1), with the per-edge measures (spec §4.2) computed once
 * at build time.
 *
 * Measures run in millimetres on the loaded points × 1000. The Y-up rotation preserves every
 * length and angle, so this matches the NumPy reference on the stored mm RAS files (spec §4.9).
 * Results are reported in metres and degrees, as the contracts use.
 */

import type { CaseRiskZone, LoadedCase, LoadedEdge, LoadedRiskZone, RiskTier } from '../contracts';
import {
  lengthMm,
  polylineDistance,
  rMinMm,
  subPolyline,
  turningMeasures,
  zoneOverlapsEdge,
  type Point3,
} from './measures';

export interface EdgeMeasures {
  lengthM: number;
  /** Per-edge Θmax over the 5 mm window, degrees. */
  thetaMaxDeg: number;
  /** Per-edge ΘΣ, degrees. */
  thetaSumDeg: number;
  rMinM: number;
  /** Risk zones of any tier lying on this edge, sorted by id. */
  zonesOnEdge: string[];
  /** Centerline-to-centerline clearance from this edge to each proximity zone, metres. */
  proximityClearanceM: ReadonlyMap<string, number>;
  /** Smallest of those, or null if the case has no proximity zones. */
  minProximityClearanceM: number | null;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  vessel: string;
  /** Loaded points × 1000 (mm, Y-up). */
  pointsMm: Point3[];
  measures: EdgeMeasures;
}

export interface GraphZone {
  id: string;
  tier: RiskTier;
  kind: CaseRiskZone['kind'];
  edge: string;
}

export interface RouteGraph {
  caseId: string;
  /** Node id → ids of the edges touching it. */
  adjacency: ReadonlyMap<string, readonly string[]>;
  edges: ReadonlyMap<string, GraphEdge>;
  zones: readonly GraphZone[];
  /** Entry node ids, for orienting a one-edge partial route. */
  entryNodes: ReadonlySet<string>;
  /** Entry id → node id, in case order. */
  entries: ReadonlyMap<string, string>;
  /** Target id → node id, in case order. */
  targets: ReadonlyMap<string, string>;
}

const toMm = (e: LoadedEdge): Point3[] => e.points.map((p) => [p[0] * 1000, p[1] * 1000, p[2] * 1000] as Point3);

export function buildGraph(c: LoadedCase): RouteGraph {
  const pointsById = new Map(c.edges.map((e) => [e.id, toMm(e)]));
  const zoneLines = c.riskZones
    .filter((z) => z.tier === 'proximity')
    .map((z: LoadedRiskZone) => {
      const pts = pointsById.get(z.edge);
      if (!pts) throw new Error(`buildGraph: zone ${z.id} is on unknown edge ${z.edge}`);
      return { id: z.id, line: subPolyline(pts, z.fromM * 1000, z.toM * 1000) };
    });

  const edges = new Map<string, GraphEdge>();
  const adjacency = new Map<string, string[]>();
  for (const e of c.edges) {
    const pts = pointsById.get(e.id)!;
    const L = lengthMm(pts);
    const turning = turningMeasures(pts);
    const clearance = new Map<string, number>();
    for (const z of zoneLines) clearance.set(z.id, polylineDistance(pts, z.line) / 1000);
    const values = [...clearance.values()];
    edges.set(e.id, {
      id: e.id,
      from: e.from,
      to: e.to,
      vessel: e.vessel,
      pointsMm: pts,
      measures: {
        lengthM: L / 1000,
        thetaMaxDeg: turning.thetaMaxDeg,
        thetaSumDeg: turning.thetaSumDeg,
        rMinM: rMinMm(e.radiiM),
        zonesOnEdge: c.riskZones
          .filter((z) => z.edge === e.id && zoneOverlapsEdge(L, z.fromM * 1000, z.toM * 1000))
          .map((z) => z.id)
          .sort(),
        proximityClearanceM: clearance,
        minProximityClearanceM: values.length ? Math.min(...values) : null,
      },
    });
    for (const n of [e.from, e.to]) {
      const list = adjacency.get(n) ?? [];
      if (!list.includes(e.id)) list.push(e.id);
      adjacency.set(n, list);
    }
  }

  return {
    caseId: c.id,
    adjacency,
    edges,
    zones: c.riskZones.map((z) => ({ id: z.id, tier: z.tier, kind: z.kind, edge: z.edge })),
    entryNodes: new Set(c.entries.map((x) => x.node)),
    entries: new Map(c.entries.map((x) => [x.id, x.node])),
    targets: new Map(c.targets.map((x) => [x.id, x.node])),
  };
}
