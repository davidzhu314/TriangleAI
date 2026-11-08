/**
 * G1: the golden Type III demo drive, so the demo's Results beat always has a known-good log.
 *
 * tests/fixtures/engine/demo-type-iii-rcca.json holds the plan (the best frontier route to rcca at
 * the starting weights, `defaultWeights(routes)`, an equal share per measure, as Compare starts) and
 * the EventLog of a rail autopilot drive of it with fluoro held. demo-type-iii-rcca.result.json holds
 * the CaseResult that scoreCase gives for that log at the same weights.
 *
 * The test checks, byte for byte (JSON keeps every double exactly):
 * - the optimizer still picks the same route;
 * - driving it again gives the same log;
 * - scoring the committed log gives the committed result.
 * If a deliberate engine or case change alters them, regenerate with
 * UPDATE_FIXTURES=1 pnpm exec vitest run tests/engine/golden-demo.test.ts
 * and say so in the handoff.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildGraph, defaultWeights, optimizeCase } from '../../client/src/optimize';
import { bestFrontierRoute, scoreCase } from '../../client/src/score';
import type { EventLog, Frontier, Weights } from '../../client/src/contracts';
import { autoDrive, ENGINE_FIXTURES, loadBundled, shouldWriteFixtures } from './engine.testutil';

const CASE = 'type-iii';
const TARGET = 'rcca';
const FILE = join(ENGINE_FIXTURES, 'demo-type-iii-rcca.json');
const RESULT_FILE = join(ENGINE_FIXTURES, 'demo-type-iii-rcca.result.json');

interface Golden {
  description: string;
  case: string;
  targetId: string;
  weights: Weights;
  route: { id: string; entryId: string; presetId: string; edges: string[] };
  log: EventLog;
}

const serialize = (x: unknown) => JSON.stringify(x) + '\n';

describe('golden Type III demo drive', async () => {
  const c = await loadBundled(CASE);
  const f = optimizeCase(buildGraph(c), { caseId: c.id, targetId: TARGET }) as Frontier;
  const weights = defaultWeights(f.routes);
  const best = bestFrontierRoute(f, weights)!;

  if (shouldWriteFixtures()) {
    it('writes the golden files', async () => {
      const { log, reached } = await autoDrive(c, TARGET, best);
      expect(reached).toBe(true);
      const golden: Golden = {
        description:
          'G1 golden demo drive: type-iii to rcca along the best frontier route at the starting weights (defaultWeights), rail autopilot, fluoro held, 30 Hz, simulation time.',
        case: CASE,
        targetId: TARGET,
        weights,
        route: { id: best.id, entryId: best.entryId, presetId: best.presetId, edges: [...best.edges] },
        log,
      };
      writeFileSync(FILE, serialize(golden));
      writeFileSync(RESULT_FILE, serialize(scoreCase({ log, optimized: f, weights, case: c })));
    });
    return;
  }

  const text = readFileSync(FILE, 'utf8');
  const golden = JSON.parse(text) as Golden;

  it('the optimizer still picks the same best route at the same weights', () => {
    expect(f.kind).toBe('frontier');
    expect(weights).toEqual(golden.weights);
    expect({ id: best.id, entryId: best.entryId, presetId: best.presetId, edges: best.edges }).toEqual(golden.route);
  });

  it('the committed drive is clean: target reached, no wrong branch, no prolapse', () => {
    const kinds = golden.log.events.map((e) => e.kind);
    expect(kinds).toContain('target_reached');
    expect(kinds).not.toContain('wrong_branch');
    expect(kinds).not.toContain('prolapse');
  });

  it('driving the route again gives the committed log, byte for byte', async () => {
    const { log } = await autoDrive(c, TARGET, best);
    expect(serialize(log)).toBe(serialize(golden.log));
  });

  it('scoring the committed log gives the committed result, byte for byte', () => {
    const r = scoreCase({ log: golden.log, optimized: f, weights: golden.weights, case: c });
    expect(serialize(r)).toBe(readFileSync(RESULT_FILE, 'utf8'));
    expect(r.reachedTarget).toBe(true);
    expect(r.stars).toBeGreaterThanOrEqual(1);
  });
});
