import { describe, expect, it } from 'vitest';
import type { EventLog, WirePresetId } from '../contracts';
import { chooseBranch, createRailModel, initialRailState, step } from '../wire/rail';
import { RAIL_DT_S, replayRail } from '../wire/rail-source';
import { nextBranchWindow } from './branch-window';
import { loadBundledCase } from './cathy.testutil';

const c = loadBundledCase('low-tort');
const PATH = ['e_r_iliac', 'e_aorta_desc', 'e_arch_distal', 'e_arch_proximal', 'e_bca', 'e_rcca'];

/** The log with the tip on `edge` (a replay with no input, its last sample moved to that edge). */
function logAt(edge: string, presetId: WirePresetId = 'soft_angled'): EventLog {
  const log = replayRail({ case: c, entryId: 'fem_r', targetId: 'rcca', presetId, path: PATH }, [{ push: 0, rotate: 0, fluoro: false, contrastPuff: false }]);
  return { ...log, samples: log.samples.map((s, i, a) => (i === a.length - 1 ? { ...s, edge } : s)) };
}
const inside = (w: { fromDeg: number; toDeg: number }, d: number) => (w.fromDeg <= w.toDeg ? d >= w.fromDeg && d <= w.toDeg : d >= w.fromDeg || d <= w.toDeg);

describe('nextBranchWindow (low-tort, toward the right common carotid)', () => {
  it('at the brachiocephalic opening: a narrow window for Soft angled, wider for Standard J (as Aroovee measured)', () => {
    const soft = nextBranchWindow(logAt('e_arch_proximal'), c)!;
    const j = nextBranchWindow(logAt('e_arch_proximal', 'standard_j'), c)!;
    expect(soft.edge).toBe('e_bca');
    expect(soft.widthDeg).toBeGreaterThanOrEqual(19);
    expect(soft.widthDeg).toBeLessThanOrEqual(23);
    expect(j.widthDeg).toBeGreaterThanOrEqual(50);
    expect(j.widthDeg).toBeLessThanOrEqual(56);
    for (const w of [soft, j]) {
      expect(w.fromDeg).toBeGreaterThanOrEqual(0);
      expect(w.toDeg).toBeLessThan(360);
    }
  });

  it('every whole degree in the window enters the branch, and the degrees just outside do not', () => {
    const w = nextBranchWindow(logAt('e_arch_proximal'), c)!;
    const model = createRailModel(c, 'fem_r', 'rcca', 'soft_angled', PATH);
    // walk the plan up to the opening with the rail itself, so the orientation is the rail's
    let s = initialRailState(model);
    const push = { push: 1, rotate: 0, fluoro: false, contrastPuff: false };
    for (let i = 0; i < 5000 && s.walked.at(-1)!.edge !== 'e_arch_proximal'; i++) s = step(model, s, push, RAIL_DT_S).state;
    expect(s.walked.at(-1)!.edge).toBe('e_arch_proximal');
    const at = (d: number) => chooseBranch(model, s.walked, (d * Math.PI) / 180)?.edge;
    for (let k = 0; k < w.widthDeg; k++) expect(at((w.fromDeg + k) % 360)).toBe('e_bca');
    expect(at((w.fromDeg + 359) % 360)).not.toBe('e_bca');
    expect(at((w.toDeg + 1) % 360)).not.toBe('e_bca');
    expect(inside(w, (w.fromDeg + Math.floor(w.widthDeg / 2)) % 360)).toBe(true);
  });

  it('null at the end of the plan and off the plan', () => {
    expect(nextBranchWindow(logAt('e_rcca'), c)).toBeNull();
    expect(nextBranchWindow(logAt('e_aorta_asc'), c)).toBeNull();
  });

  it('is deterministic', () => {
    const log = logAt('e_aorta_desc');
    expect(JSON.stringify(nextBranchWindow(structuredClone(log), c))).toBe(JSON.stringify(nextBranchWindow(log, c)));
  });
});
