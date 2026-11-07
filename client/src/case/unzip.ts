/**
 * Read a case.zip in the browser. Stored and deflate entries; deflate goes through the platform's
 * DecompressionStream("deflate-raw"), so there is no dependency. No ZIP64, no encryption.
 * CRC-32 and sizes are checked, and declared sizes are capped before anything is inflated.
 */

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/** Largest uncompressed entry we inflate (a case is a few MB; this guards against zip bombs). */
export const MAX_ENTRY_BYTES = 256 * 1024 * 1024;

export class ZipError extends Error {}

export interface ZipEntry {
  name: string;
  method: number;
  crc: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

export interface ZipArchive {
  entries: ZipEntry[];
  read(entry: ZipEntry): Promise<Uint8Array>;
}

let crcTable: Uint32Array | null = null;
export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function inflateRaw(data: Uint8Array, limit: number): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new ZipError('an entry inflates past its declared size');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.byteLength;
  }
  return out;
}

export function openZip(bytes: Uint8Array): ZipArchive {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.byteLength - 22; i >= Math.max(0, bytes.byteLength - 22 - 0xffff); i--) {
    if (dv.getUint32(i, true) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError('not a zip file');
  const count = dv.getUint16(eocd + 10, true);
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || cdOffset === 0xffffffff) throw new ZipError('ZIP64 archives are not supported');
  if (cdOffset + cdSize > bytes.byteLength) throw new ZipError('the zip directory is truncated');

  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.byteLength || dv.getUint32(p, true) !== CENTRAL) throw new ZipError('the zip directory is damaged');
    const flags = dv.getUint16(p + 8, true);
    if (flags & 1) throw new ZipError('encrypted zip files are not supported');
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    entries.push({
      name: decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen)),
      method: dv.getUint16(p + 10, true),
      crc: dv.getUint32(p + 16, true),
      compressedSize: dv.getUint32(p + 20, true),
      size: dv.getUint32(p + 24, true),
      localOffset: dv.getUint32(p + 42, true),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }

  return {
    entries,
    async read(entry) {
      const o = entry.localOffset;
      if (o + 30 > bytes.byteLength || dv.getUint32(o, true) !== LOCAL) throw new ZipError(`${entry.name}: damaged entry`);
      const start = o + 30 + dv.getUint16(o + 26, true) + dv.getUint16(o + 28, true);
      if (start + entry.compressedSize > bytes.byteLength) throw new ZipError(`${entry.name}: truncated entry`);
      if (entry.size > MAX_ENTRY_BYTES) throw new ZipError(`${entry.name}: too large`);
      const raw = bytes.subarray(start, start + entry.compressedSize);
      let out: Uint8Array;
      if (entry.method === 0) out = raw.slice();
      else if (entry.method === 8) out = await inflateRaw(raw, entry.size);
      else throw new ZipError(`${entry.name}: compression method ${entry.method} is not supported`);
      if (out.byteLength !== entry.size) throw new ZipError(`${entry.name}: size does not match the directory`);
      if (crc32(out) !== entry.crc) throw new ZipError(`${entry.name}: checksum mismatch`);
      return out;
    },
  };
}
