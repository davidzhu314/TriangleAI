/**
 * From the pipeline's centerline tree back to the case's own edges, so the two can be compared edge by edge and
 * the route engine can run on the recovered geometry.
 *
 * Matching uses the marked ends only, as an import would: a stretch of the recovered tree and an edge of the
 * case are the same vessel when the same marked ends lie beyond them. The recovered case keeps the true case's
 * graph (same node and edge ids) and takes every position and radius from the scan. An edge the scan lost is
 * left out, so routes through it disappear, as they would for a user.
 */
import type { LoadedCase, LoadedEdge } from '../../contracts';
import { fromScan, nearestOnPolyline, type P3, type Truth, type TruthEdge } from './grid';
import { resample, type TreeEdge } from './pipeline';

export interface RecoveredEdge {
  id: string;
  /** mm, scan frame, from the edge's `from` node to its `to` node. */
  pts: P3[];
  radii: number[];
}

export interface RecoveredGeometry {
  edges: Map<string, RecoveredEdge>;
  /** Recovered position of each node an edge reached. */
  nodes: Map<string, P3>;
  /** Edges the scan lost: no stretch of the recovered tree matches them. */
  missingEdges: string[];
}

const dist = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

/**
 * @param tree    the pipeline's centerline tree
 * @param rootId  the marked end the tree grows from
 * @param reached marked ends the tree reaches
 * @param padMm   how far past a vessel's own radius a recovered point may sit and still count as that vessel
 */
export function recoverEdges(truth: Truth, tree: readonly TreeEdge[], rootId: string | null, reached: readonly string[], padMm: number): RecoveredGeometry {
  const edges = new Map<string, RecoveredEdge>();
  const nodes = new Map<string, P3>();
  const missingEdges: string[] = [];
  const rootNode = truth.endpoints.find((e) => e.id === rootId)?.node;
  if (!rootNode) return { edges, nodes, missingEdges: truth.edges.map((e) => e.id) };

  const live = new Set(reached);
  const endsAtNode = new Map<string, string[]>();
  for (const e of truth.endpoints) if (live.has(e.id)) endsAtNode.set(e.node, [...(endsAtNode.get(e.node) ?? []), e.id]);
  const around = new Map<string, TruthEdge[]>();
  for (const e of truth.edges) for (const n of [e.from, e.to]) around.set(n, [...(around.get(n) ?? []), e]);

  // Walk the case's tree from the root: for each edge, its far node, its depth, and the marked ends beyond it.
  const far = new Map<string, string>();
  const depth = new Map<string, number>();
  const beyond = new Map<string, string[]>();
  const walk = (node: string, via: string | null, d: number): string[] => {
    const here = via === null ? [] : [...(endsAtNode.get(node) ?? [])];
    for (const e of around.get(node) ?? []) {
      if (e.id === via || far.has(e.id)) continue;
      const other = e.from === node ? e.to : e.from;
      far.set(e.id, other);
      depth.set(e.id, d);
      const sub = walk(other, e.id, d + 1);
      beyond.set(e.id, sub);
      here.push(...sub);
    }
    return here;
  };
  walk(rootNode, null, 0);

  const groups = new Map<string, TruthEdge[]>();
  for (const e of truth.edges) {
    const ids = beyond.get(e.id);
    if (!ids || ids.length === 0) {
      missingEdges.push(e.id);
      continue;
    }
    const key = [...ids].sort().join('|');
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const stretch = new Map(tree.map((t) => [t.below.join('|'), t]));
  for (const [key, chain] of groups) {
    const t = stretch.get(key);
    chain.sort((a, b) => depth.get(a.id)! - depth.get(b.id)!);
    if (!t || t.pts.length < chain.length + 1) {
      missingEdges.push(...chain.map((e) => e.id));
      continue;
    }
    // Several edges in a row on one stretch (a node with no fork): cut the stretch nearest each node between them.
    const cuts = [0];
    for (let j = 0; j < chain.length - 1; j++) {
      const p = truth.nodes.get(far.get(chain[j]!.id)!)!;
      const lo = cuts[j]! + 1;
      const hi = t.pts.length - 1 - (chain.length - 1 - j);
      let at = lo;
      let best = Infinity;
      for (let n = lo; n <= hi; n++) {
        const d = dist(t.pts[n]!, p);
        if (d < best) {
          best = d;
          at = n;
        }
      }
      cuts.push(at);
    }
    cuts.push(t.pts.length - 1);
    chain.forEach((e, j) => {
      const pts = t.pts.slice(cuts[j]!, cuts[j + 1]! + 1).map((p) => [p[0], p[1], p[2]] as P3);
      const radii = t.radii.slice(cuts[j]!, cuts[j + 1]! + 1);
      if (far.get(e.id) === e.from) {
        pts.reverse();
        radii.reverse();
      }
      // It must follow this vessel, not another one that happens to lead to the same ends.
      let covered = 0;
      e.pts.forEach((p, n) => {
        if (nearestOnPolyline(pts, radii, p).d <= e.radii[n]! + padMm) covered++;
      });
      if (covered < 0.8 * e.pts.length) {
        missingEdges.push(e.id);
        return;
      }
      const rs = resample(pts, radii, 1);
      edges.set(e.id, { id: e.id, pts: rs.pts, radii: rs.radii });
      nodes.set(e.from, rs.pts[0]!);
      nodes.set(e.to, rs.pts[rs.pts.length - 1]!);
    });
  }
  return { edges, nodes, missingEdges };
}

/** The true case with its geometry replaced by the recovered one. Lost edges, and entries on them, are dropped. */
export function recoveredCase(c: LoadedCase, geom: RecoveredGeometry): LoadedCase {
  const edges: LoadedEdge[] = [];
  for (const e of c.edges) {
    const r = geom.edges.get(e.id);
    if (!r) continue;
    const points = r.pts.map(fromScan);
    let lengthM = 0;
    for (let n = 1; n < points.length; n++) lengthM += dist(points[n]!, points[n - 1]!);
    edges.push({ ...e, points, radiiM: r.radii.map((v) => v / 1000), lengthM });
  }
  const live = new Set(edges.flatMap((e) => [e.from, e.to]));
  const kept = new Set(edges.map((e) => e.id));
  return {
    ...c,
    edges,
    nodes: c.nodes.map((n) => ({ ...n, pos: geom.nodes.has(n.id) ? fromScan(geom.nodes.get(n.id)!) : n.pos })),
    entries: c.entries.filter((en) => live.has(en.node)),
    riskZones: c.riskZones.filter((z) => kept.has(z.edge)).map((z) => ({ ...z })),
  };
}
