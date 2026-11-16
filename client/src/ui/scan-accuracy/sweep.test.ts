/**
 * The resolution sweep. Not part of the normal test run: it takes minutes and writes files.
 *
 *   bash:        SCAN_SWEEP=1 pnpm exec vitest run client/src/ui/scan-accuracy/sweep.test.ts
 *   PowerShell:  $env:SCAN_SWEEP = '1'; pnpm exec vitest run client/src/ui/scan-accuracy/sweep.test.ts
 *
 * Writes metrics/aroovee/scan-accuracy/results.json (every number) and summary.md (the tables).
 * SCAN_CASES and SCAN_QUICK=1 narrow it. Results are saved after every run, so a stopped sweep keeps what it has.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'vitest';
import { loadBundled } from './cases.testutil';
import { runScanAccuracy, ScanTooLargeError, scoreMesh, type MeshScore, type ScanAccuracy, type ScanSettings } from './index';

const OUT = join(import.meta.dirname, '../../../../metrics/aroovee/scan-accuracy');
const CASES = (process.env.SCAN_CASES ?? 'fixture-y,low-tort,type-iii,ts-s1404-cta').split(',');
const quick = process.env.SCAN_QUICK === '1';

const settings: ScanSettings[] = [];
for (const spacingMm of quick ? [1, 2] : [0.5, 0.8, 1, 1.5, 2])
  for (const sliceMm of quick ? [1, 3] : [1, 2, 3]) settings.push({ spacingMm, sliceMm, cnr: 10, smoothPasses: 0, seed: 1 });
// Noise, at a fine and a coarse setting. At CNR 5 the image gets one in-plane smoothing pass first.
if (!quick)
  for (const [spacingMm, sliceMm] of [[0.8, 1], [1.5, 2]] as const) {
    settings.push({ spacingMm, sliceMm, cnr: 5, smoothPasses: 1, seed: 1 });
    settings.push({ spacingMm, sliceMm, cnr: 20, smoothPasses: 0, seed: 1 });
  }

interface Row {
  caseId: string;
  settings: ScanSettings;
  skipped?: string;
  result?: Omit<ScanAccuracy, 'caseId' | 'settings'>;
}

const f = (v: number | null | undefined, d = 2): string => (v === null || v === undefined ? '–' : v.toFixed(d));

function table(rows: Row[]): string {
  const head = '| In-plane mm | Slice mm | CNR | Dice | clDice | Wall dist. mm | Centerline offset mm | Radius err. % (mean / p95) | Narrowest pt. err. % | Angle err. at node ° (mean / max) | Angle err. at ostium ° (mean / max) | Vessels kept | Same frontier | Same best route | Verdict flips |';
  const sep = '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |';
  const body = rows.map((r) => {
    const s = r.settings;
    if (!r.result) return `| ${s.spacingMm} | ${s.sliceMm} | ${s.cnr} | skipped: ${r.skipped} | | | | | | | | | | | |`;
    const { voxel: v, geometry: g, topology: t, downstream: d } = r.result;
    return `| ${s.spacingMm} | ${s.sliceMm} | ${s.cnr} | ${f(v.dice, 3)} | ${f(v.clDice, 3)} | ${f(v.ahdMm)} | ${f(g.centerline.meanOffsetMm)} | ${f(g.radius.meanAbsErrPct, 1)} / ${f(g.radius.p95AbsErrPct, 1)} | ${f(g.radius.narrowestErrPct, 1)} | ${f(g.branchAngle.meanErrDeg, 0)} / ${f(g.branchAngle.maxErrDeg, 0)} | ${g.ostiumAngle.n ? `${f(g.ostiumAngle.meanErrDeg, 0)} / ${f(g.ostiumAngle.maxErrDeg, 0)}` : '–'} | ${t.edgesRecovered} of ${t.edges} | ${d.frontiersSame} of ${d.targetsCompared} | ${d.bestSame} of ${d.targetsCompared} | ${d.verdictFlips} of ${d.candidates} |`;
  });
  return [head, sep, ...body].join('\n');
}

type MeshRows = Record<string, { share: number; score: MeshScore }[]>;

/** One line per setting: the worst case for each number, over the anatomy cases (the fixture is left out). */
function headline(rows: Row[]): string {
  const anatomy = rows.filter((r) => r.caseId !== 'fixture-y');
  const keys = [...new Set(anatomy.map((r) => `${r.settings.spacingMm}|${r.settings.sliceMm}|${r.settings.cnr}`))];
  const lines = keys.map((k) => {
    const set = anatomy.filter((r) => `${r.settings.spacingMm}|${r.settings.sliceMm}|${r.settings.cnr}` === k);
    const done = set.filter((r) => r.result).map((r) => r.result!);
    const s = set[0]!.settings;
    if (done.length === 0) return `| ${s.spacingMm} | ${s.sliceMm} | ${s.cnr} | not run | | | | | |`;
    const worst = (pick: (r: (typeof done)[number]) => number): number => Math.max(...done.map(pick));
    const lost = done.reduce((n, r) => n + (r.topology.edges - r.topology.edgesRecovered), 0);
    const targets = done.reduce((n, r) => n + r.downstream.targetsCompared, 0);
    const same = done.reduce((n, r) => n + r.downstream.frontiersSame, 0);
    const flips = done.reduce((n, r) => n + r.downstream.verdictFlips, 0);
    const cands = done.reduce((n, r) => n + r.downstream.candidates, 0);
    return `| ${s.spacingMm} | ${s.sliceMm} | ${s.cnr} | ${f(worst((r) => r.geometry.centerline.meanOffsetMm))} | ${f(worst((r) => r.geometry.radius.meanAbsErrPct), 1)} | ${f(worst((r) => Math.abs(r.geometry.radius.narrowestErrPct ?? 100)), 0)} | ${lost} | ${same} of ${targets} | ${flips} of ${cands} |`;
  });
  return ['| In-plane mm | Slice mm | CNR | Worst centerline offset mm | Worst mean radius err. % | Worst narrowest pt. err. % | Vessels lost | Same frontier | Verdict flips |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |', ...lines].join('\n');
}

function meshTable(mesh: MeshRows): string {
  const lines = Object.entries(mesh).flatMap(([id, list]) =>
    list.map((m) => `| ${id} | ${m.share === 1 ? 'as shipped' : `${m.share * 100}% of triangles`} | ${m.score.triangles} | ${f(m.score.meanAbsMm)} | ${f(m.score.p95AbsMm)} | ${f(m.score.maxAbsMm)} | ${f(m.score.biasMm)} | ${f(m.score.insideOver1mmPct, 1)} |`),
  );
  return ['| Case | Mesh | Triangles | Mean dist. mm | p95 mm | Max mm | Bias mm (− = inside) | Over 1 mm inside, % |', '| --- | --- | --- | --- | --- | --- | --- | --- |', ...lines].join('\n');
}

function summary(rows: Row[], mesh: MeshRows): string {
  const parts = [
    '# Scan accuracy: what a scan at each resolution does to the geometry and to the routes',
    '',
    'Made by `client/src/ui/scan-accuracy/sweep.test.ts`; every number is in `results.json` beside this file. Do not edit by hand: run the sweep again.',
    '',
    '**What was done.** Each bundled case is its own ground truth (its centerlines and radii). The harness draws it as a synthetic CT angiogram at the stated voxel size and noise, runs a classical pipeline on the image (half-maximum threshold, connected vessels, minimum-cost centerlines, radii from rays through the image), and compares what comes back with the case. Then the unchanged route engine runs on both and its answers are compared.',
    '',
    '**How to read it.** These are errors of this pipeline on a clean synthetic image: no bone, calcium, veins or motion. A real scan at the same resolution will do no better. Nothing here is a clinical accuracy claim.',
    '',
    '- *Dice, clDice, wall distance:* overlap of the segmentation with the true lumen, whether the centerlines stay inside each other, and the average distance between the two walls.',
    '- *Centerline offset, radius error, narrowest point:* scored away from junctions (where vessels overlap, the lumen has one middle and the case file has two).',
    '- *Angle error at node:* the direction a vessel leaves a branch point over the engine\'s 5 mm window. For a branch off the aorta that window is inside the aorta, where no scan sees the branch. *At ostium:* the same where the branch leaves its parent, which a scan can see.',
    '- *Vessels kept:* edges of the case the scan still has. *Same frontier / same best route:* targets where the engine gives the same answer on the scanned geometry. *Verdict flips:* candidate routes whose feasible / not feasible verdict changed, or that vanished.',
    '',
  ];
  parts.push('## Headline: the worst anatomy case at each setting', '', 'Over low-tort, type-iii and ts-s1404-cta. Counts are summed over the three.', '', headline(rows), '');
  parts.push(
    '## The vessel mesh against the lumen',
    '',
    'How far each case\'s shipped mesh (`vessels.glb`) sits from the lumen its centerlines and radii describe, and what the app\'s own decimator does to that. No scan is involved. For the three CT-derived cases the centerlines were measured from the mesh, so this checks that the two agree; for generated cases it checks the mesh builder. The largest distances (around 10 to 13 mm, inside) are at junctions, where a branch\'s tube runs on into its parent: that is how the meshes are built, not a fault in the wall.',
    '',
    meshTable(mesh),
    '',
  );
  for (const id of [...new Set(rows.map((r) => r.caseId))]) parts.push(`## ${id}`, '', table(rows.filter((r) => r.caseId === id)), '');
  return parts.join('\n');
}

describe.skipIf(!process.env.SCAN_SWEEP)('scan accuracy sweep', () => {
  test('sweep', { timeout: 6 * 3600_000 }, async () => {
    mkdirSync(OUT, { recursive: true });
    const rows: Row[] = [];
    const mesh: MeshRows = {};
    for (const id of CASES) {
      const c = await loadBundled(id);
      mesh[id] = scoreMesh(c);
      for (const s of settings) {
        try {
          const { caseId, settings: used, ...result } = runScanAccuracy(c, s);
          rows.push({ caseId, settings: used, result });
        } catch (e) {
          if (!(e instanceof ScanTooLargeError)) throw e;
          rows.push({ caseId: id, settings: s, skipped: 'volume too large' });
        }
        const last = rows[rows.length - 1]!;
        console.log(`${id} ${s.spacingMm}×${s.sliceMm} cnr ${s.cnr}: ${last.result ? `${last.result.ms} ms` : last.skipped}`);
        writeFileSync(join(OUT, 'results.json'), JSON.stringify(rows, (_, v) => (typeof v === 'number' ? Math.round(v * 10000) / 10000 : v), 1));
        writeFileSync(join(OUT, 'summary.md'), summary(rows, mesh));
        writeFileSync(join(OUT, 'mesh.json'), JSON.stringify(mesh, (_, v) => (typeof v === 'number' ? Math.round(v * 10000) / 10000 : v), 1));
      }
    }
  });
});
