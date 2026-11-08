import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCase } from '../case';
import type { LoadedCase } from '../contracts';
import { boxOf, closeUpBox, extent, inside } from './framing';

async function bundled(id: string): Promise<LoadedCase> {
  const dir = join(process.cwd(), 'client', 'public', 'cases', id);
  const files = Object.fromEntries(['case.json', 'centerlines.json', 'vessels.glb'].map((n) => [n, new Uint8Array(readFileSync(join(dir, n)))]));
  const r = await loadCase({ kind: 'files', origin: 'bundled', files });
  if (!r.ok) throw new Error(`${id} did not load`);
  return r.case;
}

describe('3D close-up framing', () => {
  it.each(['type-iii', 'low-tort', 'bovine', 'ts-s1404-cta'])('%s: frames the targets and the branch points they leave from, well inside the whole tree', async (id) => {
    const c = await bundled(id);
    const box = closeUpBox(c)!;
    expect(box, 'a close-up exists').not.toBeNull();
    const whole = boxOf(c.edges.flatMap((e) => e.points))!;
    expect(extent(box)).toBeLessThanOrEqual(0.5 * extent(whole));
    for (const t of c.targets) expect(inside(box, c.nodes.find((n) => n.id === t.node)!.pos), t.id).toBe(true);
    // The entries (groin, arms) are outside: the close-up is not the whole tree.
    const femoral = c.entries.find((e) => e.id.startsWith('fem'));
    if (femoral) expect(inside(box, c.nodes.find((n) => n.id === femoral.node)!.pos)).toBe(false);
  });

  it('gives no close-up when the whole case is already small (fixture-y)', async () => {
    expect(closeUpBox(await bundled('fixture-y'))).toBeNull();
  });

  it('is the same for the same case', async () => {
    const c = await bundled('type-iii');
    expect(closeUpBox(c)).toEqual(closeUpBox(c));
  });
});
