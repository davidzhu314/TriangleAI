/**
 * Seed search, run by hand: TUNE=1 pnpm exec vitest run tools/generator/tune.test.ts
 * Prints candidate seeds; the chosen ones are written into cases.ts.
 */
import { describe, it } from 'vitest';
import { generateArch } from './arch';
import { loadGenerated, measureAll, safeFrontier } from './analyze';
import { LOW_TORT, TYPE_III } from './cases';

const tune = process.env['TUNE'] === '1';
const fmt = (x: number) => x.toFixed(1);

describe.skipIf(!tune)('seed search', () => {
  it('prints routes for the committed seeds', async () => {
    for (const p of [TYPE_III, LOW_TORT]) {
      const r = await loadGenerated(generateArch(p), false);
      if (!r.ok) throw new Error(JSON.stringify(r.results));
      console.log(p.id, p.seed, r.case.validation.map((v) => v.message));
      for (const m of measureAll(r.case)) {
        const c = m.measures.cost;
        console.log(`  ${m.entry}->${m.target} L=${fmt(c.lengthM * 1000)} max=${fmt(c.sharpestTurnDeg)}@${m.measures.sharpestTurnEdge} sum=${fmt(c.totalTurningDeg)} rmin=${fmt(c.narrowestRadiusM * 1000)} prox=${c.proximityPenalty.toFixed(2)}`);
      }
      console.log('  frontier rcca:', safeFrontier(measureAll(r.case), 'rcca').map((x) => x.entry));
    }
  });

  it('searches Type III seeds', async () => {
    const hits: string[] = [];
    for (let seed = 1; seed <= Number(process.env['SEEDS'] ?? 300); seed++) {
      const r = await loadGenerated(generateArch({ ...TYPE_III, seed }), false);
      if (!r.ok) continue;
      const routes = measureAll(r.case);
      const femR = routes.find((x) => x.entry === 'fem_r' && x.target === 'rcca')!;
      const t = femR.measures.cost.sharpestTurnDeg;
      const frontier = safeFrontier(routes, 'rcca');
      if (Math.abs(t - 120) <= 3 && frontier.length >= 3) {
        hits.push(`seed ${seed}: fem_r ${fmt(t)}@${femR.measures.sharpestTurnEdge} frontier ${frontier.map((f) => `${f.entry}:${fmt(f.measures.cost.sharpestTurnDeg)}`).join(' ')}`);
      }
    }
    console.log(hits.join('\n'));
  }, 600_000);
});
