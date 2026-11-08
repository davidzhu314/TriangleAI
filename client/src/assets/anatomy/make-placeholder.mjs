// Builds the placeholder vascular GLB for the anatomy layer (feature/vascular-ui) until David's anatomical GLB
// lands. Simple tubes, metres, Y-up, centred near the origin. Every mesh node is named and tagged:
//   extras.kind  = 'artery' | 'vein'   (how the layer sorts them)
//   extras.label = display name        (the label the layer shows)
//   extras.placeholder = true
// Usage: node make-placeholder-glb.mjs <repo> <out.glb>
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';

const [repo, out] = process.argv.slice(2);
const require = createRequire(repo + '/package.json');
const mod = await import(pathToFileURL(require.resolve('three')).href);
const THREE = mod.Vector3 ? mod : mod.default;

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const vessels = [
  // Arteries: the arch and its branches, the descending aorta.
  ['artery_aorta_arch', 'artery', 'Aortic arch', [V(0.02, -0.04, 0.01), V(0.02, 0.02, 0.0), V(0.0, 0.05, -0.01), V(-0.03, 0.045, -0.015), V(-0.04, 0.0, -0.02), V(-0.04, -0.2, -0.02)], 0.012],
  ['artery_brachiocephalic', 'artery', 'Brachiocephalic trunk', [V(0.012, 0.045, -0.005), V(0.025, 0.08, -0.005), V(0.03, 0.1, -0.005)], 0.006],
  ['artery_right_carotid', 'artery', 'Right common carotid', [V(0.03, 0.1, -0.005), V(0.032, 0.2, -0.01)], 0.0035],
  ['artery_right_subclavian', 'artery', 'Right subclavian', [V(0.03, 0.1, -0.005), V(0.07, 0.11, -0.01), V(0.12, 0.1, -0.02)], 0.004],
  ['artery_left_carotid', 'artery', 'Left common carotid', [V(-0.008, 0.05, -0.012), V(-0.012, 0.12, -0.012), V(-0.015, 0.2, -0.015)], 0.0035],
  ['artery_left_subclavian', 'artery', 'Left subclavian', [V(-0.025, 0.047, -0.015), V(-0.05, 0.1, -0.02), V(-0.12, 0.1, -0.025)], 0.004],
  // Veins: the venae cavae and the brachiocephalic veins, in front of and to the right of the arch.
  ['vein_svc', 'vein', 'Superior vena cava', [V(0.045, -0.03, 0.02), V(0.045, 0.06, 0.02)], 0.009],
  ['vein_right_brachiocephalic', 'vein', 'Right brachiocephalic vein', [V(0.045, 0.06, 0.02), V(0.06, 0.1, 0.015), V(0.11, 0.115, 0.0)], 0.006],
  ['vein_left_brachiocephalic', 'vein', 'Left brachiocephalic vein', [V(0.045, 0.06, 0.02), V(0.0, 0.085, 0.025), V(-0.06, 0.1, 0.01), V(-0.11, 0.11, 0.0)], 0.005],
  ['vein_ivc', 'vein', 'Inferior vena cava', [V(0.04, -0.2, 0.0), V(0.045, -0.06, 0.015), V(0.045, -0.03, 0.02)], 0.01],
];

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

for (const [name, kind, label, pts, radius] of vessels) {
  const geom = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, radius, 12, false);
  const pos = new Float32Array(geom.attributes.position.array);
  const nor = new Float32Array(geom.attributes.normal.array);
  const idx = new Uint16Array(geom.index.array);
  geom.computeBoundingBox();
  const bb = geom.boundingBox;
  const pv = push(pos, 34962);
  const nv = push(nor, 34962);
  const iv = push(idx, 34963);
  accessors.push({ bufferView: pv, componentType: 5126, count: pos.length / 3, type: 'VEC3', min: bb.min.toArray(), max: bb.max.toArray() });
  const pa = accessors.length - 1;
  accessors.push({ bufferView: nv, componentType: 5126, count: nor.length / 3, type: 'VEC3' });
  const na = accessors.length - 1;
  accessors.push({ bufferView: iv, componentType: 5123, count: idx.length, type: 'SCALAR' });
  const ia = accessors.length - 1;
  meshes.push({ name, primitives: [{ attributes: { POSITION: pa, NORMAL: na }, indices: ia, mode: 4 }] });
  nodes.push({ name, mesh: meshes.length - 1, extras: { kind, label, placeholder: true } });
}

const bin = new Uint8Array(byteOffset);
let at = 0;
for (const c of chunks) {
  bin.set(c, at);
  at += c.length;
}
const json = {
  asset: { version: '2.0', generator: 'ThreadSim placeholder vascular model (Aroovee); not anatomy, for UI work only' },
  scene: 0,
  scenes: [{ name: 'placeholder-vascular', nodes: nodes.map((_, i) => i), extras: { placeholder: true, units: 'm', up: 'Y' } }],
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
dv.setUint32(0, 0x46546c67, true); // 'glTF'
dv.setUint32(4, 2, true);
dv.setUint32(8, total, true);
dv.setUint32(12, jsonChunk.length, true);
dv.setUint32(16, 0x4e4f534a, true); // 'JSON'
glb.set(jsonChunk, 20);
const binAt = 20 + jsonChunk.length;
dv.setUint32(binAt, bin.length, true);
dv.setUint32(binAt + 4, 0x004e4942, true); // 'BIN\0'
glb.set(bin, binAt + 8);
writeFileSync(out, glb);
console.log(`wrote ${out}: ${(total / 1024).toFixed(1)} KB, ${nodes.length} vessels`);
