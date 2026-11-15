/**
 * The harness's own checks, and its baseline: a change to the pipeline that makes a recorded metric worse fails
 * here. To accept a deliberate change, record again and commit baseline.json:
 *
 *   SCAN_BASELINE=write pnpm exec vitest run client/src/ui/scan-accuracy/scan-accuracy.test.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { loadBundled } from './cases.testutil';
import { runScanAccuracy, scoreAgainstTruth, type ScanAccuracy, type ScanSettings } from './index';

const BASELINE = join(import.meta.dirname, 'baseline.json');
const RUNS: { caseId: string; settings: ScanSettings }[] = [
  { caseId: 'fixture-y', settings: { spacingMm: 1, sliceMm: 1, cnr: 10, smoothPasses: 0, seed: 1 } },
  { caseId: 'fixture-y', settings: { spacingMm: 2, sliceMm: 2, cnr: 10, smoothPasses: 0, seed: 1 } },
  { caseId: 'low-tort', settings: { spacingMm: 1.5, sliceMm: 1.5, cnr: 10, smoothPasses: 0, seed: 1 } },
];

/** The metrics held to the baseline. `higher` ones may not fall, the rest may not rise. */
const pick = (r: ScanAccuracy) => ({
  higher: { dice: r.voxel.dice, clDice: r.voxel.clDice, edgesRecovered: r.topology.edgesRecovered, frontiersSame: r.downstream.frontiersSame, bestSame: r.downstream.bestSame },
  lower: {
    ahdMm: r.voxel.ahdMm,
    meanOffsetMm: r.geometry.centerline.meanOffsetMm,
    radiusMeanAbsErrPct: r.geometry.radius.meanAbsErrPct,
    narrowestAbsErrPct: Math.abs(r.geometry.radius.narrowestErrPct ?? 100),
    branchAngleMeanErrDeg: r.geometry.branchAngle.meanErrDeg,
    verdictFlips: r.downstream.verdictFlips,
  },
});
type Picked = ReturnType<typeof pick>;
const key = (x: (typeof RUNS)[number]) => `${x.caseId} ${x.settings.spacingMm}x${x.settings.sliceMm} cnr${x.settings.cnr}`;

describe('scan accuracy harness', () => {
  const results = new Map<string, ScanAccuracy>();
  test('runs on the baseline cases', { timeout: 120_000 }, async () => {
    for (const x of RUNS) results.set(key(x), runScanAccuracy(await loadBundled(x.caseId), x.settings));
    if (process.env.SCAN_BASELINE === 'write') {
      const out = Object.fromEntries([...results].map(([k, r]) => [k, pick(r)]));
      writeFileSync(BASELINE, JSON.stringify(out, (_, v) => (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v), 2) + '\n');
    }
    expect(results.size).toBe(RUNS.length);
  });

  test('no metric is worse than its recorded baseline', () => {
    expect(existsSync(BASELINE), 'baseline.json is missing: record it (see the header)').toBe(true);
    const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as Record<string, Picked>;
    for (const [k, r] of results) {
      const now = pick(r);
      const was = base[k];
      expect(was, `no baseline for ${k}`).toBeDefined();
      // A hair of slack for floating point across machines.
      for (const [m, v] of Object.entries(now.higher)) expect(v, `${k}: ${m} fell`).toBeGreaterThanOrEqual((was!.higher as Record<string, number>)[m]! - 1e-3);
      for (const [m, v] of Object.entries(now.lower)) expect(v, `${k}: ${m} rose`).toBeLessThanOrEqual((was!.lower as Record<string, number>)[m]! * 1.01 + 1e-3);
    }
  });

  test('a fine scan of the fixture is close to the truth, and coarser is no better', () => {
    const fine = results.get(key(RUNS[0]!))!;
    const coarse = results.get(key(RUNS[1]!))!;
    expect(fine.topology.edgesRecovered).toBe(fine.topology.edges);
    expect(fine.voxel.dice).toBeGreaterThan(0.97);
    expect(fine.geometry.centerline.meanOffsetMm).toBeLessThan(0.5);
    expect(fine.geometry.radius.meanAbsErrPct).toBeLessThan(5);
    expect(coarse.voxel.dice).toBeLessThan(fine.voxel.dice);
    expect(coarse.voxel.ahdMm).toBeGreaterThan(fine.voxel.ahdMm);
  });

  test('the same settings give the same numbers (seeded noise)', async () => {
    const x = RUNS[1]!;
    const again = runScanAccuracy(await loadBundled(x.caseId), x.settings);
    expect(pick(again)).toEqual(pick(results.get(key(x))!));
  });

  test('a case scored against itself has no error and the same routes', async () => {
    const c = await loadBundled('fixture-y');
    const s = scoreAgainstTruth(c, c);
    expect(s.missingEdges).toEqual([]);
    expect(s.geometry.centerline.maxOffsetMm).toBeLessThan(1e-6);
    expect(s.geometry.radius.meanAbsErrPct).toBeLessThan(1e-6);
    expect(s.downstream.frontiersSame).toBe(s.downstream.targetsCompared);
    expect(s.downstream.verdictFlips).toBe(0);
  });
});
