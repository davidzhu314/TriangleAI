/**
 * Test helpers for V3: seeded random multi-path graphs and grids as LoadedCases (metres), plus the
 * synthetic fixtures from disk. Tests only.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CaseJson, CenterlinesJson, LoadedCase, LoadedEdge, LoadedRiskZone, RiskTier, Vec3 } from '../contracts';
import { buildTestLoadedCase } from './case-builder.testutil';

const REPO = join(import.meta.dirname, '../../..');

export function loadSynthetic(name: string): LoadedCase {
  const dir = join(REPO, 'tests/fixtures/synthetic', name);
  const read = <T>(f: string): T => JSON.parse(readFileSync(join(dir, f), 'utf8')) as T;
  return buildTestLoadedCase(read<CaseJson>('case.json'), read<CenterlinesJson>('centerlines.json'));
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A polyline from p to q at about 1 mm spacing, bowed sideways by `bowMm` at the middle. */
function edgePoints(p: Vec3, q: Vec3, bowMm: number, axis: Vec3): Vec3[] {
  const L = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) * 1000;
  const n = Math.max(2, Math.ceil(L));
  const out: Vec3[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const bow = (bowMm / 1000) * Math.sin(Math.PI * t);
    out.push([p[0] + (q[0] - p[0]) * t + axis[0] * bow, p[1] + (q[1] - p[1]) * t + axis[1] * bow, p[2] + (q[2] - p[2]) * t + axis[2] * bow]);
  }
  return out;
}

function edge(id: string, from: string, to: string, points: Vec3[], radiusM: number): LoadedEdge {
  let L = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    L += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return { id, from, to, vessel: 'v', points, radiiM: points.map(() => radiusM), lengthM: L };
}

function caseOf(id: string, pos: Map<string, Vec3>, edges: LoadedEdge[], entries: string[], targets: string[], zones: LoadedRiskZone[]): LoadedCase {
  return {
    id,
    title: id,
    origin: 'bundled',
    source: { kind: 'parametric', license: 'test' },
    physics: { available: false },
    planningOnly: true,
    vessels: [{ id: 'v', name: 'v', kind: 'artery' }],
    entries: entries.map((n, i) => ({ id: `in${i}`, name: `in${i}`, node: n })),
    targets: targets.map((n, i) => ({ id: `t${i}`, name: `t${i}`, node: n, reachable: true })),
    riskZones: zones,
    nodes: [...pos].map(([nid, p]) => ({ id: nid, pos: p, kind: 'branch' as const })),
    edges,
    mesh: { glb: new ArrayBuffer(0), toWorld: [], triangles: 0 },
    validation: [],
  };
}

/**
 * A random connected multi-path graph: a spanning tree plus extra edges (cycles), bowed edges
 * (turning), random radii (some too narrow), and random heavy, forbidden and proximity zones.
 */
export function randomCase(seed: number): LoadedCase {
  const r = rng(seed);
  const n = 6 + Math.floor(r() * 4);
  const pos = new Map<string, Vec3>();
  for (let i = 0; i < n; i++) pos.set(`n${i}`, [r() * 0.12, r() * 0.12, r() * 0.12]);
  const pairs = new Set<string>();
  const links: [number, number][] = [];
  for (let i = 1; i < n; i++) links.push([Math.floor(r() * i), i]);
  const extra = 2 + Math.floor(r() * 5);
  for (let k = 0; k < extra; k++) {
    const a = Math.floor(r() * n);
    const b = Math.floor(r() * n);
    if (a !== b) links.push([a, b]);
  }
  const edges: LoadedEdge[] = [];
  for (const [a, b] of links) {
    const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
    if (pairs.has(key)) continue;
    pairs.add(key);
    const axis: Vec3 = [r() - 0.5, r() - 0.5, r() - 0.5];
    const an = Math.hypot(...axis) || 1;
    const pts = edgePoints(pos.get(`n${a}`)!, pos.get(`n${b}`)!, r() < 0.5 ? 0 : r() * 15, [axis[0] / an, axis[1] / an, axis[2] / an]);
    const radius = r() < 0.15 ? 0.0007 : 0.001 + r() * 0.005;
    edges.push(edge(`e${edges.length}`, `n${a}`, `n${b}`, pts, radius));
  }
  const tiers: RiskTier[] = ['heavy', 'forbidden', 'proximity'];
  const zones: LoadedRiskZone[] = [];
  const zoneCount = Math.floor(r() * 4);
  for (let k = 0; k < zoneCount; k++) {
    const e = edges[Math.floor(r() * edges.length)]!;
    const from = r() * e.lengthM * 0.5;
    zones.push({ id: `z${k}`, kind: 'plaque', tier: tiers[Math.floor(r() * 3)]!, edge: e.id, fromM: from, toM: from + r() * e.lengthM * 0.4 });
  }
  return caseOf(`random-${seed}`, pos, edges, ['n0', ...(r() < 0.5 ? [`n${n - 2}`] : [])], [`n${n - 1}`, ...(r() < 0.5 ? ['n1'] : [])], zones);
}

/** A rows × cols grid of straight edges, spacing `stepMm`, entry at one corner, target at the opposite. */
export function gridCase(rows: number, cols: number, stepMm = 20): LoadedCase {
  const pos = new Map<string, Vec3>();
  const id = (i: number, j: number) => `g${i}_${j}`;
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) pos.set(id(i, j), [(j * stepMm) / 1000, (i * stepMm) / 1000, 0]);
  const edges: LoadedEdge[] = [];
  const add = (a: string, b: string, k: number) => {
    edges.push(edge(`e${String(edges.length).padStart(3, '0')}`, a, b, edgePoints(pos.get(a)!, pos.get(b)!, k, [0, 0, 1]), 0.003));
  };
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      // a small out-of-plane bow on some edges breaks length ties
      if (j + 1 < cols) add(id(i, j), id(i, j + 1), ((i * 7 + j * 3) % 5) * 0.4);
      if (i + 1 < rows) add(id(i, j), id(i + 1, j), ((i * 5 + j * 11) % 5) * 0.4);
    }
  return caseOf(`grid-${rows}x${cols}`, pos, edges, [id(0, 0)], [id(rows - 1, cols - 1)], []);
}
