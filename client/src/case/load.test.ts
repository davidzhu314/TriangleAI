import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { writeZip } from '../../../tools/lib/zip';
import { RAS_MM_TO_YUP_M, type CaseLoadResult, type LoadedCase } from '../contracts';
import { countTriangles, parseGlb, stripExtras } from './glb';
import { listBundledCases, loadCase, type CaseSource } from './index';
import { openZip } from './unzip';

const CASES = join(import.meta.dirname, '../../public/cases');
const read = (rel: string) => new Uint8Array(readFileSync(join(CASES, rel)));
const FILES = ['case.json', 'centerlines.json', 'vessels.glb'] as const;
const fixtureFiles = () => Object.fromEntries(FILES.map((n) => [n, read(`fixture-y/${n}`)]));

/** fetch over client/public/cases, as Vite serves it at /cases/. */
const diskFetch = (async (url: string) => {
  const rel = String(url).replace(/^\/cases\//, '');
  try {
    const bytes = readFileSync(join(CASES, rel));
    return new Response(bytes);
  } catch {
    return new Response('not found', { status: 404 });
  }
}) as typeof fetch;

function loaded(r: CaseLoadResult): LoadedCase {
  if (!r.ok) throw new Error(JSON.stringify(r.results, null, 2));
  return r.case;
}

const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 12));

describe('loadCase on fixture-y', () => {
  it('loads from files with no validation results', async () => {
    const c = loaded(await loadCase({ kind: 'files', origin: 'bundled', files: fixtureFiles() }));
    expect(c.validation).toEqual([]);
    expect(c.id).toBe('fixture-y');
    expect(c.origin).toBe('bundled');
    expect(c.planningOnly).toBe(true);
    expect(c.physics).toEqual({ available: false });
    expect(c.targets.every((t) => t.reachable)).toBe(true);
    expect(c.fluoroBudgetS).toBe(60);
    expect(c.difficulty).toBe('beginner');
  });

  it('converts mm RAS to m Y-up once: (x, y, z) ↦ (−x, z, y) / 1000', async () => {
    const c = loaded(await loadCase({ kind: 'files', origin: 'bundled', files: fixtureFiles() }));
    const nodes = new Map(c.nodes.map((n) => [n.id, n.pos]));
    close(nodes.get('n_entry')!, [0, 0, 0]);
    close(nodes.get('n_split')!, [0, 0.1, 0]); // RAS z=100 mm → Y-up y=0.1 m
    const aorta = c.edges.find((e) => e.id === 'e_aorta')!;
    expect(aorta.lengthM).toBeCloseTo(0.1, 12);
    expect(aorta.radiiM.every((r) => Math.abs(r - 0.012) < 1e-12)).toBe(true);
    const left = c.edges.find((e) => e.id === 'e_left')!;
    // RAS −x is patient left; Y-up +x is patient left.
    expect(left.points.at(-1)![0]).toBeGreaterThan(0);
    expect(left.lengthM).toBeCloseTo(0.05, 6); // points are rounded to 0.1 µm
    expect(c.riskZones[0]).toEqual({ id: 'plaque_r', kind: 'plaque', tier: 'heavy', edge: 'e_right', fromM: 0.01, toM: 0.035 });
    expect(c.mesh.toWorld).toEqual([...RAS_MM_TO_YUP_M]);
    expect(c.mesh.triangles).toBe(6720);
    expect(new Uint8Array(c.mesh.glb)).toEqual(read('fixture-y/vessels.glb'));
  });

  it('loads the same from a URL folder, a stored zip, a deflate zip and a zipped folder', async () => {
    const files = fixtureFiles();
    const ref = loaded(await loadCase({ kind: 'files', origin: 'bundled', files }));
    const parts = FILES.map((n) => [n, files[n]!] as [string, Uint8Array]);
    const sources: CaseSource[] = [
      { kind: 'url', baseUrl: '/cases/fixture-y/', origin: 'bundled' },
      { kind: 'zip', data: writeZip(parts) },
      { kind: 'zip', data: writeZip(parts, (d) => new Uint8Array(deflateRawSync(d))).slice().buffer },
      { kind: 'zip', data: new Blob([writeZip(parts.map(([n, d]) => [`fixture-y/${n}`, d])) as Uint8Array<ArrayBuffer>]) },
    ];
    for (const source of sources) {
      const c = loaded(await loadCase(source, { fetch: diskFetch }));
      expect({ ...c, origin: 'x', mesh: { ...c.mesh, glb: null } }).toEqual({ ...ref, origin: 'x', mesh: { ...ref.mesh, glb: null } });
      expect(c.origin).toBe(source.kind === 'zip' ? 'imported' : 'bundled');
    }
  });

  it('lists bundled cases from index.json', async () => {
    const list = await listBundledCases('/cases/', diskFetch);
    expect(list.map((x) => x.id)).toEqual(['low-tort', 'type-iii', 'fixture-y']);
    const fixture = list.find((x) => x.id === 'fixture-y')!;
    expect(loaded(await loadCase(fixture.source, { fetch: diskFetch })).id).toBe('fixture-y');
  });

  it('rejects a package with a missing file or bad JSON', async () => {
    const missing = await loadCase({ kind: 'files', origin: 'imported', files: { ...fixtureFiles(), 'vessels.glb': undefined as never } });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.results[0]!.message).toMatch(/no vessels\.glb/);
    const bad = await loadCase({ kind: 'files', origin: 'imported', files: { ...fixtureFiles(), 'case.json': new TextEncoder().encode('{') } });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.results[0]).toMatchObject({ check: 'schema', severity: 'error', message: 'case.json is not valid JSON.' });
    const http = await loadCase({ kind: 'url', baseUrl: '/cases/nope/', origin: 'physics' }, { fetch: diskFetch });
    expect(http.ok).toBe(false);
  });

  it('rejects a file that is not a zip, and a zip with a bad checksum', async () => {
    const notZip = await loadCase({ kind: 'zip', data: new Uint8Array(100) });
    expect(notZip.ok).toBe(false);
    if (!notZip.ok) expect(notZip.results[0]!.message).toMatch(/not a zip file/);
    const zip = writeZip(FILES.map((n) => [n, fixtureFiles()[n]!]));
    zip[40] = zip[40]! ^ 0xff; // a byte inside case.json's data
    const corrupt = await loadCase({ kind: 'zip', data: zip });
    expect(corrupt.ok).toBe(false);
    if (!corrupt.ok) expect(corrupt.results[0]!.message).toMatch(/checksum/);
  });

  it('accepts physics only for a CathSim phantom served by the physics process', async () => {
    const files = fixtureFiles();
    const c = JSON.parse(new TextDecoder().decode(files['case.json']));
    c.source.kind = 'cathsim';
    c.physics = { available: true, phantom: 'phantom3' };
    const phantom = { ...files, 'case.json': new TextEncoder().encode(JSON.stringify(c)) };
    const served = loaded(await loadCase({ kind: 'files', origin: 'physics', files: phantom }));
    expect(served.physics).toEqual({ available: true, phantom: 'phantom3' });
    expect(served.planningOnly).toBe(false);
    expect(served.validation).toEqual([]);
    const imported = loaded(await loadCase({ kind: 'files', origin: 'imported', files: phantom }));
    expect(imported.planningOnly).toBe(true);
    expect(imported.validation[0]!.message).toMatch(/only from the physics process/);
  });
});

describe('glb helpers', () => {
  it('counts fixture-y triangles and keeps our own asset extras', () => {
    const glb = parseGlb(read('fixture-y/vessels.glb'));
    expect(countTriangles(glb.json)).toBe(6720);
    expect(stripExtras(glb.json)).toEqual([]);
    glb.json['nodes'][0].extras = { scan: 'x' };
    glb.json['asset'].extras.patient = 'x';
    expect(stripExtras(glb.json).sort()).toEqual(['/asset/extras/patient', '/nodes/0/extras']);
    expect(glb.json['asset'].extras).toEqual({ units: 'mm', axes: 'RAS' });
  });

  it('reads zip entry names', () => {
    const zip = openZip(writeZip([['a/case.json', new Uint8Array([1])]]));
    expect(zip.entries.map((e) => e.name)).toEqual(['a/case.json']);
  });
});
