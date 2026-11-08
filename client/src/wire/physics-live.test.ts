/**
 * Live check against a running physics process (skipped unless PHYSICS_LIVE=1; CI never runs CathSim):
 *   cd physics && MUJOCO_GL=disable .venv/bin/python -m server
 *   PHYSICS_LIVE=1 pnpm vitest run client/src/wire/physics-live.test.ts
 * Loads phantom3 over HTTP from the case index exactly as the Library will, then drives it through
 * select.ts for 3 s of wall time.
 */
import { describe, expect, it } from 'vitest';
import { loadCase } from '../case';
import type { WireFallback, WireState } from '../contracts';
import { PHYSICS_CASES_URL } from './physics-source';
import { selectWireSource } from './select';

describe.skipIf(process.env['PHYSICS_LIVE'] !== '1')('live physics process', () => {
  it('serves phantom3 and drives it on physics without falling back', async () => {
    const index = (await (await fetch(PHYSICS_CASES_URL)).json()) as { cases: { id: string; path: string }[] };
    expect(index.cases.map((c) => c.id)).toEqual(['low_tort', 'phantom2', 'phantom3', 'phantom4']);
    const entry = index.cases.find((c) => c.id === 'phantom3')!;
    const r = await loadCase({ kind: 'url', baseUrl: new URL(entry.path, PHYSICS_CASES_URL).href, origin: 'physics' });
    if (!r.ok) throw new Error(JSON.stringify(r.results));
    expect(r.case.planningOnly).toBe(false);

    const src = await selectWireSource(r.case);
    const states: WireState[] = [];
    const fallbacks: WireFallback[] = [];
    src.onState((s) => states.push(s));
    src.onFallback((f) => fallbacks.push(f));
    await src.start({ case: r.case, entryId: 'inlet', targetId: 'lcca', presetId: 'standard_j', path: ['e_aorta', 'e_lcca'] });
    src.control({ push: 1, rotate: 0, fluoro: false, contrastPuff: false });
    await new Promise((res) => setTimeout(res, 3000));
    const log = await src.stop();

    expect(fallbacks).toEqual([]);
    expect(src.mode).toBe('physics');
    expect(states.length).toBeGreaterThan(70);
    expect(log.mode).toBe('physics');
    expect(log.samples.at(-1)!.t).toBeGreaterThan(2.5);
    expect(log.samples.at(-1)!.s).toBeGreaterThan(log.samples[0]!.s + 0.03); // about 2 cm/s of push
    expect(states.at(-1)!.wire).toHaveLength(80);
  }, 30_000);
});
