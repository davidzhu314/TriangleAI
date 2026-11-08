/**
 * The 3D Slicer exports: client/public/cases/ts-<subject>-cta/ (D3c's ts-s1404-cta, then ts-s1336-cta and
 * ts-s0727-cta). The committed files are the output of slicer/export_case.py, which needs Slicer + SlicerVMTK,
 * so CI checks the committed output. Each must import through the real loader and validator with no manual edits.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { loadCase, type CaseSource } from '../client/src/case';
import { countTriangles, parseGlb } from '../client/src/case/glb';
import type { CaseJson, CenterlinesJson, LoadedCase } from '../client/src/contracts/case';
import { CASE_FILES } from '../client/src/contracts';
import schema from '../client/src/contracts/case.schema.json';
import { MESH_TRIANGLE_BUDGET } from '../client/src/contracts/validation';
import { writeZip } from './lib/zip';
import { BUNDLED_CASE_IDS } from './catalog';

/** TotalSegmentator subjects, in catalog order. */
const SUBJECTS = ['s1404', 's1336', 's0727'] as const;
const IDS = SUBJECTS.map((s) => `ts-${s}-cta`);
const FILES = ['case.json', 'centerlines.json', 'vessels.glb'] as const;

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateCase = ajv.compile(schema);
const validateCenterlines = ajv.compile({ $ref: 'urn:threadsim:case:1#/$defs/centerlines' });

describe.each(SUBJECTS.map((subject) => [`ts-${subject}-cta`, subject] as const))('%s (3D Slicer + SlicerVMTK export)', (ID, subject) => {
  const DIR = join(import.meta.dirname, '../client/public/cases', ID);
  const bytes = (f: string) => new Uint8Array(readFileSync(join(DIR, f)));
  const json = <T>(f: string) => JSON.parse(readFileSync(join(DIR, f), 'utf8')) as T;
  const files = (): CaseSource => ({ kind: 'files', origin: 'bundled', files: Object.fromEntries(FILES.map((f) => [f, bytes(f)])) as never });
  async function load(source: CaseSource = files()): Promise<LoadedCase> {
    const r = await loadCase(source);
    if (!r.ok) throw new Error(JSON.stringify(r.results, null, 2));
    return r.case;
  }

  it('matches case.schema.json, is a CT case under CC BY 4.0 with attribution, in mm and RAS', () => {
    const c = json<CaseJson>('case.json');
    expect(validateCase(c), JSON.stringify(validateCase.errors)).toBe(true);
    expect(validateCenterlines(json('centerlines.json')), JSON.stringify(validateCenterlines.errors)).toBe(true);
    expect(c.id).toBe(ID);
    expect(c.units).toBe('mm');
    expect(c.axes).toBe('RAS');
    expect(c.source.kind).toBe('ct');
    expect(c.source.license).toBe('CC BY 4.0');
    expect(c.source.dataset).toMatch(new RegExp(`TotalSegmentator.*subject ${subject},.*zenodo\\.10047263`));
    expect(c.physics).toEqual({ available: false });
    expect(c.entries.map((e) => e.id)).toEqual(['fem_r', 'fem_l']);
    expect(c.targets.map((t) => t.id)).toEqual(['rcca', 'lcca']);
  });

  it('loads through loadCase with no errors, planning only, and nothing stripped for privacy', async () => {
    const c = await load();
    expect(c.validation.filter((v) => v.severity === 'error')).toEqual([]);
    expect(c.validation.filter((v) => v.check === 'privacy')).toEqual([]);
    expect(c.validation.filter((v) => v.check === 'units' || v.check === 'axes')).toEqual([]); // no rescale or flip to accept
    expect(c.planningOnly).toBe(true);
    expect(c.source.kind).toBe('ct');
  });

  it('loads the same from a zip, as a user import would', async () => {
    const zip = writeZip(FILES.map((f) => [f, bytes(f)]), (d) => new Uint8Array(deflateRawSync(d)));
    const r = await loadCase({ kind: 'zip', data: zip });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.case.validation.filter((v) => v.severity === 'error')).toEqual([]);
  });

  it('connects every entry to every target', async () => {
    const c = await load();
    expect(c.targets.every((t) => t.reachable)).toBe(true);
    expect(c.validation.filter((v) => v.check === 'graph' || v.check === 'radii')).toEqual([]);
  });

  it('has one radius per point, all > 0, points about 1 mm apart, edges ending on their nodes', () => {
    const cl = json<CenterlinesJson>('centerlines.json');
    const pos = new Map(cl.nodes.map((n) => [n.id, n.pos]));
    for (const e of cl.edges) {
      expect(e.radii_mm).toHaveLength(e.points.length);
      expect(e.radii_mm.every((r) => r > 0)).toBe(true);
      for (let i = 1; i < e.points.length; i++) {
        const [a, b] = [e.points[i - 1]!, e.points[i]!];
        const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        expect(d, `${e.id}[${i}]`).toBeGreaterThan(0.9);
        expect(d, `${e.id}[${i}]`).toBeLessThan(1.1);
      }
      expect(e.points[0]).toEqual(pos.get(e.from));
      expect(e.points.at(-1)).toEqual(pos.get(e.to));
    }
  });

  it('has a GLB with one node per vessel named by vessel id, in mm and RAS, under the 100k triangle budget', () => {
    const glb = parseGlb(bytes('vessels.glb'));
    expect(glb.json['nodes'].map((n: { name: string }) => n.name)).toEqual(json<CaseJson>('case.json').vessels.map((v) => v.id));
    expect(glb.json['asset'].extras).toEqual({ axes: 'RAS', units: 'mm' });
    expect(countTriangles(glb.json)).toBeLessThanOrEqual(MESH_TRIANGLE_BUDGET);
  });

  it('has a context.glb beside the package: same subject\'s bones and heart, mm and RAS, never part of the case', () => {
    const ctx = bytes('context.glb');
    expect(ctx.length, 'about 1.5 MB at most').toBeLessThanOrEqual(1.5 * 1024 * 1024);
    const glb = parseGlb(ctx);
    expect(glb.json['asset'].extras).toEqual({ axes: 'RAS', units: 'mm' });
    expect(glb.json['nodes']).toEqual([
      { name: 'bone', mesh: 0, extras: { kind: 'context', label: 'Bones' } },
      { name: 'heart', mesh: 1, extras: { kind: 'context', label: 'Heart' } },
    ]);
    expect(countTriangles(glb.json)).toBeLessThanOrEqual(MESH_TRIANGLE_BUDGET);
    // The loader reads only the package files; case.json never names the context file.
    expect(Object.values(CASE_FILES)).not.toContain('context.glb');
    expect(readFileSync(join(DIR, 'case.json'), 'utf8')).not.toContain('context');
  });

  it('carries no patient fields: only the case schema keys', () => {
    const c = json<Record<string, unknown>>('case.json');
    expect(Object.keys(c).sort()).toEqual(['axes', 'difficulty', 'entries', 'fluoro_budget_s', 'id', 'physics', 'riskZones', 'scenario', 'schema', 'source', 'targets', 'title', 'units', 'vessels']);
    expect(JSON.stringify(c)).not.toMatch(/\b(age|sex|gender|birth|patient|scanner|manufacturer)\b/i);
  });

  it('is listed in the catalog with the other Slicer cases, outside the ladder, just before fixture-y', () => {
    const list: readonly string[] = BUNDLED_CASE_IDS;
    expect(list.slice(-1 - IDS.length, -1)).toEqual(IDS);
    expect(list.indexOf(ID)).toBe(list.length - 1 - IDS.length + IDS.indexOf(ID));
    expect(list.at(-1)).toBe('fixture-y');
  });
});
