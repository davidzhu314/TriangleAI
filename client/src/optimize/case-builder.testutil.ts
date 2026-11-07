/**
 * Test helper: builds a `LoadedCase` from a case's JSON files for the synthetic fixtures in
 * tests/fixtures/synthetic/, which have no vessels.glb and so cannot go through David's `loadCase`.
 * Real case folders (fixture-y) load through `loadCase` (see fixture-y.testutil.ts). Tests only.
 *
 * Conversion only, matching loadCase: points and node positions go through `rasMmToYupM`, radii and
 * zone spans are divided by 1000, and edge lengths come from the converted points. No validation.
 */

import {
  RAS_MM_TO_YUP_M,
  rasMmToYupM,
  type CaseJson,
  type CaseOrigin,
  type CenterlinesJson,
  type LoadedCase,
  type LoadedEdge,
  type Vec3,
} from '../contracts';
import { lengthMm } from './measures';

export interface TestCaseOptions {
  /** vessels.glb bytes, as stored. Default: empty. */
  glb?: ArrayBuffer;
  /** Default: 'bundled'. */
  origin?: CaseOrigin;
}

export function buildTestLoadedCase(
  caseJson: CaseJson,
  centerlines: CenterlinesJson,
  options: TestCaseOptions = {},
): LoadedCase {
  const edges: LoadedEdge[] = centerlines.edges.map((e) => {
    const points = e.points.map((p) => rasMmToYupM(p));
    return {
      id: e.id,
      from: e.from,
      to: e.to,
      vessel: e.vessel,
      points,
      radiiM: e.radii_mm.map((r) => r / 1000),
      // lengthMm doesn't depend on units: on metre points it returns metres
      lengthM: lengthMm(points),
    };
  });

  const reachable = reachableNodes(
    caseJson.entries.map((x) => x.node),
    centerlines.edges.map((e) => [e.from, e.to] as const),
  );

  const loaded: LoadedCase = {
    id: caseJson.id,
    title: caseJson.title,
    origin: options.origin ?? 'bundled',
    source: { ...caseJson.source },
    physics: { ...caseJson.physics },
    planningOnly: !caseJson.physics.available,
    vessels: caseJson.vessels.map((v) => ({ ...v })),
    entries: caseJson.entries.map((x) => ({ ...x })),
    targets: caseJson.targets.map((x) => ({ ...x, reachable: reachable.has(x.node) })),
    riskZones: caseJson.riskZones.map((z) => ({
      id: z.id,
      kind: z.kind,
      tier: z.tier,
      edge: z.edge,
      fromM: z.from_mm / 1000,
      toM: z.to_mm / 1000,
    })),
    nodes: centerlines.nodes.map((n) => ({ id: n.id, pos: rasMmToYupM(n.pos) as Vec3, kind: n.kind })),
    edges,
    mesh: { glb: options.glb ?? new ArrayBuffer(0), toWorld: [...RAS_MM_TO_YUP_M], triangles: 0 },
    validation: [],
  };
  if (caseJson.scenario !== undefined) loaded.scenario = caseJson.scenario;
  if (caseJson.difficulty !== undefined) loaded.difficulty = caseJson.difficulty;
  if (caseJson.fluoro_budget_s !== undefined) loaded.fluoroBudgetS = caseJson.fluoro_budget_s;
  if (caseJson.anatomy !== undefined) loaded.anatomy = { ...caseJson.anatomy };
  return loaded;
}

function reachableNodes(starts: string[], edges: ReadonlyArray<readonly [string, string]>): Set<string> {
  const adj = new Map<string, string[]>();
  for (const [a, b] of edges) {
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  }
  const seen = new Set(starts);
  const queue = [...starts];
  while (queue.length) {
    for (const next of adj.get(queue.pop()!) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}
