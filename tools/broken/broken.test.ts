import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { brokenFiles } from './build';

const DIR = join(import.meta.dirname, '../../tests/fixtures/broken');
const update = process.env['UPDATE_FIXTURES'] === '1';

describe('broken fixtures', () => {
  const built = brokenFiles();

  it(update ? 'writes the committed files' : 'match the committed files byte for byte', () => {
    for (const [rel, bytes] of Object.entries(built)) {
      const path = join(DIR, rel);
      if (update) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, bytes);
      }
      expect(readFileSync(path).equals(Buffer.from(bytes)), `${rel} is stale; run pnpm fixtures`).toBe(true);
    }
  });

  it('build identically twice', () => {
    const again = brokenFiles();
    for (const [rel, bytes] of Object.entries(built)) expect(Buffer.from(again[rel]!).equals(Buffer.from(bytes))).toBe(true);
  });
});
