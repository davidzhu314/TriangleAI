// Builds tests/e2e/fixtures/context-ts-s1404-cta.glb: a stand-in for David's context.glb export (bone and heart from
// the same scan), so the Body layer can be tested before the real files land. It is NOT anatomy: a spine-like tube
// with a few rib arcs and a sternum bar ("bone"), and an ellipsoid ("heart"), placed in the ts-s1404-cta case's frame
// (RAS millimetres) around its aorta. Like the real export: nodes named "bone" and "heart", no extras, no transforms,
// asset.extras = { units: 'mm', axes: 'RAS' }.
//
// With --veins it writes tests/e2e/fixtures/context-veins.glb instead: the same bone and heart plus two vein nodes,
// "vein_ivc" and "vein_svc", tagged the way David's export tags them (extras { kind: "vein", label }). Two tubes to
// the right of the aorta, not anatomy.
// Usage: node tests/e2e/fixtures/make-context-fixture.mjs <repo> [--veins]
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const withVeins = args.includes('--veins');
const repo = resolve(args.find((a) => !a.startsWith('--')) ?? '.');
const require = createRequire(join(repo, 'package.json'));
const mod = await import(pathToFileURL(require.resolve('three')).href);
const THREE = mod.Vector3 ? mod : mod.default;
const { mergeGeometries } = await import(pathToFileURL(join(repo, 'node_modules/three/examples/jsm/utils/BufferGeometryUtils.js')).href);

// ts-s1404-cta's aorta: x −25…14, y 104…174, z −330…1 (mm, RAS: +x right, +y anterior, +z superior).
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const tube = (pts, r, seg = 40) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 10, false);

const bone = [tube([V(-5, 95, -360), V(-5, 92, -150), V(-5, 98, 40)], 14)]; // spine, behind the aorta
for (const z of [-40, -90, -140]) {
  // a rib arc each side, from the spine round to the front
  bone.push(tube([V(-5, 95, z), V(-90, 140, z - 10), V(-60, 230, z - 25)], 4, 24));
  bone.push(tube([V(-5, 95, z), V(80, 140, z - 10), V(50, 230, z - 25)], 4, 24));
}
bone.push(tube([V(-5, 240, -10), V(-5, 245, -160)], 8, 12)); // sternum
const heart = new THREE.SphereGeometry(1, 24, 16).scale(55, 45, 50).translate(-25, 190, -60);

const nodesIn = [
  ['bone', mergeGeometries(bone)],
  ['heart', heart],
];
if (withVeins) {
  // Below and above the heart, right of the aorta (+x is the patient's right).
  nodesIn.push(['vein_ivc', tube([V(30, 120, -330), V(28, 130, -200), V(20, 160, -110)], 12), { kind: 'vein', label: 'Inferior vena cava' }]);
  nodesIn.push(['vein_svc', tube([V(25, 150, 10), V(22, 165, -40), V(18, 175, -20)], 9, 20), { kind: 'vein', label: 'Superior vena cava' }]);
}

const chunks = [];
let byteOffset = 0;
const bufferViews = [];
const accessors = [];
const meshes = [];
const nodes = [];
const push = (typed, target) => {
  const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
  const pad = (4 - (bytes.length % 4)) % 4;
  bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.length, target });
  chunks.push(bytes, new Uint8Array(pad));
  byteOffset += bytes.length + pad;
  return bufferViews.length - 1;
};
for (const [name, geom, extras] of nodesIn) {
  geom.computeVertexNormals();
  geom.computeBoundingBox();
  const pos = new Float32Array(geom.attributes.position.array);
  const nor = new Float32Array(geom.attributes.normal.array);
  const idx = new Uint32Array(geom.index.array);
  accessors.push({ bufferView: push(pos, 34962), componentType: 5126, count: pos.length / 3, type: 'VEC3', min: geom.boundingBox.min.toArray(), max: geom.boundingBox.max.toArray() });
  const pa = accessors.length - 1;
  accessors.push({ bufferView: push(nor, 34962), componentType: 5126, count: nor.length / 3, type: 'VEC3' });
  const na = accessors.length - 1;
  accessors.push({ bufferView: push(idx, 34963), componentType: 5125, count: idx.length, type: 'SCALAR' });
  const ia = accessors.length - 1;
  meshes.push({ name, primitives: [{ attributes: { POSITION: pa, NORMAL: na }, indices: ia, mode: 4 }] });
  nodes.push(extras ? { name, mesh: meshes.length - 1, extras } : { name, mesh: meshes.length - 1 });
}
const bin = new Uint8Array(byteOffset);
let at = 0;
for (const c of chunks) {
  bin.set(c, at);
  at += c.length;
}
const json = {
  asset: { version: '2.0', generator: 'ThreadSim test fixture: stand-in body context (not anatomy)', extras: { units: 'mm', axes: 'RAS' } },
  scene: 0,
  scenes: [{ nodes: nodes.map((_, i) => i) }],
  nodes,
  meshes,
  accessors,
  bufferViews,
  buffers: [{ byteLength: bin.length }],
};
const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
const jsonChunk = new Uint8Array(jsonBytes.length + jsonPad).fill(0x20);
jsonChunk.set(jsonBytes);
const total = 12 + 8 + jsonChunk.length + 8 + bin.length;
const glb = new Uint8Array(total);
const dv = new DataView(glb.buffer);
dv.setUint32(0, 0x46546c67, true);
dv.setUint32(4, 2, true);
dv.setUint32(8, total, true);
dv.setUint32(12, jsonChunk.length, true);
dv.setUint32(16, 0x4e4f534a, true);
glb.set(jsonChunk, 20);
dv.setUint32(20 + jsonChunk.length, bin.length, true);
dv.setUint32(24 + jsonChunk.length, 0x004e4942, true);
glb.set(bin, 28 + jsonChunk.length);
const out = join(repo, withVeins ? 'tests/e2e/fixtures/context-veins.glb' : 'tests/e2e/fixtures/context-ts-s1404-cta.glb');
writeFileSync(out, glb);
console.log(`wrote ${out}: ${(total / 1024).toFixed(1)} KB`);
