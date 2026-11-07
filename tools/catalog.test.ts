import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCatalog, BUNDLED_CASE_IDS } from './catalog';

const CASES_DIR = join(import.meta.dirname, '../client/public/cases');
const update = process.env['UPDATE_FIXTURES'] === '1';

describe('bundled case catalog', () => {
  it(update ? 'writes index.json' : 'index.json matches the catalog', () => {
    const path = join(CASES_DIR, 'index.json');
    if (update) writeFileSync(path, buildCatalog());
    expect(readFileSync(path, 'utf8'), 'index.json is stale; run pnpm fixtures').toBe(buildCatalog());
  });

  // In update mode the case folders may not be written yet (other test files write them).
  it.skipIf(update)('lists only folders that exist', () => {
    for (const id of BUNDLED_CASE_IDS) expect(existsSync(join(CASES_DIR, id, 'case.json')), id).toBe(true);
  });
});
