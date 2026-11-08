/**
 * The staged vascular asset (assets/vascular/, BodyParts3D 4.3 via OrganUI Vessels, CC BY-SA 2.1 JP)
 * fits ThreadSim's mesh conventions, read with David's own GLB reader (client/src/case/glb.ts):
 * mm and RAS in asset.extras, one node per vessel named by id, ids valid for case.json, kinds in the
 * case schema's enum, no extensions or transforms, under the mesh budget, with attribution in
 * asset.copyright, and metadata that matches the file. It also checks orientation and scale against
 * anatomy: right-side vessels at +x, the femoral arteries anterior to the internal iliacs, the neck
 * above the pelvis, and an ascending aorta 20–40 mm across.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { countTriangles, parseGlb, readTriMeshes, stripExtras } from '../../client/src/case/glb';
import { MESH_TRIANGLE_BUDGET } from '../../client/src/contracts';
import { readJson, REPO } from './engine.testutil';

const DIR = join(REPO, 'assets/vascular');
const bytes = new Uint8Array(readFileSync(join(DIR, 'bodyparts3d-aortic.glb')));

interface Meta {
  file: string;
  sha256: string;
  units: string;
  axes: string;
  triangles: number;
  license: string;
  attribution: string;
  vessels: { id: string; name: string; kind: string; side: 'right' | 'left' | 'midline' | 'both'; triangles: number; boundsMm: { min: number[]; max: number[] } }[];
  source: { license: string; adaptedBy: { commit: string; sha256: string } };
}
const meta = readJson<Meta>(DIR, 'bodyparts3d-aortic.json');

describe('staged vascular asset (assets/vascular)', () => {
  const glb = parseGlb(bytes);
  const meshes = readTriMeshes(glb);
  const byId = new Map(meshes.map((m) => [m.name, m]));
  const bounds = (id: string): { min: number[]; max: number[]; mid: number[] } => {
    const p = byId.get(id)!.positions;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) (min[k] = Math.min(min[k]!, p[i + k]!)), (max[k] = Math.max(max[k]!, p[i + k]!));
    return { min, max, mid: min.map((v, k) => (v + max[k]!) / 2) };
  };

  it('metadata matches the file', () => {
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(meta.sha256);
    expect(meta.file).toBe('bodyparts3d-aortic.glb');
    expect(meta.units).toBe('mm');
    expect(meta.axes).toBe('RAS');
    expect(meta.triangles).toBe(countTriangles(glb.json));
    expect(meta.vessels.map((v) => v.id)).toEqual(meshes.map((m) => m.name));
    for (const v of meta.vessels) expect(v.triangles).toBe(byId.get(v.id)!.indices.length / 3);
  });

  it('follows the case GLB conventions: mm RAS extras, no extensions, no transforms, under budget', () => {
    expect(glb.json.asset.extras).toEqual({ units: 'mm', axes: 'RAS' });
    expect(glb.json.extensionsRequired ?? []).toEqual([]);
    expect(glb.json.extensionsUsed ?? []).toEqual([]);
    expect(stripExtras(structuredClone(glb.json))).toEqual([]); // the privacy check would remove nothing
    for (const m of meshes) expect(m.transform).toEqual({});
    expect(countTriangles(glb.json)).toBeLessThanOrEqual(MESH_TRIANGLE_BUDGET);
  });

  it('ids and kinds are valid for case.json; names are unique', () => {
    expect(new Set(meshes.map((m) => m.name)).size).toBe(meshes.length);
    for (const v of meta.vessels) {
      expect(v.id).toMatch(/^[A-Za-z0-9_.-]+$/);
      expect(['artery', 'vein']).toContain(v.kind);
      expect(v.name.length).toBeGreaterThan(0);
    }
  });

  it('carries the CC BY-SA 2.1 JP attribution in the file and the metadata', () => {
    expect(glb.json.asset.copyright).toContain('Database Center for Life Science');
    expect(glb.json.asset.copyright).toContain('CC BY-SA 2.1 Japan');
    expect(meta.source.license).toBe('CC-BY-SA-2.1-JP');
    expect(meta.license).toContain('CC-BY-SA-2.1-JP');
    expect(meta.attribution).toContain('BodyParts3D');
  });

  it('is oriented RAS: right-side vessels at +x, left at -x', () => {
    for (const v of meta.vessels) {
      if (v.side === 'right') expect(bounds(v.id).mid[0]!, v.id).toBeGreaterThan(0);
      if (v.side === 'left') expect(bounds(v.id).mid[0]!, v.id).toBeLessThan(0);
    }
    expect(bounds('inferior_vena_cava').mid[0]!).toBeGreaterThan(bounds('abdominal_aorta').mid[0]!); // IVC right of the aorta
  });

  it('is oriented RAS: anterior is +y and superior is +z', () => {
    expect(bounds('r_femoral_arteries').max[1]!).toBeGreaterThan(bounds('r_internal_iliac_arteries').min[1]! + 50); // femoral in front of the internal iliac
    expect(bounds('superior_mesenteric_artery').max[1]!).toBeGreaterThan(bounds('abdominal_aorta').max[1]!); // SMA in front of the aorta
    expect(bounds('r_carotid_arteries').min[2]!).toBeGreaterThan(bounds('abdominal_aorta').max[2]!); // neck above the abdomen
    expect(bounds('aortic_arch').max[2]!).toBeGreaterThan(bounds('thoracic_aorta').max[2]! - 1);
  });

  it('is in millimetres: the ascending aorta is 20–40 mm across and the body about 1.1 m tall here', () => {
    const asc = bounds('ascending_aorta');
    const across = Math.min(asc.max[0]! - asc.min[0]!, asc.max[1]! - asc.min[1]!);
    expect(across).toBeGreaterThan(20);
    expect(across).toBeLessThan(40);
    const all = meshes.flatMap((m) => [bounds(m.name).min[2]!, bounds(m.name).max[2]!]);
    const span = Math.max(...all) - Math.min(...all);
    expect(span).toBeGreaterThan(800); // femoral to carotid
    expect(span).toBeLessThan(1500);
  });
});
