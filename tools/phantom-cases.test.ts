/**
 * D3a: the four CathSim phantom packages in physics/cases/ (written by
 * physics/cases/convert_phantoms.py, which needs the CathSim clone, so CI checks the committed output).
 * They load the way the physics process will serve them (origin "physics"), and nothing from CathSim
 * is under client/.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { loadCase, type CaseSource } from '../client/src/case';
import { countTriangles, parseGlb } from '../client/src/case/glb';
import type { CaseJson, CenterlinesJson, LoadedCase } from '../client/src/contracts/case';
import schema from '../client/src/contracts/case.schema.json';

const REPO = join(import.meta.dirname, '..');
const CASES = join(REPO, 'physics/cases');
const PHANTOMS = ['low_tort', 'phantom2', 'phantom3', 'phantom4'] as const;
/** Spec §3.3: phantom meshes simplified to under 60k triangles (stricter than the 100k import budget). */
const PHANTOM_TRIANGLE_CAP = 60_000;

const bytes = (id: string, f: string) => new Uint8Array(readFileSync(join(CASES, id, f)));
const json = <T>(id: string, f: string) => JSON.parse(readFileSync(join(CASES, id, f), 'utf8')) as T;
const source = (id: string, origin: 'physics' | 'imported'): CaseSource => ({
  kind: 'files',
  origin,
  files: { 'case.json': bytes(id, 'case.json'), 'centerlines.json': bytes(id, 'centerlines.json'), 'vessels.glb': bytes(id, 'vessels.glb') },
});

async function load(id: string): Promise<LoadedCase> {
  const r = await loadCase(source(id, 'physics'));
  if (!r.ok) throw new Error(JSON.stringify(r.results, null, 2));
  return r.case;
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateCase = ajv.compile(schema);
const validateCenterlines = ajv.compile({ $ref: 'urn:threadsim:case:1#/$defs/centerlines' });

describe.each(PHANTOMS)('physics/cases/%s', (id) => {
  it('matches case.schema.json and is a CathSim package under CC BY-NC-SA 4.0', () => {
    const c = json<CaseJson>(id, 'case.json');
    expect(validateCase(c), JSON.stringify(validateCase.errors)).toBe(true);
    expect(validateCenterlines(json(id, 'centerlines.json')), JSON.stringify(validateCenterlines.errors)).toBe(true);
    expect(c.id).toBe(id);
    expect(c.source.kind).toBe('cathsim');
    expect(c.source.license).toBe('CC BY-NC-SA 4.0');
    expect(c.physics).toEqual({ available: true, phantom: id });
    expect(c.targets.map((t) => t.id)).toEqual(['bca', 'lcca']);
    const license = readFileSync(join(CASES, id, 'LICENSE.md'), 'utf8');
    expect(license).toContain('CC BY-NC-SA 4.0');
    expect(license).toContain('https://github.com/airvlab/cathsim');
  });

  it('loads through loadCase as a physics-served case with no errors and physics allowed', async () => {
    const c = await load(id);
    expect(c.origin).toBe('physics');
    expect(c.physics).toEqual({ available: true, phantom: id });
    expect(c.planningOnly).toBe(false);
    expect(c.validation.filter((v) => v.severity === 'error')).toEqual([]);
    // No patient or unknown fields to strip.
    expect(c.validation.filter((v) => v.check === 'privacy')).toEqual([]);
  });

  it('is planning only when the same files arrive any other way (e.g. as an import)', async () => {
    const r = await loadCase(source(id, 'imported'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.case.planningOnly).toBe(true);
  });

  it('connects the entry to both targets', async () => {
    const c = await load(id);
    expect(c.targets.every((t) => t.reachable)).toBe(true);
    expect(c.validation.filter((v) => v.check === 'graph' || v.check === 'radii')).toEqual([]);
  });

  it('has one radius per point, all > 0, points about 1 mm apart, edges ending on their nodes', () => {
    const cl = json<CenterlinesJson>(id, 'centerlines.json');
    const pos = new Map(cl.nodes.map((n) => [n.id, n.pos]));
    for (const e of cl.edges) {
      expect(e.radii_mm).toHaveLength(e.points.length);
      expect(e.radii_mm.every((r) => r > 0)).toBe(true);
      for (let i = 1; i < e.points.length; i++) {
        const [a, b] = [e.points[i - 1]!, e.points[i]!];
        const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        expect(d, `${e.id}[${i}]`).toBeGreaterThan(0.7);
        expect(d, `${e.id}[${i}]`).toBeLessThan(1.3);
      }
      expect(e.points[0]).toEqual(pos.get(e.from));
      expect(e.points.at(-1)).toEqual(pos.get(e.to));
    }
  });

  it('has a GLB under 60k triangles with one node per vessel, named by vessel id', () => {
    const glb = parseGlb(bytes(id, 'vessels.glb'));
    expect(countTriangles(glb.json)).toBeLessThan(PHANTOM_TRIANGLE_CAP);
    expect(glb.json['nodes'].map((n: { name: string }) => n.name)).toEqual(json<CaseJson>(id, 'case.json').vessels.map((v) => v.id));
    expect(glb.json['asset'].extras).toEqual({ axes: 'RAS', units: 'mm' });
  });

  it('is head up: both targets sit above the entry', async () => {
    const c = await load(id);
    expect(c.validation.filter((v) => v.check === 'axes')).toEqual([]);
  });
});

describe('license boundary', () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules') continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else out.push(p);
    }
    return out;
  }
  const clientFiles = walk(join(REPO, 'client'));

  it('has no CathSim meshes or phantom packages under client/', () => {
    expect(clientFiles.filter((f) => /\.stl$/i.test(f))).toEqual([]);
    const phantomGlbs = PHANTOMS.map((id) => Buffer.from(bytes(id, 'vessels.glb')));
    for (const f of clientFiles.filter((x) => x.endsWith('.glb'))) {
      const b = readFileSync(f);
      expect(phantomGlbs.some((g) => g.equals(b)), f).toBe(false);
    }
    for (const f of clientFiles.filter((x) => x.endsWith('case.json'))) {
      expect(JSON.parse(readFileSync(f, 'utf8')).source?.kind, f).not.toBe('cathsim');
    }
  });

  it('keeps the phantom packages out of the bundled catalog', () => {
    const index = JSON.parse(readFileSync(join(REPO, 'client/public/cases/index.json'), 'utf8')) as { cases: { id: string }[] };
    for (const id of PHANTOMS) {
      expect(index.cases.map((c) => c.id)).not.toContain(id);
      expect(existsSync(join(REPO, 'client/public/cases', id))).toBe(false);
    }
  });
});
