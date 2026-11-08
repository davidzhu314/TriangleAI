/**
 * The input folder stays inert and pure until the team wires it in:
 * - no clock, randomness or storage (time comes from frame and event timestamps);
 * - no import of anything not installed (MediaPipe, three.js) and no network;
 * - only speech.ts touches the browser, and only when called;
 * - nothing outside client/src/input imports it yet.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = import.meta.dirname;
const SRC = join(HERE, '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

const source = files(HERE).filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.testutil.ts'));

describe('input folder purity', () => {
  it.each(source.map((f) => relative(HERE, f)))('%s reads no clock, randomness, storage or network, and imports only installed code', (rel) => {
    const src = readFileSync(join(HERE, rel), 'utf8');
    expect(src).not.toMatch(/\bDate\b|performance\.now|Math\.random/);
    expect(src).not.toMatch(/localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|WebSocket/);
    expect(src).not.toMatch(/from ['"](@mediapipe|three)/);
    expect(src).not.toMatch(/getUserMedia/);
    if (!rel.endsWith('speech.ts')) expect(src).not.toMatch(/\b(window|globalThis|navigator|document)\s*(\.|\?\.|\[)/);
  });

  it('nothing in the app imports the input folder yet', () => {
    // resolve each relative import, so a screen's own ./input module (e.g. ui/drive/input.ts) isn't mistaken for this folder
    const outside = files(SRC).filter((f) => !f.startsWith(HERE) && !f.endsWith('.test.ts') && !f.endsWith('.testutil.ts'));
    for (const f of outside) {
      for (const m of readFileSync(f, 'utf8').matchAll(/from ['"](\.[^'"]+)['"]/g)) {
        const target = resolve(dirname(f), m[1]!);
        expect(target === HERE || target.startsWith(HERE + sep), `${relative(SRC, f)} imports ${m[1]}`).toBe(false);
      }
    }
  });
});
