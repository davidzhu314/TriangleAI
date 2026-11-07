import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import schema from '../../client/src/contracts/case.schema.json';
import { AORTA_RADIUS_RANGE_MM, AORTA_VESSEL_ID, MESH_TRIANGLE_BUDGET } from '../../client/src/contracts/validation';
import { readGlbJson } from '../lib/glb';
import { buildFixtureY } from './build';

const CASES_DIR = join(import.meta.dirname, '../../client/public/cases');
const update = process.env['UPDATE_FIXTURES'] === '1';

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateCase = ajv.compile(schema);
const validateCenterlines = ajv.compile({ $ref: 'urn:threadsim:case:1#/$defs/centerlines' });

const built = buildFixtureY();

describe('fixture-y files', () => {
  it(update ? 'writes the committed files' : 'match the committed files byte for byte', () => {
    for (const [rel, content] of Object.entries(built.files)) {
      const path = join(CASES_DIR, rel);
      const bytes = typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content);
      if (update) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, bytes);
      }
      expect(readFileSync(path).equals(bytes), `${rel} is stale; run pnpm fixtures`).toBe(true);
    }
  });

  it('builds identically twice', () => {
    const again = buildFixtureY();
    for (const [rel, content] of Object.entries(built.files)) {
      expect(Buffer.from(again.files[rel]!).equals(Buffer.from(content))).toBe(true);
    }
  });
});

describe('fixture-y validates', () => {
  // Read lazily: in update mode the files are written by the first describe block.
  const read = (rel: string) => JSON.parse(readFileSync(join(CASES_DIR, rel), 'utf8'));

  it('against case.schema.json', () => {
    const caseJson = read('fixture-y/case.json');
    const centerlines = read('fixture-y/centerlines.json');
    expect(validateCase(caseJson), JSON.stringify(validateCase.errors)).toBe(true);
    expect(validateCenterlines(centerlines), JSON.stringify(validateCenterlines.errors)).toBe(true);
  });

  it('has an aorta, one entry, two targets and one heavy risk zone', () => {
    const caseJson = read('fixture-y/case.json');
    expect(caseJson.entries).toHaveLength(1);
    expect(caseJson.targets).toHaveLength(2);
    expect(caseJson.riskZones.filter((z: { tier: string }) => z.tier === 'heavy')).toHaveLength(1);
    expect(caseJson.vessels.map((v: { id: string }) => v.id)).toContain(AORTA_VESSEL_ID);
  });

  const nodes = new Map(built.centerlines.nodes.map((n) => [n.id, n]));
  const edges = built.centerlines.edges;

  it('has radii per point, all positive, points about 1 mm apart, ends on its nodes', () => {
    for (const e of edges) {
      expect(e.radii_mm).toHaveLength(e.points.length);
      expect(e.radii_mm.every((r) => r > 0)).toBe(true);
      for (let i = 1; i < e.points.length; i++) {
        const [a, b] = [e.points[i - 1]!, e.points[i]!];
        const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        expect(d).toBeGreaterThan(0.99);
        expect(d).toBeLessThan(1.01);
      }
      expect(e.points[0]).toEqual(nodes.get(e.from)!.pos);
      expect(e.points.at(-1)).toEqual(nodes.get(e.to)!.pos);
    }
  });

  it('connects the entry to every target', () => {
    const adj = new Map<string, string[]>();
    for (const e of edges) {
      adj.set(e.from, [...(adj.get(e.from) ?? []), e.to]);
      adj.set(e.to, [...(adj.get(e.to) ?? []), e.from]);
    }
    for (const entry of built.caseJson.entries) {
      const seen = new Set([entry.node]);
      const queue = [entry.node];
      while (queue.length) for (const n of adj.get(queue.shift()!) ?? []) if (!seen.has(n)) (seen.add(n), queue.push(n));
      for (const t of built.caseJson.targets) expect(seen.has(t.node), t.id).toBe(true);
    }
  });

  it('passes the units check (largest aorta radius 7–20 mm)', () => {
    const r = Math.max(...edges.filter((e) => e.vessel === AORTA_VESSEL_ID).flatMap((e) => e.radii_mm));
    expect(r).toBeGreaterThanOrEqual(AORTA_RADIUS_RANGE_MM[0]);
    expect(r).toBeLessThanOrEqual(AORTA_RADIUS_RANGE_MM[1]);
  });

  it('puts every risk zone inside its edge', () => {
    for (const z of built.caseJson.riskZones) {
      const e = edges.find((x) => x.id === z.edge)!;
      expect(z.from_mm).toBeLessThan(z.to_mm);
      expect(z.to_mm).toBeLessThanOrEqual(e.points.length - 1);
    }
  });

  it('has one mesh node per vessel, under the triangle budget', () => {
    const { json } = readGlbJson(built.files['fixture-y/vessels.glb'] as Uint8Array);
    expect(json.nodes.map((n: { name: string }) => n.name)).toEqual(built.caseJson.vessels.map((v) => v.id));
    const triangles = json.meshes.reduce(
      (s: number, m: { primitives: { indices: number }[] }) => s + json.accessors[m.primitives[0]!.indices].count / 3,
      0,
    );
    expect(triangles).toBeGreaterThan(0);
    expect(triangles).toBeLessThanOrEqual(MESH_TRIANGLE_BUDGET);
  });
});

describe('case.schema.json rejects', () => {
  const good = built.caseJson;
  it.each([
    ['a wrong schema id', { ...good, schema: 'threadsim.case/2' }],
    ['metres', { ...good, units: 'm' }],
    ['physics without a phantom', { ...good, physics: { available: true } }],
    ['an unknown risk tier', { ...good, riskZones: [{ ...good.riskZones[0], tier: 'mild' }] }],
    ['no targets', { ...good, targets: [] }],
  ])('%s', (_, bad) => {
    expect(validateCase(bad)).toBe(false);
  });

  it('a centerline edge without radii', () => {
    const { radii_mm: _r, ...edge } = built.centerlines.edges[0]!;
    expect(validateCenterlines({ ...built.centerlines, edges: [edge] })).toBe(false);
  });
});
