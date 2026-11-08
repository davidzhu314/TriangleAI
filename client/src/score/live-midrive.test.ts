/**
 * Cathy's drive answers mid-drive (hands and voice in the demo): RailWireSource.logSoFar gives the partial
 * log driveAssist is built for, without stopping the drive.
 */
import { describe, expect, it } from 'vitest';
import type { Frontier } from '../contracts';
import { loadFixtureY } from '../optimize/fixture-y.testutil';
import { buildGraph } from '../optimize/graph';
import { optimizeCase } from '../optimize/optimizer';
import { DEFAULT_WEIGHTS } from '../optimize/rank';
import { RailWireSource, wireLogSoFar, wireRailSnapshot } from '../wire/rail-source';
import { driveWarning } from './warn';
import { driveAssist } from './live';

const c = loadFixtureY();
const f = optimizeCase(buildGraph(c), { caseId: c.id, targetId: 'left_branch' }) as Frontier;
const route = f.routes[0]!;

async function started(): Promise<RailWireSource> {
  const src = new RailWireSource({ clock: 'manual', autoDrive: true });
  await src.start({ case: c, entryId: route.entryId, targetId: 'left_branch', presetId: route.presetId, path: route.edges });
  src.control({ push: 0, rotate: 0, fluoro: true, contrastPuff: false });
  return src;
}

describe('mid-drive log for Cathy', () => {
  it('logSoFar is null before start and after stop, and a copy in between', async () => {
    expect(new RailWireSource({ clock: 'manual' }).logSoFar()).toBeNull();
    const src = await started();
    for (let i = 0; i < 30; i++) src.tick();
    const a = src.logSoFar()!;
    expect(a.samples.length).toBeGreaterThan(1);
    a.samples.length = 0; // a copy: changing it leaves the drive alone
    src.tick();
    expect(src.logSoFar()!.samples.length).toBeGreaterThan(1);
    const final = await src.stop();
    expect(final.samples.length).toBeGreaterThan(1);
    expect(src.logSoFar()).toBeNull();
  });

  it('driveAssist answers on the partial log while the drive keeps going', async () => {
    const src = await started();
    for (let i = 0; i < 30; i++) src.tick();
    const partial = wireLogSoFar(src)!;
    expect(partial.events.some((e) => e.kind === 'target_reached')).toBe(false);
    const a = driveAssist({ log: partial, optimized: f, weights: DEFAULT_WEIGHTS, case: c });
    expect(a.offPlan).toBeNull();
    expect(a.nextEdge === null || route.edges.includes(a.nextEdge)).toBe(true);
    for (let i = 0; i < 200 * 30 && !src.logSoFar()!.events.some((e) => e.kind === 'target_reached'); i++) src.tick();
    expect((await src.stop()).events.some((e) => e.kind === 'target_reached')).toBe(true); // the drive finished normally
  });

  it('wireLogSoFar gives null for a source without logSoFar', () => {
    expect(wireLogSoFar({ mode: 'physics' })).toBeNull();
    expect(wireLogSoFar(null)).toBeNull();
  });
});

describe('rail snapshot for the wrong-branch warning (request from Gibran)', () => {
  it('is null before start, after stop and for a source without one; live in between, and driveWarning runs on it', async () => {
    expect(new RailWireSource({ clock: 'manual' }).railSnapshot()).toBeNull();
    expect(wireRailSnapshot({ mode: 'physics' })).toBeNull();
    const src = await started();
    for (let i = 0; i < 20; i++) src.tick();
    const snap = wireRailSnapshot(src)!;
    expect(snap).not.toBeNull();
    const before = snap.state;
    src.tick();
    expect(wireRailSnapshot(src)!.state).not.toBe(before); // replaced each tick, never mutated in place
    expect(() => driveWarning(snap.model, snap.state)).not.toThrow();
    await src.stop();
    expect(src.railSnapshot()).toBeNull();
  });
});
