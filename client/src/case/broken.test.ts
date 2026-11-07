/**
 * D2 acceptance: each broken package in tests/fixtures/broken/ produces its §3.5 message, and
 * applying the offered fix re-runs validation and clears it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MESH_TRIANGLE_BUDGET, type CaseLoadResult, type LoadedCase, type ValidationCheckId, type ValidationResult } from '../contracts';
import { decimateGlb } from './decimate';
import { parseGlb, readTriMeshes } from './glb';
import { loadCase, type CaseSource } from './index';
import type { LoadOptions } from './load';

const DIR = join(import.meta.dirname, '../../../tests/fixtures/broken');

function source(rule: ValidationCheckId): CaseSource {
  const zip = join(DIR, rule, 'case.zip');
  if (existsSync(zip)) return { kind: 'zip', data: new Uint8Array(readFileSync(zip)) };
  const files = Object.fromEntries(
    ['case.json', 'centerlines.json', 'vessels.glb'].map((n) => [n, new Uint8Array(readFileSync(join(DIR, rule, n)))]),
  );
  return { kind: 'files', origin: 'imported', files };
}

const load = (rule: ValidationCheckId, options?: LoadOptions) => loadCase(source(rule), options);

function loaded(r: CaseLoadResult): LoadedCase {
  if (!r.ok) throw new Error(JSON.stringify(r.results, null, 2));
  return r.case;
}

const of = (results: ValidationResult[], check: ValidationCheckId) => results.filter((r) => r.check === check);

describe('broken packages, one per §3.5 rule', () => {
  it('schema: rejected with field-level messages', async () => {
    const r = await load('schema');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.results.every((x) => x.check === 'schema' && x.severity === 'error')).toBe(true);
    expect(r.results).toContainEqual(expect.objectContaining({ path: '/title', message: 'case.json /title is missing.' }));
    expect(r.results).toContainEqual(expect.objectContaining({ path: '/entries/0/node', message: 'case.json /entries/0/node must be string.' }));
  });

  it('units: offers ×1000; accepting it clears the warning and restores millimetre-scale geometry', async () => {
    const c = loaded(await load('units'));
    const [w] = of(c.validation, 'units');
    expect(w).toMatchObject({ severity: 'warning', fix: { kind: 'rescale', factor: 1000 } });
    expect(w!.message).toMatch(/0\.012 mm.*metres/);
    const fixed = loaded(await load('units', { fixes: [w!.fix!] }));
    expect(fixed.validation).toEqual([]);
    expect(fixed.edges.find((e) => e.id === 'e_aorta')!.lengthM).toBeCloseTo(0.1, 9);
    expect(fixed.riskZones[0]!.toM).toBeCloseTo(0.035, 12);
    expect(fixed.mesh.toWorld.slice(0, 3)).toEqual([-1, 0, 0]); // RAS_MM_TO_YUP_M × 1000
  });

  it('axes: offers flipping S; accepting it clears the warning and puts the head up', async () => {
    const c = loaded(await load('axes'));
    const [w] = of(c.validation, 'axes');
    expect(w).toMatchObject({ severity: 'warning', fix: { kind: 'flip_axes', axis: 'S' } });
    const fixed = loaded(await load('axes', { fixes: [w!.fix!] }));
    expect(fixed.validation).toEqual([]);
    const y = new Map(fixed.nodes.map((n) => [n.id, n.pos[1]]));
    expect(y.get('n_left')!).toBeGreaterThan(y.get('n_entry')!);
    expect(fixed.mesh.toWorld).toEqual([-0.001, 0, 0, 0, 0, 0, 0.001, 0, 0, -0.001, 0, 0, 0, 0, 0, 1]);
  });

  it('graph: removes the zero-length edge and marks the island target unreachable', async () => {
    const c = loaded(await load('graph'));
    const g = of(c.validation, 'graph');
    expect(g).toContainEqual(expect.objectContaining({ severity: 'warning', ids: ['e_stub'], message: 'Edge e_stub has zero length, so it was removed.' }));
    expect(g).toContainEqual(expect.objectContaining({ severity: 'warning', ids: ['island', 'fem_r'], message: 'Island target cannot be reached from any entry site; it is marked unreachable.' }));
    expect(c.edges.map((e) => e.id)).not.toContain('e_stub');
    expect(c.targets.find((t) => t.id === 'island')!.reachable).toBe(false);
    expect(c.targets.filter((t) => t.id !== 'island').every((t) => t.reachable)).toBe(true);
  });

  it('radii: rejects the bad edges (and their risk zones), not the case', async () => {
    const c = loaded(await load('radii'));
    const r = of(c.validation, 'radii');
    expect(r).toEqual([
      expect.objectContaining({ severity: 'warning', ids: ['e_left'], path: '/edges/1/radii_mm', message: 'Edge e_left has 50 radii for 51 points, so it was removed.' }),
      expect.objectContaining({ severity: 'warning', ids: ['e_right', 'plaque_r'], path: '/edges/2/radii_mm/20', message: 'Edge e_right has a radius of 0 mm at point 20, so it was removed with risk zone plaque_r.' }),
    ]);
    expect(c.edges.map((e) => e.id)).toEqual(['e_aorta']);
    expect(c.riskZones).toEqual([]);
    // Knock-on: both targets lost their edges.
    expect(c.targets.every((t) => !t.reachable)).toBe(true);
  });

  it('mesh_budget: offers decimation; accepting it simplifies under the budget', async () => {
    const c = loaded(await load('mesh_budget'));
    const [w] = of(c.validation, 'mesh_budget');
    expect(c.mesh.triangles).toBeGreaterThan(MESH_TRIANGLE_BUDGET);
    expect(w).toMatchObject({ severity: 'warning', fix: { kind: 'decimate', targetTriangles: MESH_TRIANGLE_BUDGET } });
    expect(w!.message).toBe('The mesh has 107,520 triangles, over the 100,000 budget. Simplify it?');
    const fixed = loaded(await load('mesh_budget', { fixes: [w!.fix!] }));
    expect(fixed.validation).toEqual([]);
    expect(fixed.mesh.triangles).toBeLessThanOrEqual(MESH_TRIANGLE_BUDGET);
    expect(fixed.mesh.triangles).toBeGreaterThan(MESH_TRIANGLE_BUDGET / 2);
  });

  it('privacy: strips patient fields silently and logs one notice with field names only', async () => {
    const r = await load('privacy');
    const c = loaded(r);
    expect(c.origin).toBe('imported');
    expect(c.validation).toHaveLength(1);
    const [n] = c.validation;
    expect(n).toMatchObject({ check: 'privacy', severity: 'notice' });
    expect(n!.ids).toEqual(['case.json/birth_date', 'case.json/patient_name', 'case.json/study_date', 'centerlines.json/institution', 'vessels.glb/asset/extras/patient_id']);
    expect(n!.message).not.toMatch(/PLACEHOLDER|19000101/);
    expect(JSON.stringify(c)).not.toMatch(/PLACEHOLDER|19000101/);
    const glb = parseGlb(new Uint8Array(c.mesh.glb));
    expect(glb.json['asset'].extras).toEqual({ units: 'mm', axes: 'RAS' });
    expect(new TextDecoder().decode(new Uint8Array(c.mesh.glb))).not.toMatch(/PLACEHOLDER/);
  });

  it('physics: a parametric case claiming a phantom is planning only', async () => {
    const c = loaded(await load('physics'));
    expect(c.validation).toEqual([
      { check: 'physics', severity: 'warning', message: 'Planning only: the case asks for physics, but it is not a CathSim phantom.', path: '/physics/available' },
    ]);
    expect(c.planningOnly).toBe(true);
    expect(c.physics).toEqual({ available: false });
  });
});

describe('decimateGlb', () => {
  it('keeps one node per vessel, by name, and is deterministic', () => {
    const glb = new Uint8Array(readFileSync(join(DIR, 'mesh_budget/vessels.glb')));
    const a = decimateGlb(glb, 20_000);
    const b = decimateGlb(glb, 20_000);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    const meshes = readTriMeshes(parseGlb(a));
    expect(meshes.map((m) => m.name)).toEqual(['aorta', 'branch_l', 'branch_r']);
    const tris = meshes.reduce((s, m) => s + m.indices.length / 3, 0);
    expect(tris).toBeLessThanOrEqual(20_000);
    expect(tris).toBeGreaterThan(5_000);
  });

  it('returns the input unchanged when it is already under the target', () => {
    const glb = new Uint8Array(readFileSync(join(DIR, 'physics/vessels.glb')));
    expect(decimateGlb(glb, 100_000)).toBe(glb);
  });
});
