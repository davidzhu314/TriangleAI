/**
 * measureRoute must fit in one frame (16.7 ms at 60 Hz), because the Plan screen calls it on every
 * click. Timed on fixture-y, the junction fixture, and a synthetic 1 m, 10-edge curved route at
 * 1 mm spacing with risk zones (longer than an entry-to-carotid route).
 *
 * UPDATE_METRICS=1 writes the summary to metrics/vaibhav/v2-measure-route-timing.md.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CaseJson, CenterlinesJson, LoadedCase, LoadedEdge, Vec3 } from '../contracts';
import { loadFixtureY } from './fixture-y.testutil';
import { buildGraph } from './graph';
import { buildMockLoadedCase } from './mock-case';
import { measureRoute } from './measure-route';

const REPO = join(import.meta.dirname, '../../..');
const FRAME_MS = 1000 / 60;

/** A chain of `n` curved edges, each `lenMm` long, 1 mm spacing, in metres Y-up. */
function longChain(n = 10, lenMm = 100): { c: LoadedCase; path: string[] } {
  const edges: LoadedEdge[] = [];
  let s0 = 0;
  for (let k = 0; k < n; k++) {
    const points: Vec3[] = [];
    for (let i = 0; i <= lenMm; i++) {
      const s = s0 + i; // mm along the chain
      points.push([(8 * Math.sin(s / 40)) / 1000, s / 1000, (5 * Math.cos(s / 25)) / 1000]);
    }
    let L = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      L += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
    edges.push({ id: `e${k}`, from: `n${k}`, to: `n${k + 1}`, vessel: 'v', points, radiiM: points.map(() => 0.004), lengthM: L });
    s0 += lenMm;
  }
  const c: LoadedCase = {
    id: 'timing-chain',
    title: 'timing chain',
    origin: 'bundled',
    source: { kind: 'parametric', license: 'test' },
    physics: { available: false },
    planningOnly: true,
    vessels: [{ id: 'v', name: 'v', kind: 'artery' }],
    entries: [{ id: 'in', name: 'in', node: 'n0' }],
    targets: [{ id: 'out', name: 'out', node: `n${n}`, reachable: true }],
    riskZones: [
      { id: 'h1', kind: 'plaque', tier: 'heavy', edge: 'e3', fromM: 0.01, toM: 0.03 },
      { id: 'p1', kind: 'critical_branch', tier: 'proximity', edge: 'e5', fromM: 0.02, toM: 0.06 },
      { id: 'p2', kind: 'critical_branch', tier: 'proximity', edge: 'e8', fromM: 0, toM: 0.05 },
    ],
    nodes: Array.from({ length: n + 1 }, (_, k) => ({ id: `n${k}`, pos: [0, 0, 0] as Vec3, kind: k === 0 ? ('entry' as const) : ('end' as const) })),
    edges,
    mesh: { glb: new ArrayBuffer(0), toWorld: [], triangles: 0 },
    validation: [],
  };
  return { c, path: edges.map((e) => e.id) };
}

function time(fn: () => void, runs: number): { medianMs: number; p95Ms: number; maxMs: number } {
  for (let i = 0; i < 20; i++) fn(); // warm up the JIT
  const t: number[] = [];
  for (let i = 0; i < runs; i++) {
    const a = performance.now();
    fn();
    t.push(performance.now() - a);
  }
  t.sort((x, y) => x - y);
  return { medianMs: t[Math.floor(runs / 2)]!, p95Ms: t[Math.floor(runs * 0.95)]!, maxMs: t[runs - 1]! };
}

function junctionCase(): LoadedCase {
  const dir = join(REPO, 'tests/fixtures/synthetic/junction');
  const read = <T>(f: string): T => JSON.parse(readFileSync(join(dir, f), 'utf8')) as T;
  return buildMockLoadedCase(read<CaseJson>('case.json'), read<CenterlinesJson>('centerlines.json'));
}

describe('measureRoute timing', () => {
  const chain = longChain();
  const rows: { label: string; lengthMm: number; edges: number; t: ReturnType<typeof time> }[] = [];
  const buildMs = time(() => buildGraph(chain.c), 20);

  const subjects: [string, LoadedCase, string[]][] = [
    ['fixture-y, entry → left', loadFixtureY(), ['e_aorta', 'e_left']],
    ['junction, parent → retro (120°)', junctionCase(), ['e0', 'e1']],
    ['chain, 1 edge (partial)', chain.c, chain.path.slice(0, 1)],
    ['chain, 5 edges (partial)', chain.c, chain.path.slice(0, 5)],
    ['chain, 10 edges (1 m, full)', chain.c, chain.path],
  ];

  for (const [label, c, path] of subjects) {
    it(`${label} fits in one frame`, () => {
      const g = buildGraph(c);
      const lengthMm = measureRoute(g, path).cost.lengthM * 1000;
      const t = time(() => measureRoute(g, path), 200);
      rows.push({ label, lengthMm, edges: path.length, t });
      expect(t.p95Ms).toBeLessThan(FRAME_MS);
    });
  }

  it('writes the metrics summary when asked', () => {
    if (process.env['UPDATE_METRICS'] !== '1') return;
    const fmt = (x: number) => x.toFixed(3);
    const lines = [
      '# V2 — measureRoute timing',
      '',
      'Written by `UPDATE_METRICS=1 pnpm exec vitest run client/src/optimize/measure-route.timing.test.ts`; the same test asserts p95 under one 60 Hz frame (16.7 ms) on every CI run.',
      '',
      `Machine: ${process.platform} ${process.arch}, Node ${process.version}. Main thread, after a 20-call warm-up; 200 calls per row. A Worker adds one postMessage round trip on top.`,
      '',
      '| Route | Edges | Length mm | Median ms | p95 ms | Max ms |',
      '| --- | --- | --- | --- | --- | --- |',
      ...rows.map((r) => `| ${r.label} | ${r.edges} | ${r.lengthMm.toFixed(1)} | ${fmt(r.t.medianMs)} | ${fmt(r.t.p95Ms)} | ${fmt(r.t.maxMs)} |`),
      '',
      `buildGraph on the 1 m chain (10 edges, 3 zones, once per case load): median ${fmt(buildMs.medianMs)} ms, p95 ${fmt(buildMs.p95Ms)} ms.`,
      '',
    ];
    writeFileSync(join(REPO, 'metrics/vaibhav/v2-measure-route-timing.md'), lines.join('\n'));
  });
});
