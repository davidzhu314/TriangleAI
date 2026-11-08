/**
 * ReplayWireSource. D4 recorded no runs, so the honest outcome today is a refusal: no recorded-runs
 * file, or no process at all, rejects with PhysicsFailure. The playback test serves a tiny
 * three-frame file built inside this test; it never ships and never feeds the app.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCase } from '../case';
import { RECORDED_RUNS_SCHEMA, type LoadedCase, type PhysicsStateMessage, type RecordedRuns, type Vec3, type WireStartRequest } from '../contracts';
import { PhysicsFailure } from './physics-source';
import { ReplayWireSource } from './replay-source';

let phantom: LoadedCase;
beforeAll(async () => {
  const dir = join(import.meta.dirname, '../../../physics/cases/phantom3');
  const f = (n: string) => new Uint8Array(readFileSync(join(dir, n)));
  const r = await loadCase({ kind: 'files', origin: 'physics', files: { 'case.json': f('case.json'), 'centerlines.json': f('centerlines.json'), 'vessels.glb': f('vessels.glb') } });
  if (!r.ok) throw new Error('phantom3 did not load');
  phantom = r.case;
});
const request = (): WireStartRequest => ({ case: phantom, entryId: 'inlet', targetId: 'bca', presetId: 'standard_j', path: ['e_aorta', 'e_arch', 'e_bca'] });

const respond = (routes: Record<string, unknown>): typeof fetch =>
  (async (url: string | URL | Request) => {
    const path = new URL(String(url)).pathname;
    return path in routes ? new Response(JSON.stringify(routes[path]), { status: 200 }) : new Response('not found', { status: 404 });
  }) as typeof fetch;

describe('ReplayWireSource', () => {
  it('refuses when the physics process has no recorded runs (today: D4 recorded none)', async () => {
    const src = new ReplayWireSource({ fetch: respond({}), clock: 'manual' });
    await expect(src.start(request())).rejects.toEqual(new PhysicsFailure('server_unavailable'));
  });

  it('refuses when no physics process answers', async () => {
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    await expect(new ReplayWireSource({ fetch: down, clock: 'manual' }).start(request())).rejects.toBeInstanceOf(PhysicsFailure);
  });

  it('plays served frames in simulation time and ignores push', async () => {
    const pts = phantom.edges.find((e) => e.id === 'e_aorta')!.points;
    const frame = (t: number, tip: Vec3): PhysicsStateMessage => ({ type: 'state', t, wire: [tip, tip], tip, contact_force_n: 0.1, at_target: false });
    const runs: RecordedRuns = {
      schema: RECORDED_RUNS_SCHEMA,
      cathsim: 'test',
      stepS: 0.012,
      stats: [],
      replays: [{ phantom: 'phantom3', target: 'bca', presetId: 'standard_j', file: 'runs/test.json' }],
    };
    const src = new ReplayWireSource({ fetch: respond({ '/recorded-runs.json': runs, '/runs/test.json': [frame(0, pts[0]!), frame(1 / 30, pts[5]!), frame(2 / 30, pts[9]!)] }), clock: 'manual' });
    await src.start(request());
    src.control({ push: -1, rotate: 1, fluoro: true, contrastPuff: false });
    src.tick();
    src.tick();
    src.tick(); // past the end: holds
    const log = await src.stop();
    expect(log.mode).toBe('replay');
    expect(log.samples.map((s) => s.t)).toEqual([0, 1 / 30, 2 / 30]);
    expect(log.samples.map((s) => s.tip)).toEqual([pts[0], pts[5], pts[9]]);
    expect(log.samples[2]!.fluoro).toBe(true);
  });
});
