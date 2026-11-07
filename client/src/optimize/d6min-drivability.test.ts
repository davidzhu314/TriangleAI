/**
 * D6-min drivability check (post-V7). Skipped unless D6_DIR names a folder holding the generated case
 * folders (type-iii/, low-tort/), so it can run on David's branch before his PR merges without
 * committing his files. For every target, it drives every frontier route with the rail autopilot
 * (V4 acceptance logic) and reports wrong branches and prolapses, with steerableAt's takeoff angles.
 *
 * D6_DIR=<folder> pnpm exec vitest run client/src/optimize/d6min-drivability.test.ts
 * writes metrics/vaibhav/d6min-drivability.md.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCase } from '../case';
import type { LoadedCase, WireEvent } from '../contracts';
import { railAutopilot } from '../wire/rail-autopilot';
import { createRailModel, initialRailState, step } from '../wire/rail';
import { RAIL_DT_S } from '../wire/rail-source';
import { buildGraph } from './graph';
import { optimizeCase } from './optimizer';
import { steerableAt } from './steerability';
import { writeMetrics } from './timing.testutil';

const DIR = process.env['D6_DIR'];
const CASES = ['type-iii', 'low-tort'];

async function load(name: string): Promise<LoadedCase> {
  const bytes = (f: string) => new Uint8Array(readFileSync(join(DIR!, name, f)));
  const r = await loadCase({ kind: 'files', origin: 'bundled', files: { 'case.json': bytes('case.json'), 'centerlines.json': bytes('centerlines.json'), 'vessels.glb': bytes('vessels.glb') } });
  if (!r.ok) throw new Error(`${name}: ${JSON.stringify(r.results)}`);
  return r.case;
}

describe.skipIf(!DIR)('D6-min drivability (rail autopilot on every frontier route)', () => {
  it('drives every frontier route and writes the summary', async () => {
    const rows: string[] = [];
    let failed = 0;
    for (const name of CASES) {
      const c = await load(name);
      const g = buildGraph(c);
      for (const t of c.targets) {
        const res = optimizeCase(g, { caseId: c.id, targetId: t.id });
        if (res.kind !== 'frontier') {
          rows.push(`| ${name} | ${t.id} | (no safe route) | — | — | — | — |`);
          continue;
        }
        for (const r of res.routes) {
          const model = createRailModel(c, r.entryId, t.id, r.presetId, r.edges);
          let st = initialRailState(model);
          const events: WireEvent[] = [];
          for (let i = 0; i < 9000 && !st.atTarget; i++) {
            const s = step(model, st, railAutopilot(model, st, RAIL_DT_S), RAIL_DT_S);
            st = s.state;
            events.push(...s.events);
            if (s.events.some((e) => e.kind === 'wrong_branch' || e.kind === 'prolapse')) break;
          }
          const wrong = events.filter((e) => e.kind === 'wrong_branch');
          const prolapse = events.filter((e) => e.kind === 'prolapse');
          const steer = steerableAt(g, r.edges, r.presetId, g.entries.get(r.entryId));
          const where = steer.failures
            .map((f) => `${f.node}: into ${f.edge} takeoff ${f.takeoffDeg.toFixed(0)}° vs tip ${f.tipDeg}° (enters ${f.entered})`)
            .join('; ');
          if (!st.atTarget) failed++;
          rows.push(
            `| ${name} | ${t.id} | \`${r.entryId} · ${r.presetId} · ${r.edges.join(',')}\` | ${st.atTarget ? 'yes' : 'no'} | ${wrong.map((e) => (e as { edge: string }).edge).join(', ') || '—'} | ${prolapse.length || '—'} | ${where || 'steerable'} |`,
          );
        }
      }
    }
    writeMetrics('d6min-drivability.md', [
      '# D6-min drivability — rail autopilot on every frontier route',
      '',
      'Written by `D6_DIR=<folder> pnpm exec vitest run client/src/optimize/d6min-drivability.test.ts`, run against the generated cases on `origin/lane/david` (PR #13, head 937c67d) before they merge.',
      '',
      'Each frontier route from the real optimizer, driven by the rail autopilot with the V4 acceptance logic. The drive stops at the first wrong branch or prolapse. The last column is `steerableAt` (§5.3: the tip enters a branch within 25° of its tip direction, else the straightest way on).',
      '',
      '| Case | Target | Route (entry · preset · edges) | Reached | Wrong branch into | Prolapses | Where steering fails |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      ...rows,
      '',
      `Routes that do not reach the target: ${failed}.`,
    ]);
    expect(rows.length).toBeGreaterThan(0);
  }, 120_000);
});
