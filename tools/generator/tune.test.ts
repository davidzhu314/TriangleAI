/**
 * Seed search, run by hand:
 *   TUNE=1 pnpm exec vitest run tools/generator/tune.test.ts --disableConsoleIntercept
 * Prints the committed seeds' routes, then Type III seeds that pass every check; the chosen seed
 * goes into cases.ts.
 */
import { describe, it } from 'vitest';
import type { LoadedCase } from '../../client/src/contracts';
import { generateArch } from './arch';
import { frontierWithSteering, loadGenerated, measureAll } from './analyze';
import { LOW_TORT, TYPE_III } from './cases';

const tune = process.env['TUNE'] === '1';
const fmt = (x: number) => x.toFixed(1);

/** Why a Type III candidate fails, or null when it passes. */
export function typeIiiProblem(c: LoadedCase): string | null {
  const femR = measureAll(c).find((x) => x.entry === 'fem_r' && x.target === 'rcca')!;
  const t = femR.measures.cost.sharpestTurnDeg;
  if (t < 117 || t > 123 || femR.measures.sharpestTurnEdge !== 'e_r_iliac') return `fem_r ${fmt(t)}@${femR.measures.sharpestTurnEdge}`;
  for (const target of ['rcca', 'lcca']) {
    const f = frontierWithSteering(c, target);
    if (!f) return `${target}: no safe route`;
    if (target === 'rcca' && new Set(f.map((x) => x.route.edges.join(','))).size < 3) return 'rcca: under 3 distinct routes';
    const bad = f.find((x) => !x.steer.ok);
    if (bad) return `${target}: ${bad.route.entryId}·${bad.route.presetId} cannot steer at ${bad.steer.failures[0]!.node}`;
  }
  return null;
}

describe.skipIf(!tune)('seed search', () => {
  it('prints routes for the committed seeds', async () => {
    for (const p of [TYPE_III, LOW_TORT]) {
      const r = await loadGenerated(generateArch(p), false);
      if (!r.ok) throw new Error(JSON.stringify(r.results));
      console.log(p.id, p.seed, r.case.validation.map((v) => v.message));
      for (const m of measureAll(r.case)) {
        const c = m.measures.cost;
        console.log(`  ${m.entry}->${m.target} L=${fmt(c.lengthM * 1000)} max=${fmt(c.sharpestTurnDeg)}@${m.measures.sharpestTurnEdge} rmin=${fmt(c.narrowestRadiusM * 1000)} prox=${c.proximityPenalty.toFixed(2)}`);
      }
      for (const target of ['rcca', 'lcca']) {
        for (const f of frontierWithSteering(r.case, target) ?? []) {
          console.log(`  frontier ${target} ${f.route.entryId}·${f.route.presetId} steer=${f.steer.ok} takeoffs ${f.takeoffs.map((t) => `${t.node}->${t.edge} ${fmt(t.deg)}`).join(', ')}`);
        }
      }
      if (p === TYPE_III) console.log('  problem:', typeIiiProblem(r.case));
    }
  });

  it('searches Type III seeds', async () => {
    const hits: string[] = [];
    for (let seed = 1; seed <= Number(process.env['SEEDS'] ?? 300); seed++) {
      const r = await loadGenerated(generateArch({ ...TYPE_III, seed }), false);
      if (r.ok && typeIiiProblem(r.case) === null) hits.push(String(seed));
    }
    console.log('passing seeds:', hits.join(' '));
  }, 600_000);
});
