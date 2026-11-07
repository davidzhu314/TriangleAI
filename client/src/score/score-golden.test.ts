/**
 * Golden scoring: frozen event logs in tests/fixtures/logs/, each with the CaseResult it must give.
 * Scoring a log twice, and against the committed result, must match byte for byte (§6.6).
 *
 * The logs come from the rail wire driven by scripted inputs (regenerate with UPDATE_FIXTURES=1 and
 * say so in the handoff). The diamond log is V4's rail golden; only its result file is written here.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CaseResult, ControlInput, EventLog, LoadedCase, Weights, WirePresetId } from '../contracts';
import { loadFixtureY } from '../optimize/fixture-y.testutil';
import { buildGraph } from '../optimize/graph';
import { loadSynthetic } from '../optimize/graphs.testutil';
import { optimizeCase } from '../optimize/optimizer';
import { measureRanges, rankRoutes } from '../optimize/rank';
import { railAutopilot } from '../wire/rail-autopilot';
import { createRailModel, initialRailState, step, type RailModel, type RailState } from '../wire/rail';
import { RAIL_DT_S, replayRail } from '../wire/rail-source';
import { scoreCase } from './score';

const LOGS = join(import.meta.dirname, '../../../tests/fixtures/logs');

/** Weights every golden uses (normalised by the ranker). */
export const GOLDEN_WEIGHTS: Weights = { lengthM: 0.3, sharpestTurnDeg: 0.3, narrowestRadiusM: 0.2, estFluoroS: 0.2 };

interface ScoreGolden {
  description: string;
  case: string;
  weights: Weights;
  log: EventLog;
  result: CaseResult;
}

const CASES: Record<string, () => LoadedCase> = {
  'client/public/cases/fixture-y': loadFixtureY,
  'tests/fixtures/synthetic/diamond': () => loadSynthetic('diamond'),
};

function score(caseRef: string, log: EventLog, weights: Weights): CaseResult {
  const c = CASES[caseRef]!();
  const optimized = optimizeCase(buildGraph(c), { caseId: c.id, targetId: log.targetId });
  return scoreCase({ log, optimized, weights, case: c });
}

// ---------------------------------------------------------------- scripted drives (regeneration only)

interface Drive {
  model: RailModel;
  st: RailState;
  inputs: ControlInput[];
}

function startDrive(c: LoadedCase, presetId: WirePresetId, plan: string[]): Drive {
  const model = createRailModel(c, 'fem_r', 'left_branch', presetId, plan);
  return { model, st: initialRailState(model), inputs: [] };
}

function push(d: Drive, i: ControlInput) {
  d.inputs.push(i);
  d.st = step(d.model, d.st, i, RAIL_DT_S).state;
}

const idle = (fluoro: boolean): ControlInput => ({ push: 0, rotate: 0, fluoro, contrastPuff: false });

/** Autopilot to the target, then 10 idle frames. */
function finish(d: Drive, fluoro = true) {
  while (!d.st.atTarget && d.inputs.length < 9000) push(d, { ...railAutopilot(d.model, d.st, RAIL_DT_S), fluoro });
  for (let i = 0; i < 10; i++) push(d, idle(false));
}

/** Push straight (roll 0) into the right branch until s passes `toS`, or until stuck for `pushOnS` more seconds. */
function intoRight(d: Drive, toS: number, pushOnS = 0) {
  while (d.st.s < toS && d.inputs.length < 9000) {
    const before = d.st.s;
    push(d, { push: 1, rotate: 0, fluoro: true, contrastPuff: false });
    if (d.st.s === before) break;
  }
  for (let i = 0; i < Math.round(pushOnS / RAIL_DT_S); i++) push(d, { push: 1, rotate: 0, fluoro: true, contrastPuff: false });
  // back to the trunk
  while ((d.st.walked.length > 1 || d.st.prolapsed) && d.inputs.length < 9000) push(d, { push: -1, rotate: 0, fluoro: false, contrastPuff: false });
  for (let i = 0; i < 15; i++) push(d, { push: -1, rotate: 0, fluoro: false, contrastPuff: false });
}

function fixtureYDrives(): Record<string, { description: string; presetId: WirePresetId; inputs: ControlInput[] }> {
  const c = loadFixtureY();
  const f = optimizeCase(buildGraph(c), { caseId: c.id, targetId: 'left_branch' });
  if (f.kind !== 'frontier') throw new Error('fixture-y left_branch should have a frontier');
  const best = f.routes.find((r) => r.id === rankRoutes(f.routes, measureRanges(f.candidates), GOLDEN_WEIGHTS).order[0]!.routeId)!;
  const plan = best.edges;
  const make = (script: (d: Drive) => void) => {
    const d = startDrive(c, best.presetId, plan);
    script(d);
    return d.inputs;
  };
  return {
    'score-clean-fixture-y': {
      description: 'Clean drive on the best-ranked fixture-y route to the left branch, fluoro on while moving.',
      presetId: best.presetId,
      inputs: make((d) => finish(d)),
    },
    'score-wrong-branch-fixture-y': {
      description: 'Pushes straight into the right branch (wrong branch), pulls back past 20 mm (back-out), then drives the plan.',
      presetId: best.presetId,
      inputs: make((d) => {
        intoRight(d, 0.13);
        finish(d);
      }),
    },
    'score-prolapse-fixture-y': {
      description: 'Pushes into the right branch to its dead end and keeps pushing 1.5 s (prolapse, force spike), pulls back, then drives the plan.',
      presetId: best.presetId,
      inputs: make((d) => {
        intoRight(d, 1, 1.5);
        finish(d);
      }),
    },
    'score-over-budget-fixture-y': {
      description: 'Holds fluoro for 70 s before moving, then a clean drive: over the route estimate and the 60 s case allowance, so a star is lost.',
      presetId: best.presetId,
      inputs: make((d) => {
        for (let i = 0; i < 70 * 30; i++) push(d, idle(true));
        finish(d);
      }),
    },
  };
}

// ---------------------------------------------------------------- tests

const FIXTURE_Y_GOLDENS = ['score-clean-fixture-y', 'score-wrong-branch-fixture-y', 'score-prolapse-fixture-y', 'score-over-budget-fixture-y'];
const DIAMOND_RESULT = 'rail-golden-diamond-j.result.json';

describe('golden scoring', () => {
  if (process.env['UPDATE_FIXTURES'] === '1') {
    it('writes the golden files', () => {
      const c = loadFixtureY();
      for (const [name, d] of Object.entries(fixtureYDrives())) {
        const best = d.presetId;
        const plan = ['e_aorta', 'e_left'];
        const log = replayRail({ case: c, entryId: 'fem_r', targetId: 'left_branch', presetId: best, path: plan }, d.inputs);
        const caseRef = 'client/public/cases/fixture-y';
        const golden: ScoreGolden = { description: d.description, case: caseRef, weights: GOLDEN_WEIGHTS, log, result: score(caseRef, log, GOLDEN_WEIGHTS) };
        writeFileSync(join(LOGS, `${name}.json`), JSON.stringify(golden) + '\n');
      }
      const rail = JSON.parse(readFileSync(join(LOGS, 'rail-golden-diamond-j.json'), 'utf8')) as { log: EventLog };
      const result = score('tests/fixtures/synthetic/diamond', rail.log, GOLDEN_WEIGHTS);
      writeFileSync(join(LOGS, DIAMOND_RESULT), JSON.stringify({ log: 'rail-golden-diamond-j.json', case: 'tests/fixtures/synthetic/diamond', weights: GOLDEN_WEIGHTS, result }) + '\n');
    });
  }

  const load = (name: string) => JSON.parse(readFileSync(join(LOGS, `${name}.json`), 'utf8')) as ScoreGolden;

  it.each(FIXTURE_Y_GOLDENS)('%s scores identically twice and matches the committed result', (name) => {
    const g = load(name);
    const a = JSON.stringify(score(g.case, g.log, g.weights));
    const b = JSON.stringify(score(g.case, structuredClone(g.log), g.weights));
    expect(a).toBe(b);
    expect(a).toBe(JSON.stringify(g.result));
  });

  it('the V4 diamond rail golden scores identically and matches its result file', () => {
    const r = JSON.parse(readFileSync(join(LOGS, DIAMOND_RESULT), 'utf8')) as { log: string; case: string; weights: Weights; result: CaseResult };
    const log = (JSON.parse(readFileSync(join(LOGS, r.log), 'utf8')) as { log: EventLog }).log;
    expect(JSON.stringify(score(r.case, log, r.weights))).toBe(JSON.stringify(r.result));
    expect(JSON.stringify(score(r.case, log, r.weights))).toBe(JSON.stringify(r.result));
  });

  it('each golden shows what it is for', () => {
    const clean = load('score-clean-fixture-y');
    expect(clean.result.reachedTarget).toBe(true);
    expect(clean.result.plan.decidedBy).toBe('regret');
    expect(clean.result.plan.score).toBe(100);
    expect(clean.result.drive.errors.score).toBe(100);
    expect(clean.result.stars).toBe(3);

    const wrong = load('score-wrong-branch-fixture-y').result.drive.errors;
    expect([wrong.wrongBranches, wrong.backOuts, wrong.prolapses]).toEqual([1, 1, 0]);

    const pro = load('score-prolapse-fixture-y');
    expect(pro.result.drive.errors.prolapses).toBe(1);
    expect(pro.log.events.some((e) => e.kind === 'force_spike')).toBe(true);
    expect(pro.result.drive.gentleness.score).toBeLessThan(100);

    const over = load('score-over-budget-fixture-y').result;
    expect(over.fluoroOverBudgetS).toBeGreaterThan(0);
    expect(over.stars).toBe(over.starsBeforeBudget - 1);
    expect(over.feedback.some((l) => l.template === 'result.over_budget')).toBe(true);

    const diamond = (JSON.parse(readFileSync(join(LOGS, DIAMOND_RESULT), 'utf8')) as { result: CaseResult }).result;
    expect(diamond.plan.decidedBy).toBe('feasible');
    expect(diamond.plan.score).toBe(0);
    expect(diamond.feedback[0]!.template).toBe('plan.turn_too_sharp');
  });
});
