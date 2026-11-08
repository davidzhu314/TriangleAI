/**
 * Seed search, run by hand:
 *   TUNE=1 pnpm exec vitest run tools/generator/tune.test.ts --disableConsoleIntercept
 *   TUNE=1 CASE=bovine SEEDS=300 pnpm exec vitest run tools/generator/tune.test.ts --disableConsoleIntercept
 * Prints every committed case's routes, then the seeds of one case (CASE, default type-iii) that pass
 * its checks; the chosen seed goes into cases.ts.
 */
import { describe, it } from 'vitest';
import type { LoadedCase } from '../../client/src/contracts';
import { generateArch, type ArchParams } from './arch';
import { frontierWithSteering, loadGenerated, measureAll } from './analyze';
import { GENERATED_CASES } from './build';

const tune = process.env['TUNE'] === '1';
const fmt = (x: number) => x.toFixed(1);

/** Checks every generated case must pass: a steerable frontier to every target. */
export function ladderProblem(c: LoadedCase, minDistinct = 1): string | null {
  for (const t of c.targets) {
    const f = frontierWithSteering(c, t.id);
    if (!f || f.length === 0) return `${t.id}: no safe route`;
    if (new Set(f.map((x) => x.route.edges.join(','))).size < minDistinct) return `${t.id}: under ${minDistinct} distinct routes`;
    const bad = f.find((x) => !x.steer.ok);
    if (bad) return `${t.id}: ${bad.route.entryId}·${bad.route.presetId} cannot steer at ${bad.steer.failures[0]!.node}`;
  }
  return null;
}

/** Why a Type III candidate fails, or null when it passes. */
export function typeIiiProblem(c: LoadedCase): string | null {
  const femR = measureAll(c).find((x) => x.entry === 'fem_r' && x.target === 'rcca')!;
  const t = femR.measures.cost.sharpestTurnDeg;
  if (t < 117 || t > 123 || femR.measures.sharpestTurnEdge !== 'e_r_iliac') return `fem_r ${fmt(t)}@${femR.measures.sharpestTurnEdge}`;
  const f = frontierWithSteering(c, 'rcca');
  if (f && new Set(f.map((x) => x.route.edges.join(','))).size < 3) return 'rcca: under 3 distinct routes';
  return ladderProblem(c);
}

async function report(p: ArchParams): Promise<void> {
  const r = await loadGenerated(generateArch(p), false);
  if (!r.ok) throw new Error(JSON.stringify(r.results));
  console.log(p.id, p.seed, r.case.validation.map((v) => v.message));
  for (const m of measureAll(r.case)) {
    const c = m.measures.cost;
    console.log(`  ${m.entry}->${m.target} L=${fmt(c.lengthM * 1000)} max=${fmt(c.sharpestTurnDeg)}@${m.measures.sharpestTurnEdge} rmin=${fmt(c.narrowestRadiusM * 1000)} prox=${c.proximityPenalty.toFixed(2)}`);
  }
  for (const t of r.case.targets) {
    const f = frontierWithSteering(r.case, t.id);
    if (!f) console.log(`  frontier ${t.id}: none`);
    for (const x of f ?? []) {
      console.log(`  frontier ${t.id} ${x.route.entryId}·${x.route.presetId} steer=${x.steer.ok} takeoffs ${x.takeoffs.map((k) => `${k.node}->${k.edge} ${fmt(k.deg)}`).join(', ')}`);
    }
  }
  console.log('  problem:', p.id === 'type-iii' ? typeIiiProblem(r.case) : ladderProblem(r.case));
}

describe.skipIf(!tune)('seed search', () => {
  it('prints routes for the committed seeds', async () => {
    for (const p of GENERATED_CASES) if (!process.env['CASE'] || process.env['CASE'] === p.id) await report(p);
  });

  it('searches seeds', async () => {
    const base = GENERATED_CASES.find((p) => p.id === (process.env['CASE'] ?? 'type-iii'))!;
    const check = base.id === 'type-iii' ? typeIiiProblem : ladderProblem;
    const hits: string[] = [];
    for (let seed = 1; seed <= Number(process.env['SEEDS'] ?? 300); seed++) {
      const r = await loadGenerated(generateArch({ ...base, seed }), false);
      if (r.ok && r.case.validation.length === 0 && check(r.case) === null) hits.push(String(seed));
    }
    console.log(`${base.id} passing seeds:`, hits.join(' '));
  }, 600_000);
});
