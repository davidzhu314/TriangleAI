/**
 * Access check: can a large-bore sheath reach the aortic valve from this access site? Pure functions over a
 * LoadedCase; no DOM, no AI. Every number comes from the case's centerlines (points and maximum inscribed radii).
 *
 * For each access site (the far end of an iliac, subclavian or carotid vessel), the route runs along the centerline
 * graph to the aortic root. Along it:
 *  - narrowest diameter: min of 2 × inscribed radius inside the measured window, which skips END_TRIM_MM at each
 *    cut end of the scan (the inscribed sphere shrinks where a segmentation is cut off, which reads as a fake
 *    narrowing) and, on subclavian routes, everything past SUBCLAVIAN_REACH_MM from the vessel's origin (the access
 *    point is the proximal axillary artery, not the arm);
 *  - sharpest bend: the largest 5 mm-window turning angle (measures/turning.ts) along the access vessel's own edge,
 *    stopping one window short of its branch point (where two centerlines meet at a point, which no sheath follows);
 *  - risk zones on the route inside the window.
 * The sheath sizes and their minimum vessel diameters are illustrative, not any device's instructions for use.
 */
import type { LoadedCase, LoadedEdge, RiskTier, RiskZoneKind } from '../contracts';
import { windowedTurning, type Point3 } from '../optimize/measures';

// ================================================================ presets and thresholds (illustrative)

export interface SheathPreset {
  id: string;
  label: string;
  /** Illustrative minimum vessel diameter for this sheath, mm. */
  minVesselMm: number;
}

/** Typical minimum vessel diameters for large-bore valve delivery sheaths. Illustrative: check the device IFU. */
export const SHEATH_PRESETS: readonly SheathPreset[] = [
  { id: '14f', label: '14 Fr', minVesselMm: 5.5 },
  { id: '16f', label: '16 Fr', minVesselMm: 6.0 },
  { id: '18f', label: '18 Fr', minVesselMm: 6.5 },
];

/** Skipped at each cut end of the scan, mm. */
export const END_TRIM_MM = 5;
/** A fit with less spare diameter than this is "tight", mm. */
export const TIGHT_MARGIN_MM = 0.5;
/** A 5 mm-window bend at or above this on the access vessel is flagged, degrees. */
export const SEVERE_BEND_DEG = 90;
/** Subclavian routes are measured this far from the vessel's origin, mm. */
export const SUBCLAVIAN_REACH_MM = 100;

// ================================================================ results

export type AccessKind = 'transfemoral' | 'subclavian' | 'transcarotid';

/** fits: clear. caution: passes with a flag. too_small: narrower than required. blocked: a no-go zone on the route. */
export type AccessVerdict = 'fits' | 'caution' | 'too_small' | 'blocked';

export interface AccessZone {
  kind: RiskZoneKind;
  tier: RiskTier;
  vesselName: string;
}

export interface AccessSample {
  /** Distance from the access site along the route, mm. */
  sMm: number;
  diameterMm: number;
}

export interface AccessRoute {
  kind: AccessKind;
  /** e.g. "Right femoral", "Left subclavian". */
  name: string;
  /** Leaf node the sheath goes in at. */
  node: string;
  /** Access site to aortic root, mm. */
  lengthMm: number;
  /** Measured window along the route, mm from the access site. */
  windowMm: [number, number];
  /** Every centerline point on the route, in travel order. */
  samples: AccessSample[];
  narrowestMm: number;
  /** Where the narrowest point is: mm from the access site, and the vessel's name. */
  narrowestAtMm: number;
  narrowestVessel: string;
  /** Narrowest minus required, mm; negative when too small. */
  marginMm: number;
  sharpestBendDeg: number;
  sharpestBendAtMm: number;
  zones: AccessZone[];
  verdict: AccessVerdict;
  /** Plain-language reasons for the verdict, built from the numbers above. Empty when it simply fits. */
  reasons: string[];
}

export interface AccessReport {
  requiredMm: number;
  /** null when the case has no aortic root to aim at. */
  rootNode: string | null;
  /** Every femoral, subclavian and carotid route, femoral first. */
  routes: AccessRoute[];
  /** Best transfemoral route, or null when the case has none. */
  bestFemoral: AccessRoute | null;
  /** Transfemoral verdict for the case: the best femoral route's, or null without one. */
  femoralVerdict: AccessVerdict | null;
}

// ================================================================ graph

const M_TO_MM = 1000;

const ACCESS_VESSEL: { kind: AccessKind; test: RegExp }[] = [
  { kind: 'transfemoral', test: /iliac|femoral/i },
  { kind: 'subclavian', test: /subclavian/i },
  { kind: 'transcarotid', test: /cca$|carotid/i },
];

function accessKind(vesselId: string): AccessKind | null {
  return ACCESS_VESSEL.find((a) => a.test.test(vesselId))?.kind ?? null;
}

const isAorta = (vesselId: string): boolean => /aorta/i.test(vesselId);

interface Adj {
  edge: LoadedEdge;
  /** The node at the other end. */
  to: string;
  /** True when walking the edge from its `to` node to its `from` node. */
  reversed: boolean;
}

function adjacency(c: LoadedCase): Map<string, Adj[]> {
  const adj = new Map<string, Adj[]>();
  const add = (n: string, a: Adj): void => {
    const list = adj.get(n);
    if (list) list.push(a);
    else adj.set(n, [a]);
  };
  for (const e of c.edges) {
    add(e.from, { edge: e, to: e.to, reversed: false });
    add(e.to, { edge: e, to: e.from, reversed: true });
  }
  return adj;
}

/** The aortic root: an "end" leaf on an aorta edge (never an entry). Prefers an id naming the root. */
export function findAorticRoot(c: LoadedCase): string | null {
  const adj = adjacency(c);
  const leaves = c.nodes.filter((n) => n.kind === 'end' && (adj.get(n.id)?.length ?? 0) === 1 && isAorta(adj.get(n.id)![0]!.edge.vessel));
  return (leaves.find((n) => /root/i.test(n.id)) ?? (leaves.length === 1 ? leaves[0] : undefined))?.id ?? null;
}

/** Shortest path by length (Dijkstra; the graphs are tiny). */
function shortestPath(adj: Map<string, Adj[]>, from: string, to: string): Adj[] | null {
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, { node: string; step: Adj }>();
  const open = new Set<string>([from]);
  const done = new Set<string>();
  while (open.size) {
    let u = '';
    let best = Infinity;
    for (const n of open) if ((dist.get(n) ?? Infinity) < best) [u, best] = [n, dist.get(n)!];
    open.delete(u);
    done.add(u);
    if (u === to) break;
    for (const a of adj.get(u) ?? []) {
      if (done.has(a.to)) continue;
      const d = best + a.edge.lengthM;
      if (d < (dist.get(a.to) ?? Infinity)) {
        dist.set(a.to, d);
        prev.set(a.to, { node: u, step: a });
        open.add(a.to);
      }
    }
  }
  if (!dist.has(to)) return null;
  const steps: Adj[] = [];
  for (let n = to; n !== from; ) {
    const p = prev.get(n)!;
    steps.push(p.step);
    n = p.node;
  }
  return steps.reverse();
}

// ================================================================ one route

interface Walk {
  points: Point3[];
  radiiMm: number[];
  s: number[];
  vessel: string[];
  /** s where each edge after the first starts. */
  junctionS: number[];
  /** s where each step starts and ends, for zones. */
  spans: { step: Adj; s0: number; s1: number }[];
}

function walk(steps: Adj[]): Walk {
  const w: Walk = { points: [], radiiMm: [], s: [], vessel: [], junctionS: [], spans: [] };
  let s = 0;
  for (const [k, step] of steps.entries()) {
    const n = step.edge.points.length;
    const order = Array.from({ length: n }, (_, i) => (step.reversed ? n - 1 - i : i));
    const s0 = s;
    for (const [j, i] of order.entries()) {
      const p = step.edge.points[i]!.map((x) => x * M_TO_MM) as unknown as Point3;
      const last = w.points.at(-1);
      if (last) {
        const d = Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]);
        // A shared junction point appears once.
        if (j === 0 && d <= 1e-6) continue;
        s += d;
      }
      if (j === 0 && k > 0) w.junctionS.push(s);
      w.points.push(p);
      w.radiiMm.push(step.edge.radiiM[i]! * M_TO_MM);
      w.s.push(s);
      w.vessel.push(step.edge.vessel);
    }
    w.spans.push({ step, s0, s1: s });
  }
  return w;
}

function measureRoute(c: LoadedCase, steps: Adj[], kind: AccessKind, name: string, node: string, requiredMm: number): AccessRoute {
  const w = walk(steps);
  const L = w.s.at(-1) ?? 0;
  const vesselName = (id: string): string => c.vessels.find((v) => v.id === id)?.name ?? id;

  // The access vessel runs from the site to the first aorta point.
  const aortaAt = w.vessel.findIndex(isAorta);
  const peripheralEndMm = aortaAt >= 0 ? w.s[aortaAt]! : L;
  const reachStart = kind === 'subclavian' ? Math.max(0, peripheralEndMm - SUBCLAVIAN_REACH_MM) : 0;
  const lo = Math.min(Math.max(END_TRIM_MM, reachStart), L / 2);
  const hi = Math.max(L - END_TRIM_MM, lo);

  let narrowestMm = Infinity;
  let narrowestAt = 0;
  let narrowestVessel = '';
  const samples: AccessSample[] = [];
  for (let i = 0; i < w.points.length; i++) {
    const d = 2 * w.radiiMm[i]!;
    samples.push({ sMm: w.s[i]!, diameterMm: d });
    if (w.s[i]! < lo || w.s[i]! > hi) continue;
    if (d < narrowestMm) [narrowestMm, narrowestAt, narrowestVessel] = [d, w.s[i]!, w.vessel[i]!];
  }
  if (!Number.isFinite(narrowestMm)) narrowestMm = 0;

  // Sharpest bend along the access vessel's own edge, short of its branch point.
  const turning = windowedTurning(w.points, undefined, undefined, w.junctionS);
  const firstEdgeEndMm = w.spans[0]?.s1 ?? L;
  let bendRad = 0;
  let bendAt = 0;
  for (let i = 0; i < turning.s.length; i++) {
    const si = turning.s[i]!;
    if (si < lo || si > firstEdgeEndMm - turning.windowUsed) continue;
    if (turning.thetaRad[i]! > bendRad) [bendRad, bendAt] = [turning.thetaRad[i]!, si];
  }
  const sharpestBendDeg = (bendRad * 180) / Math.PI;

  // Risk zones on the route, inside the window.
  const zones: AccessZone[] = [];
  for (const z of c.riskZones) {
    const span = w.spans.find((sp) => sp.step.edge.id === z.edge);
    if (!span) continue;
    const len = span.step.edge.lengthM;
    const [a, b] = span.step.reversed ? [len - z.toM, len - z.fromM] : [z.fromM, z.toM];
    const z0 = span.s0 + a * M_TO_MM;
    const z1 = span.s0 + b * M_TO_MM;
    if (z1 < lo || z0 > hi) continue;
    zones.push({ kind: z.kind, tier: z.tier, vesselName: vesselName(span.step.edge.vessel) });
  }

  const marginMm = narrowestMm - requiredMm;
  const reasons: string[] = [];
  const mm = (x: number): string => `${x.toFixed(1)} mm`;
  const where = `in the ${vesselName(narrowestVessel)}, ${Math.round(narrowestAt)} mm in`;
  let verdict: AccessVerdict = 'fits';
  const forbidden = zones.filter((z) => z.tier === 'forbidden');
  if (forbidden.length) {
    verdict = 'blocked';
    for (const z of forbidden) reasons.push(`No-go ${ZONE_WORD[z.kind]} in the ${z.vesselName}.`);
  }
  if (marginMm < 0) {
    if (verdict === 'fits') verdict = 'too_small';
    reasons.push(`Narrows to ${mm(narrowestMm)} ${where}: ${mm(-marginMm)} short of ${mm(requiredMm)}.`);
  } else if (verdict === 'fits') {
    if (marginMm < TIGHT_MARGIN_MM) reasons.push(`Only ${mm(marginMm)} to spare at its narrowest (${mm(narrowestMm)}, ${where}).`);
    if (sharpestBendDeg >= SEVERE_BEND_DEG) reasons.push(`A ${Math.round(sharpestBendDeg)}° bend ${Math.round(bendAt)} mm in.`);
    for (const z of zones.filter((z) => z.tier === 'heavy')) reasons.push(`Heavy ${ZONE_WORD[z.kind]} in the ${z.vesselName}.`);
    if (reasons.length) verdict = 'caution';
  }

  return {
    kind,
    name,
    node,
    lengthMm: L,
    windowMm: [lo, hi],
    samples,
    narrowestMm,
    narrowestAtMm: narrowestAt,
    narrowestVessel: vesselName(narrowestVessel),
    marginMm,
    sharpestBendDeg,
    sharpestBendAtMm: bendAt,
    zones,
    verdict,
    reasons,
  };
}

const ZONE_WORD: Record<RiskZoneKind, string> = { plaque: 'plaque', aneurysm: 'aneurysm', dissection: 'dissection', critical_branch: 'critical branch' };

const VERDICT_RANK: Record<AccessVerdict, number> = { fits: 0, caution: 1, too_small: 2, blocked: 3 };
const KIND_RANK: Record<AccessKind, number> = { transfemoral: 0, subclavian: 1, transcarotid: 2 };

/** Better first: verdict, then spare diameter. */
export function compareRoutes(a: AccessRoute, b: AccessRoute): number {
  return VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict] || b.marginMm - a.marginMm;
}

function siteName(c: LoadedCase, node: string, vesselId: string, kind: AccessKind): string {
  const entry = c.entries.find((e) => e.node === node);
  if (entry && kind === 'transfemoral') return entry.name;
  const side = /^r_|^r|right/i.test(vesselId) ? 'Right' : /^l_|^l|left/i.test(vesselId) ? 'Left' : '';
  const word = kind === 'transfemoral' ? 'femoral' : kind === 'subclavian' ? 'subclavian' : 'common carotid';
  return side ? `${side} ${word}` : c.vessels.find((v) => v.id === vesselId)?.name ?? vesselId;
}

/** The access check for one case and one required diameter. */
export function accessReport(c: LoadedCase, requiredMm: number): AccessReport {
  const root = findAorticRoot(c);
  if (!root) return { requiredMm, rootNode: null, routes: [], bestFemoral: null, femoralVerdict: null };
  const adj = adjacency(c);
  const routes: AccessRoute[] = [];
  for (const n of c.nodes) {
    const links = adj.get(n.id) ?? [];
    if (links.length !== 1 || n.id === root) continue;
    const vessel = links[0]!.edge.vessel;
    const kind = accessKind(vessel);
    if (!kind) continue;
    const steps = shortestPath(adj, n.id, root);
    if (!steps) continue;
    routes.push(measureRoute(c, steps, kind, siteName(c, n.id, vessel, kind), n.id, requiredMm));
  }
  routes.sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.name.localeCompare(b.name));
  const femoral = routes.filter((r) => r.kind === 'transfemoral').sort(compareRoutes);
  const bestFemoral = femoral[0] ?? null;
  return { requiredMm, rootNode: root, routes, bestFemoral, femoralVerdict: bestFemoral?.verdict ?? null };
}
