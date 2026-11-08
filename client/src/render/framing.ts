/**
 * Where the 3D views look (DECISIONS.md 2026-11-07, "3D framing"). The close-up is the region around the targets
 * and the branch points their vessels leave from: on an arch case, the arch and the carotids, where the route
 * decisions are. It comes from the case graph only, so it works on generated and CT cases alike. No three.js here.
 */
import type { LoadedCase, Vec3 } from '../contracts';

export interface Box {
  min: Vec3;
  max: Vec3;
}

/** Branch points walked back from each target, toward the nearest entry: the takeoff and the one before it. */
const BRANCHES_BACK = 2;
/** Margin around the close-up, as a share of its largest extent. */
const PAD = 0.2;
/** A padded close-up larger than this share of the whole tree is not worth a switch (fixture-y). */
const MAX_SHARE = 0.5;

export function boxOf(points: readonly Vec3[]): Box | null {
  if (!points.length) return null;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of points) for (let a = 0; a < 3; a++) {
    min[a] = Math.min(min[a]!, p[a]!);
    max[a] = Math.max(max[a]!, p[a]!);
  }
  return { min, max };
}

export const extent = (b: Box): number => Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
export const centre = (b: Box): Vec3 => [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
export const inside = (b: Box, p: Vec3): boolean => p.every((v, a) => v >= b.min[a]! && v <= b.max[a]!);

/** The close-up box, padded, or null when the case is small enough that the whole tree is the close-up. */
export function closeUpBox(c: LoadedCase): Box | null {
  const whole = boxOf(c.edges.flatMap((e) => e.points));
  if (!whole) return null;
  const adj = new Map<string, { edge: (typeof c.edges)[number]; other: string }[]>();
  for (const e of c.edges) {
    adj.set(e.from, [...(adj.get(e.from) ?? []), { edge: e, other: e.to }]);
    adj.set(e.to, [...(adj.get(e.to) ?? []), { edge: e, other: e.from }]);
  }
  const entryNodes = new Set(c.entries.map((e) => e.node));
  const pts: Vec3[] = [];
  for (const t of c.targets) {
    // Breadth-first from the target to the nearest entry, then walk that path back from the target.
    const prev = new Map<string, { node: string; edge: (typeof c.edges)[number] } | null>([[t.node, null]]);
    const queue = [t.node];
    let found: string | null = null;
    while (queue.length && !found) {
      const at = queue.shift()!;
      if (entryNodes.has(at)) found = at;
      for (const { edge, other } of adj.get(at) ?? []) {
        if (prev.has(other)) continue;
        prev.set(other, { node: at, edge });
        queue.push(other);
      }
    }
    if (!found) continue;
    // Steps in order from the target: each edge, and the node at its entry-side end.
    const steps: { node: string; edge: (typeof c.edges)[number] }[] = [];
    for (let n = found; prev.get(n); n = prev.get(n)!.node) steps.unshift({ node: n, edge: prev.get(n)!.edge });
    pts.push(c.nodes.find((n) => n.id === t.node)?.pos ?? steps[0]?.edge.points[0] ?? [0, 0, 0]);
    // Up to the takeoff, then on to the branch point before it only when that is no further than the takeoff leg
    // (on the left carotid, the next branch can be the aortic bifurcation, far below the arch).
    let branches = 0;
    let walked = 0;
    let takeoffLeg = Infinity;
    for (const step of steps) {
      walked += step.edge.lengthM;
      if (branches >= 1 && walked > 2 * takeoffLeg) break;
      pts.push(...step.edge.points);
      if ((adj.get(step.node)?.length ?? 0) < 3) continue;
      branches++;
      if (branches === 1) takeoffLeg = walked;
      if (branches >= BRANCHES_BACK) break;
    }
  }
  const box = boxOf(pts);
  if (!box) return null;
  const pad = extent(box) * PAD;
  const padded: Box = { min: [box.min[0] - pad, box.min[1] - pad, box.min[2] - pad], max: [box.max[0] + pad, box.max[1] + pad, box.max[2] + pad] };
  return extent(padded) > MAX_SHARE * extent(whole) ? null : padded;
}
