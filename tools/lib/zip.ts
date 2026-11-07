/**
 * Deterministic zip writer: stored entries (no compression) by default, names in the order given,
 * every timestamp 1980-01-01 00:00, no extra fields. Same input, same bytes. Used for case.zip
 * fixtures and by the generator (D6-min). Tests may pass `deflateRaw` to write deflate entries.
 */
import { crc32 } from '../../client/src/case/unzip';

const DOS_DATE_1980_01_01 = 0x0021;

export function writeZip(files: [name: string, data: Uint8Array][], deflateRaw?: (data: Uint8Array) => Uint8Array): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, raw] of files) {
    const n = enc.encode(name);
    const crc = crc32(raw);
    const method = deflateRaw ? 8 : 0;
    const data = deflateRaw ? deflateRaw(raw) : raw;
    const local = new Uint8Array(30 + n.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(8, method, true);
    lv.setUint16(12, DOS_DATE_1980_01_01, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, n.length, true);
    local.set(n, 30);
    local.set(data, 30 + n.length);

    const central = new Uint8Array(46 + n.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true);
    cv.setUint16(10, method, true);
    cv.setUint16(14, DOS_DATE_1980_01_01, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, n.length, true);
    cv.setUint32(42, offset, true);
    central.set(n, 46);

    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const cdSize = centrals.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  const out = new Uint8Array(offset + cdSize + 22);
  let p = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}
