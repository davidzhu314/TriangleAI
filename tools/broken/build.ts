/**
 * One broken package per §3.5 rule, written to tests/fixtures/broken/<rule>/. Each is fixture-y
 * with one thing wrong, so each produces exactly the message its rule owns.
 * Regenerate with `pnpm fixtures`.
 */
import type { CaseJson, CenterlineEdge, CenterlinesJson } from '../../client/src/contracts/case';
import type { Vec3 } from '../../client/src/contracts/events';
import type { ValidationCheckId } from '../../client/src/contracts/validation';
import { buildFixtureY } from '../fixture-y/build';
import { writeGlb, type GlbMesh } from '../lib/glb';
import { roundTo, stableStringify } from '../lib/stable-json';
import { appendTube, type TubeGeometry } from '../lib/tube';
import { writeZip } from '../lib/zip';

/** Over-budget fixture: each 1 mm centerline step becomes this many tube rings. */
const DENSIFY = 16;

function meshes(c: CaseJson, edges: CenterlineEdge[], densify = 1): GlbMesh[] {
  return c.vessels.map((v) => {
    const g: TubeGeometry = { positions: [], normals: [], indices: [] };
    for (const e of edges.filter((x) => x.vessel === v.id)) {
      const pts: Vec3[] = [];
      const radii: number[] = [];
      e.points.forEach((p, i) => {
        if (i === 0) {
          pts.push(p);
          radii.push(e.radii_mm[0]!);
          return;
        }
        const a = e.points[i - 1]!;
        for (let k = 1; k <= densify; k++) {
          const t = k / densify;
          pts.push([a[0] + (p[0] - a[0]) * t, a[1] + (p[1] - a[1]) * t, a[2] + (p[2] - a[2]) * t]);
          radii.push(e.radii_mm[i]!);
        }
      });
      appendTube(g, pts, radii);
    }
    return { name: v.id, positions: Float32Array.from(g.positions), normals: Float32Array.from(g.normals), indices: Uint32Array.from(g.indices) };
  });
}

const mapPoints = (cl: CenterlinesJson, f: (p: Vec3) => Vec3) => {
  for (const n of cl.nodes) n.pos = f(n.pos);
  for (const e of cl.edges) e.points = e.points.map(f);
};

interface Broken {
  rule: ValidationCheckId;
  caseJson: unknown;
  centerlines: CenterlinesJson;
  glb: Uint8Array;
  /** Ship as case.zip (inside one folder, as zipping a folder does) instead of a folder. */
  zip?: boolean;
}

function base() {
  const y = buildFixtureY();
  const caseJson = structuredClone(y.caseJson);
  const centerlines = structuredClone(y.centerlines);
  return { caseJson, centerlines, glb: () => writeGlb(meshes(caseJson, centerlines.edges), { units: 'mm', axes: 'RAS' }) };
}

export function buildBroken(): Broken[] {
  const out: Broken[] = [];

  {
    // schema: a missing field and a wrong type.
    const b = base();
    const c = b.caseJson as unknown as Record<string, unknown>;
    delete c['title'];
    (b.caseJson.entries[0] as unknown as Record<string, unknown>)['node'] = 7;
    out.push({ rule: 'schema', caseJson: c, centerlines: b.centerlines, glb: b.glb() });
  }
  {
    // units: exported in metres (every length ÷1000).
    const b = base();
    const m = (x: number) => roundTo(x / 1000, 7);
    mapPoints(b.centerlines, (p) => [m(p[0]), m(p[1]), m(p[2])]);
    for (const e of b.centerlines.edges) e.radii_mm = e.radii_mm.map(m);
    for (const z of b.caseJson.riskZones) {
      z.from_mm = m(z.from_mm);
      z.to_mm = m(z.to_mm);
    }
    out.push({ rule: 'units', caseJson: b.caseJson, centerlines: b.centerlines, glb: b.glb() });
  }
  {
    // axes: head–foot axis flipped, so the targets sit below the entry.
    const b = base();
    mapPoints(b.centerlines, (p) => [p[0], p[1], p[2] === 0 ? 0 : -p[2]]);
    out.push({ rule: 'axes', caseJson: b.caseJson, centerlines: b.centerlines, glb: b.glb() });
  }
  {
    // graph: a zero-length edge, and a target on an island no entry reaches.
    const b = base();
    const island: Vec3 = [40, 0, 40];
    const islandEnd: Vec3 = [40, 0, 50];
    b.centerlines.nodes.push(
      { id: 'n_island_a', pos: island, kind: 'end' },
      { id: 'n_island', pos: islandEnd, kind: 'target' },
      { id: 'n_stub', pos: [0, 0, 100], kind: 'end' },
    );
    const pts: Vec3[] = [];
    for (let i = 0; i <= 10; i++) pts.push([40, 0, 40 + i]);
    b.centerlines.edges.push(
      { id: 'e_island', from: 'n_island_a', to: 'n_island', vessel: 'branch_r', points: pts, radii_mm: pts.map(() => 3) },
      { id: 'e_stub', from: 'n_split', to: 'n_stub', vessel: 'aorta', points: [[0, 0, 100], [0, 0, 100]], radii_mm: [12, 12] },
    );
    b.caseJson.targets.push({ id: 'island', name: 'Island target', node: 'n_island' });
    // Mesh from the good fixture: a zero-length edge has no tube.
    out.push({ rule: 'graph', caseJson: b.caseJson, centerlines: b.centerlines, glb: base().glb() });
  }
  {
    // radii: e_left has one radius too few; e_right has a zero radius (and carries the plaque).
    const b = base();
    const left = b.centerlines.edges.find((e) => e.id === 'e_left')!;
    left.radii_mm = left.radii_mm.slice(1);
    const right = b.centerlines.edges.find((e) => e.id === 'e_right')!;
    right.radii_mm[20] = 0;
    // Mesh from the good fixture: the GLB is not what this package tests.
    out.push({ rule: 'radii', caseJson: b.caseJson, centerlines: b.centerlines, glb: base().glb() });
  }
  {
    // mesh_budget: the same tubes with 16 rings per millimetre, just over 100k triangles.
    const b = base();
    out.push({ rule: 'mesh_budget', caseJson: b.caseJson, centerlines: b.centerlines, glb: writeGlb(meshes(b.caseJson, b.centerlines.edges, DENSIFY), { units: 'mm', axes: 'RAS' }) });
  }
  {
    // privacy: patient fields at the top of case.json and centerlines.json and in the GLB's
    // extras. Placeholder values, not real data. Shipped as case.zip.
    const b = base();
    const c = { ...b.caseJson, patient_name: 'PLACEHOLDER^TEST', birth_date: '19000101', study_date: '19000101' };
    const cl = { ...b.centerlines, institution: 'PLACEHOLDER' } as CenterlinesJson;
    const glb = writeGlb(meshes(b.caseJson, b.centerlines.edges), { units: 'mm', axes: 'RAS', patient_id: 'PLACEHOLDER-0000' });
    out.push({ rule: 'privacy', caseJson: c, centerlines: cl, glb, zip: true });
  }
  {
    // physics: claims phantom3 but is a parametric case.
    const b = base();
    b.caseJson.physics = { available: true, phantom: 'phantom3' };
    out.push({ rule: 'physics', caseJson: b.caseJson, centerlines: b.centerlines, glb: b.glb() });
  }
  return out;
}

/** Relative path under tests/fixtures/broken/ → bytes. */
export function brokenFiles(): Record<string, Uint8Array> {
  const enc = new TextEncoder();
  const files: Record<string, Uint8Array> = {};
  for (const b of buildBroken()) {
    const parts: [string, Uint8Array][] = [
      ['case.json', enc.encode(stableStringify(b.caseJson))],
      ['centerlines.json', enc.encode(stableStringify(b.centerlines))],
      ['vessels.glb', b.glb],
    ];
    if (b.zip) files[`${b.rule}/case.zip`] = writeZip(parts.map(([n, d]) => [`${b.rule}/${n}`, d]));
    else for (const [n, d] of parts) files[`${b.rule}/${n}`] = d;
  }
  return files;
}
