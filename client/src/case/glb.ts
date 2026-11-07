/**
 * Just enough glTF 2.0 binary (GLB) for the loader: parse, count triangles, strip metadata,
 * read triangle meshes for decimation, and write them back. No dependency.
 */

const MAGIC_GLTF = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;
const UNSIGNED_BYTE = 5121;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;
const FLOAT = 5126;
const TRIANGLES = 4;

export type GltfJson = Record<string, any>;

export interface Glb {
  json: GltfJson;
  /** The BIN chunk, or null when the file has none. */
  bin: Uint8Array | null;
}

export class GlbError extends Error {}

const pad4 = (n: number) => (n + 3) & ~3;

export function parseGlb(bytes: Uint8Array): Glb {
  if (bytes.byteLength < 20) throw new GlbError('the file is too short');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== MAGIC_GLTF) throw new GlbError('the file does not start with "glTF"');
  if (dv.getUint32(4, true) !== 2) throw new GlbError('only glTF 2.0 is supported');
  const total = dv.getUint32(8, true);
  if (total > bytes.byteLength) throw new GlbError('the file is truncated');
  const jsonLen = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== CHUNK_JSON || 20 + jsonLen > total) throw new GlbError('the JSON chunk is missing');
  let json: GltfJson;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLen)));
  } catch {
    throw new GlbError('the JSON chunk is not valid JSON');
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) throw new GlbError('the JSON chunk is not an object');
  let bin: Uint8Array | null = null;
  const p = 20 + jsonLen;
  if (p + 8 <= total && dv.getUint32(p + 4, true) === CHUNK_BIN) {
    const binLen = dv.getUint32(p, true);
    if (p + 8 + binLen > total) throw new GlbError('the BIN chunk is truncated');
    bin = bytes.subarray(p + 8, p + 8 + binLen);
  }
  return { json, bin };
}

export function encodeGlb({ json, bin }: Glb): Uint8Array {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLen = pad4(jsonBytes.byteLength);
  const binLen = bin ? pad4(bin.byteLength) : 0;
  const total = 20 + jsonLen + (bin ? 8 + binLen : 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, MAGIC_GLTF, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonLen, true);
  dv.setUint32(16, CHUNK_JSON, true);
  out.set(jsonBytes, 20);
  out.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonLen);
  if (bin) {
    const p = 20 + jsonLen;
    dv.setUint32(p, binLen, true);
    dv.setUint32(p + 4, CHUNK_BIN, true);
    out.set(bin, p + 8);
  }
  return out;
}

function arr(json: GltfJson, key: string): any[] {
  const v = json[key];
  return Array.isArray(v) ? v : [];
}

/** Mesh indices drawn by the file: one per node that has a mesh, or every mesh when no node does. */
function drawnMeshes(json: GltfJson): number[] {
  const fromNodes = arr(json, 'nodes').filter((n) => typeof n?.mesh === 'number').map((n) => n.mesh as number);
  return fromNodes.length > 0 ? fromNodes : arr(json, 'meshes').map((_, i) => i);
}

/** Triangles drawn, counting each node instance. Throws GlbError on a broken reference. */
export function countTriangles(json: GltfJson): number {
  const meshes = arr(json, 'meshes');
  const accessors = arr(json, 'accessors');
  let total = 0;
  for (const mi of drawnMeshes(json)) {
    const mesh = meshes[mi];
    if (!mesh) throw new GlbError(`a node points at mesh ${mi}, which does not exist`);
    for (const prim of arr(mesh, 'primitives')) {
      const accIndex = prim.indices ?? prim.attributes?.POSITION;
      const acc = accessors[accIndex];
      if (!acc || typeof acc.count !== 'number') throw new GlbError(`mesh ${mi} points at a missing accessor`);
      const mode = prim.mode ?? TRIANGLES;
      if (mode === TRIANGLES) total += Math.floor(acc.count / 3);
      else if (mode === 5 || mode === 6) total += Math.max(0, acc.count - 2);
    }
  }
  return total;
}

/** Keys we write ourselves in asset.extras (tools/lib/glb.ts); everything else in `extras` is stripped. */
const KEPT_ASSET_EXTRAS = new Set(['units', 'axes']);

/**
 * Remove every `extras` object (glTF's free-form metadata, where exporters put patient and study
 * fields), keeping only our own asset.extras.units and .axes. Returns the JSON paths removed.
 */
export function stripExtras(json: GltfJson): string[] {
  const removed: string[] = [];
  const walk = (v: any, path: string) => {
    if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${path}/${i}`));
      return;
    }
    if (typeof v !== 'object' || v === null) return;
    for (const key of Object.keys(v)) {
      if (key === 'extras') {
        if (path === '/asset' && typeof v.extras === 'object' && v.extras !== null) {
          for (const k of Object.keys(v.extras)) {
            if (!KEPT_ASSET_EXTRAS.has(k)) {
              delete v.extras[k];
              removed.push(`/asset/extras/${k}`);
            }
          }
        } else {
          delete v[key];
          removed.push(`${path}/extras`);
        }
      } else {
        walk(v[key], `${path}/${key}`);
      }
    }
  };
  walk(json, '');
  return removed;
}

// ---------------------------------------------------------------- triangle meshes

export interface TriMesh {
  /** Node name (the vessel id). */
  name: string;
  /** The node's own transform, copied through unchanged. */
  transform: Partial<Record<'matrix' | 'translation' | 'rotation' | 'scale', number[]>>;
  positions: Float32Array;
  indices: Uint32Array;
}

function accessorView(glb: Glb, index: number): { bytes: Uint8Array; acc: any; stride: number } {
  const acc = arr(glb.json, 'accessors')[index];
  if (!acc) throw new GlbError(`missing accessor ${index}`);
  if (acc.sparse) throw new GlbError('sparse accessors are not supported');
  const view = arr(glb.json, 'bufferViews')[acc.bufferView];
  if (!view || (view.buffer ?? 0) !== 0 || !glb.bin) throw new GlbError('accessor data is not in the GLB binary chunk');
  const start = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const bytes = glb.bin.subarray(start, (view.byteOffset ?? 0) + view.byteLength);
  return { bytes, acc, stride: view.byteStride ?? 0 };
}

function readPositions(glb: Glb, index: number): Float32Array {
  const { bytes, acc, stride } = accessorView(glb, index);
  if (acc.componentType !== FLOAT || acc.type !== 'VEC3') throw new GlbError('POSITION must be float VEC3');
  const step = stride || 12;
  if ((acc.count - 1) * step + 12 > bytes.byteLength) throw new GlbError('POSITION runs past its buffer view');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(acc.count * 3);
  for (let i = 0; i < acc.count; i++) {
    for (let k = 0; k < 3; k++) out[i * 3 + k] = dv.getFloat32(i * step + k * 4, true);
  }
  return out;
}

function readIndices(glb: Glb, index: number): Uint32Array {
  const { bytes, acc } = accessorView(glb, index);
  const size = acc.componentType === UNSIGNED_BYTE ? 1 : acc.componentType === UNSIGNED_SHORT ? 2 : acc.componentType === UNSIGNED_INT ? 4 : 0;
  if (!size || acc.type !== 'SCALAR') throw new GlbError('indices must be unsigned SCALAR');
  if (acc.count * size > bytes.byteLength) throw new GlbError('indices run past their buffer view');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Uint32Array(acc.count);
  for (let i = 0; i < acc.count; i++) {
    out[i] = size === 1 ? dv.getUint8(i) : size === 2 ? dv.getUint16(i * 2, true) : dv.getUint32(i * 4, true);
  }
  return out;
}

/** One TriMesh per node with a mesh; the node's triangle primitives are merged. */
export function readTriMeshes(glb: Glb): TriMesh[] {
  if ((arr(glb.json, 'extensionsRequired')).length > 0) {
    throw new GlbError(`compressed or extended meshes (${arr(glb.json, 'extensionsRequired').join(', ')}) cannot be decimated`);
  }
  const meshes = arr(glb.json, 'meshes');
  return arr(glb.json, 'nodes')
    .filter((n) => typeof n?.mesh === 'number')
    .map((node, ni) => {
      const mesh = meshes[node.mesh];
      if (!mesh) throw new GlbError(`a node points at mesh ${node.mesh}, which does not exist`);
      const pos: number[] = [];
      const idx: number[] = [];
      for (const prim of arr(mesh, 'primitives')) {
        if ((prim.mode ?? TRIANGLES) !== TRIANGLES) throw new GlbError('only triangle lists can be decimated');
        const p = readPositions(glb, prim.attributes?.POSITION);
        const base = pos.length / 3;
        for (const v of p) pos.push(v);
        const ind = prim.indices === undefined ? Uint32Array.from({ length: p.length / 3 }, (_, i) => i) : readIndices(glb, prim.indices);
        for (const i of ind) {
          if (i >= p.length / 3) throw new GlbError('an index points past the vertex list');
          idx.push(base + i);
        }
      }
      const transform: TriMesh['transform'] = {};
      for (const k of ['matrix', 'translation', 'rotation', 'scale'] as const) {
        if (Array.isArray(node[k])) transform[k] = [...node[k]];
      }
      return {
        name: typeof node.name === 'string' ? node.name : `node_${ni}`,
        transform,
        positions: Float32Array.from(pos),
        indices: Uint32Array.from(idx),
      };
    });
}

/** Area-weighted vertex normals. */
export function vertexNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const n = new Float32Array(positions.length);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t]! * 3, b = indices[t + 1]! * 3, c = indices[t + 2]! * 3;
    const ux = positions[b]! - positions[a]!, uy = positions[b + 1]! - positions[a + 1]!, uz = positions[b + 2]! - positions[a + 2]!;
    const vx = positions[c]! - positions[a]!, vy = positions[c + 1]! - positions[a + 1]!, vz = positions[c + 2]! - positions[a + 2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) {
      n[i] = n[i]! + nx;
      n[i + 1] = n[i + 1]! + ny;
      n[i + 2] = n[i + 2]! + nz;
    }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i]!, n[i + 1]!, n[i + 2]!) || 1;
    n[i] = n[i]! / l;
    n[i + 1] = n[i + 1]! / l;
    n[i + 2] = n[i + 2]! / l;
  }
  return n;
}

/** Write TriMeshes as a GLB: one node and one mesh per TriMesh, POSITION, NORMAL, uint32 indices. */
export function writeTriMeshes(meshes: TriMesh[], asset: GltfJson): Uint8Array {
  const parts: Uint8Array[] = [];
  const bufferViews: object[] = [];
  const accessors: object[] = [];
  let offset = 0;
  const addView = (data: Float32Array | Uint32Array, target: number) => {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength, target });
    parts.push(bytes);
    offset += pad4(bytes.byteLength);
    return bufferViews.length - 1;
  };
  const gltfMeshes = meshes.map((m) => {
    const count = m.positions.length / 3;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < m.positions.length; i++) {
      const a = i % 3;
      min[a] = Math.min(min[a]!, m.positions[i]!);
      max[a] = Math.max(max[a]!, m.positions[i]!);
    }
    accessors.push({ bufferView: addView(m.positions, ARRAY_BUFFER), componentType: FLOAT, count, type: 'VEC3', min, max });
    const posAcc = accessors.length - 1;
    accessors.push({ bufferView: addView(vertexNormals(m.positions, m.indices), ARRAY_BUFFER), componentType: FLOAT, count, type: 'VEC3' });
    const nrmAcc = accessors.length - 1;
    accessors.push({ bufferView: addView(m.indices, ELEMENT_ARRAY_BUFFER), componentType: UNSIGNED_INT, count: m.indices.length, type: 'SCALAR' });
    return { name: m.name, primitives: [{ attributes: { POSITION: posAcc, NORMAL: nrmAcc }, indices: accessors.length - 1, mode: TRIANGLES }] };
  });
  const bin = new Uint8Array(offset);
  let p = 0;
  for (const part of parts) {
    bin.set(part, p);
    p += pad4(part.byteLength);
  }
  const json: GltfJson = {
    asset: { ...asset, version: '2.0' },
    scene: 0,
    scenes: [{ nodes: meshes.map((_, i) => i) }],
    nodes: meshes.map((m, i) => ({ name: m.name, mesh: i, ...m.transform })),
    meshes: gltfMeshes,
    accessors,
    bufferViews,
    buffers: [{ byteLength: offset }],
  };
  return encodeGlb({ json, bin });
}
