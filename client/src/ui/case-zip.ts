/**
 * "Download case (.zip)" on a Library card: the case package exactly as the app loaded it. An imported case gives
 * back the bytes the trainee dropped; a bundled case is zipped here from its three files (stored, no compression:
 * a few hundred kilobytes, and nothing to depend on). Nothing leaves the browser.
 */
import { CASE_FILES } from '../contracts';
import type { CatalogEntry } from './store';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A store-only zip of the given files. */
export function zipStored(files: readonly (readonly [string, Uint8Array])[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, data] of files) {
    const nameBytes = enc.encode(name);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    const cen = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cen.set(nameBytes, 46);
    parts.push(local, data);
    central.push(cen);
    offset += local.length + data.length;
  }
  const centralSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + 22);
  let at = 0;
  for (const p of [...parts, ...central, end]) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** The case package as a Blob, or null when it can't be had (a physics-served phantom). */
export async function caseZip(e: CatalogEntry): Promise<Blob | null> {
  const src = e.source;
  if (src.kind === 'zip') return src.data instanceof Blob ? src.data : new Blob([src.data as BlobPart], { type: 'application/zip' });
  if (src.kind === 'url' && src.origin === 'bundled') {
    const names = [CASE_FILES.case, CASE_FILES.centerlines, CASE_FILES.mesh];
    const files = await Promise.all(
      names.map(async (n) => {
        const res = await fetch(new URL(n, new URL(src.baseUrl, location.href)).href);
        if (!res.ok) throw new Error(`${n}: ${res.status}`);
        return [n, new Uint8Array(await res.arrayBuffer())] as const;
      }),
    );
    return new Blob([zipStored(files) as BlobPart], { type: 'application/zip' });
  }
  return null;
}

/** Save a Blob under a file name, through a temporary link. */
export function saveAs(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
