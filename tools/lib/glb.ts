/**
 * Minimal, deterministic glTF 2.0 binary (GLB) writer: one node and one mesh per named part,
 * triangles with POSITION, NORMAL and indices. Our own writer (DECISIONS.md), so the same input
 * always gives the same bytes. No external dependency.
 */
import { stableStringify } from './stable-json';

export interface GlbMesh {
  /** Node and mesh name (the vessel id in a case package). */
  name: string;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;
const FLOAT = 5126;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;
const TRIANGLES = 4;

function pad4(n: number): number {
  return (n + 3) & ~3;
}

export function writeGlb(meshes: GlbMesh[], extras: Record<string, unknown> = {}): Uint8Array {
  const chunks: Uint8Array[] = [];
  const bufferViews: object[] = [];
  const accessors: object[] = [];
  let offset = 0;

  const addView = (bytes: Uint8Array, target: number): number => {
    const padded = new Uint8Array(pad4(bytes.byteLength));
    padded.set(bytes);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength, target });
    chunks.push(padded);
    offset += padded.byteLength;
    return bufferViews.length - 1;
  };

  const gltfMeshes = meshes.map((m) => {
    const count = m.positions.length / 3;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < m.positions.length; i++) {
      const v = m.positions[i]!;
      const a = i % 3;
      if (v < min[a]!) min[a] = v;
      if (v > max[a]!) max[a] = v;
    }
    const posView = addView(new Uint8Array(m.positions.buffer, m.positions.byteOffset, m.positions.byteLength), ARRAY_BUFFER);
    accessors.push({ bufferView: posView, componentType: FLOAT, count, type: 'VEC3', min, max });
    const posAcc = accessors.length - 1;

    const nrmView = addView(new Uint8Array(m.normals.buffer, m.normals.byteOffset, m.normals.byteLength), ARRAY_BUFFER);
    accessors.push({ bufferView: nrmView, componentType: FLOAT, count, type: 'VEC3' });
    const nrmAcc = accessors.length - 1;

    const small = count <= 65535;
    const idx = small ? Uint16Array.from(m.indices) : m.indices;
    const idxView = addView(new Uint8Array(idx.buffer, idx.byteOffset, idx.byteLength), ELEMENT_ARRAY_BUFFER);
    accessors.push({ bufferView: idxView, componentType: small ? UNSIGNED_SHORT : UNSIGNED_INT, count: m.indices.length, type: 'SCALAR' });
    const idxAcc = accessors.length - 1;

    return { name: m.name, primitives: [{ attributes: { POSITION: posAcc, NORMAL: nrmAcc }, indices: idxAcc, mode: TRIANGLES }] };
  });

  const json = {
    asset: { version: '2.0', generator: 'threadsim tools/lib/glb.ts', extras },
    scene: 0,
    scenes: [{ nodes: meshes.map((_, i) => i) }],
    nodes: meshes.map((m, i) => ({ name: m.name, mesh: i })),
    meshes: gltfMeshes,
    accessors,
    bufferViews,
    buffers: [{ byteLength: offset }],
  };

  const jsonBytes = new TextEncoder().encode(stableStringify(json, 0).trimEnd());
  const jsonLen = pad4(jsonBytes.byteLength);
  const total = 12 + 8 + jsonLen + 8 + offset;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); // "glTF"
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonLen, true);
  dv.setUint32(16, 0x4e4f534a, true); // "JSON"
  out.set(jsonBytes, 20);
  out.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonLen);
  let p = 20 + jsonLen;
  dv.setUint32(p, offset, true);
  dv.setUint32(p + 4, 0x004e4942, true); // "BIN\0"
  p += 8;
  for (const c of chunks) {
    out.set(c, p);
    p += c.byteLength;
  }
  return out;
}

/** Read back a GLB's JSON chunk (tests and the loader's triangle count). */
export function readGlbJson(glb: Uint8Array): { json: any; bin: Uint8Array } {
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB');
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLen)));
  const binLen = dv.getUint32(20 + jsonLen, true);
  const bin = glb.subarray(28 + jsonLen, 28 + jsonLen + binLen);
  return { json, bin };
}
