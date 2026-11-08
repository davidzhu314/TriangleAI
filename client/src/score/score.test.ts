import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CaseResult, ConstraintViolation, CostVector, EventLog, Frontier, FrontierRoute, NoSafeRoute, Route, Weights } from '../contracts';
import { createEventLog } from '../contracts';
import { loadFixtureY } from '../optimize/fixture-y.testutil';
import { buildGraph } from '../optimize/graph';
import { optimizeCase, routeFor } from '../optimize/optimizer';
import { railAutopilot } from '../wire/rail-autopilot';
import { createRailModel, initialRailState, step } from '../wire/rail';
import { RAIL_DT_S, replayRail } from '../wire/rail-source';
import { DRIVE_WEIGHTS, ERROR_PENALTY, FIDELITY_ZERO_M, PLAN_CAPS } from './constants';
import {
  errorsScore,
  fidelityScore,
  gentlenessPart,
  gentlenessScore,
  meanTipDistanceM,
  pointSegmentDistance,
  radiationScore,
  sampleTotals,
  timeOf,
} from './drive';
import { buildFeedback, MEASURE_DISPLAY, Names, planLines, violationLine } from './feedback';
import { scoreAttempt } from './index';
import { planScore, regretScore } from './plan';
import { forceReference } from './reference';
import { playerRoute, routeIdOfLog } from './route-of-log';
import { scoreCase } from './score';
import { applyFluoroBudget, starsFor } from './stars';
import { FEEDBACK_TEMPLATES, fillTemplate, round, type TemplateId } from './templates';

const LOGS = join(import.meta.dirname, '../../../tests/fixtures/logs');
const W: Weights = { lengthM: 0.3, sharpestTurnDeg: 0.3, narrowestRadiusM: 0.2, estFluoroS: 0.2 };

// ---------------------------------------------------------------- hand-made routes for the plan checks

const baseCost: CostVector = {
  lengthM: 0.2,
  sharpestTurnDeg: 40,
  totalTurningDeg: 100,
  narrowestRadiusM: 0.004,
  heavyCrossings: 0,
  proximityPenalty: 0,
  estFluoroS: 20,
};

function mk(id: string, cost: Partial<CostVector> = {}, extra: Partial<Route> = {}): Route {
  return {
    id,
    entryId: 'in',
    targetId: 't',
    presetId: 'standard_j',
    edges: [id],
    nodes: ['a', 'b'],
    feasible: true,
    cost: { ...baseCost, ...cost },
    violations: [],
    crossings: [],
    sharpestTurnEdge: id,
    ...extra,
  };
}

function frontierOf(front: Route[], others: Route[]): Frontier {
  const routes: FrontierRoute[] = front.map((r) => ({ ...r, labels: [] }));
  return { kind: 'frontier', caseId: 'x', targetId: 't', minHeavyCrossings: 0, routes, candidates: [...front, ...others], recordedRunsUsed: false };
}

// A: short and sharp; B: long and gentle; C: dominated by A; H: shortest but crosses a heavy zone;
// X: infeasible. On length only, A is best (S 0) and B worst (S 1).
const A = mk('A', { lengthM: 0.1, sharpestTurnDeg: 60 });
const B = mk('B', { lengthM: 0.3, sharpestTurnDeg: 20 });
const C = mk('C', { lengthM: 0.2, sharpestTurnDeg: 70 });
const H = mk('H', { lengthM: 0.05, heavyCrossings: 1 }, { crossings: [{ zone: 'plaque', tier: 'heavy', edge: 'H' }] });
const X = mk('X', { lengthM: 0.02 }, { feasible: false, violations: [{ kind: 'turn_too_sharp', edge: 'X', turnDeg: 120, maxTurnDeg: 80 }] });
const F = frontierOf([A, B], [C, H, X]);

describe('plan score checks (§6.1)', () => {
  it('1. infeasible: score 0, cap 0, with the violated constraint', () => {
    const p = planScore(X, F, { lengthM: 1 });
    expect(p).toMatchObject({ score: 0, cap: PLAN_CAPS.feasible, decidedBy: 'feasible' });
    expect(p.violations).toEqual(X.violations);
  });

  it('2. heavy crossings above the minimum: cap 40, names the zone and the best safe route', () => {
    const p = planScore(H, F, { lengthM: 1 });
    expect(p).toMatchObject({ cap: 40, decidedBy: 'heavy_crossings', zoneCrossed: 'plaque', saferRouteId: 'A' });
    expect(p.score).toBeLessThanOrEqual(40);
    expect(p.score).toBe(40); // H is shorter than A, so its regret part is 100, capped
  });

  it('3. off the frontier: cap 80, names the best-ranked route that dominates it', () => {
    const p = planScore(C, F, { lengthM: 1 });
    expect(p).toMatchObject({ cap: 80, decidedBy: 'frontier', dominatedByRouteId: 'A' });
    // on length C is halfway between A (S 0) and B (S 1): regret part 50, under the cap
    expect(p.score).toBeCloseTo(50, 9);
  });

  it('a cap only lowers the score: min(cap, regret part)', () => {
    const p = planScore(C, F, { sharpestTurnDeg: 1 }); // C is the sharpest: regret part 0
    expect(p.score).toBe(0);
    expect(p.cap).toBe(80);
  });

  it('4. regret: R = S(player) − min S over the frontier, Rmax = worst feasible − that min', () => {
    // ranges come from the feasible candidates A, B, C, H: length 0.05..0.3, turn 20..70
    const p = planScore(B, F, { lengthM: 1 });
    expect(p).toMatchObject({ decidedBy: 'regret', cap: 100 });
    expect(p.regret).toBeCloseTo(1 - 0.2, 12); // B 1, A 0.2
    expect(p.regretMax).toBeCloseTo(1 - 0.2, 12); // worst feasible is B itself
    expect(p.score).toBeCloseTo(0, 9);
    expect(planScore(A, F, { lengthM: 1 }).score).toBe(100);
    // weights 1:3 → A 0.05 + 0.6 = 0.65, B 0.25, C 0.9 (worst), H 0.3 (not on the frontier)
    const mixed = planScore(A, F, { lengthM: 1, sharpestTurnDeg: 3 });
    expect(mixed.regret).toBeCloseTo(0.4, 12);
    expect(mixed.regretMax).toBeCloseTo(0.65, 12);
    expect(mixed.score).toBeCloseTo(100 * (1 - 0.4 / 0.65), 9);
  });

  it('Rmax = 0 gives the regret part 100', () => {
    expect(regretScore(0, 0)).toBe(100);
    expect(regretScore(0.3, 0)).toBe(100);
    const flat = frontierOf([mk('P'), mk('Q')], []);
    expect(planScore(flat.routes[1]!, flat, W)).toMatchObject({ score: 100, regret: 0, regretMax: 0 });
  });

  it('reports the top contributor to R, with the edge for the sharpest turn', () => {
    expect(planScore(B, F, { lengthM: 1 }).topContributor).toEqual({ measure: 'lengthM', value: 0.3 });
    expect(planScore(A, F, { sharpestTurnDeg: 1 }).topContributor).toEqual({ measure: 'sharpestTurnDeg', value: 60, edge: 'A' });
    expect(planScore(A, F, { lengthM: 1 }).topContributor).toBeUndefined();
  });

  describe('no safe route (no frontier): the §6.1 caps still decide', () => {
    const none: NoSafeRoute = { kind: 'no_safe_route', caseId: 'x', targetId: 't', reasons: X.violations, crossings: [], suggestion: null };

    it('an infeasible route scores 0 with its own violations', () => {
      const own = mk('Y', {}, { feasible: false, violations: [{ kind: 'forbidden_zone', edge: 'Y', zone: 'z' }] });
      expect(planScore(own, none, W)).toMatchObject({ score: 0, decidedBy: 'feasible', cap: 0, violations: own.violations, regret: 0, regretMax: 0 });
    });

    it('a feasible route over a heavy zone is capped at 40, with no safer route to name', () => {
      const p = planScore(H, none, W);
      expect(p).toMatchObject({ score: 40, decidedBy: 'heavy_crossings', cap: 40, zoneCrossed: 'plaque', violations: [], regret: 0, regretMax: 0 });
      expect(p.saferRouteId).toBeUndefined();
    });

    it('otherwise falls back to 0 with the optimizer’s reasons', () => {
      expect(planScore(A, none, W)).toMatchObject({ score: 0, decidedBy: 'feasible', cap: 0, violations: X.violations });
    });
  });
});

// ---------------------------------------------------------------- drive components (§6.2)

describe('drive components at their edges (§6.2)', () => {
  it('fidelity: 0 mm → 100, 5 mm → 50, ≥ 10 mm → 0', () => {
    expect(fidelityScore(0)).toBe(100);
    expect(fidelityScore(FIDELITY_ZERO_M / 2)).toBeCloseTo(50, 12);
    expect(fidelityScore(FIDELITY_ZERO_M)).toBe(0);
    expect(fidelityScore(0.05)).toBe(0);
  });

  it('fidelity measures the tip against the nearest point on any planned segment', () => {
    expect(pointSegmentDistance([0, 1, 0], [-1, 0, 0], [1, 0, 0])).toBe(1);
    expect(pointSegmentDistance([3, 4, 0], [-1, 0, 0], [0, 0, 0])).toBe(5); // past the end
    const log = createEventLog({ mode: 'rail', caseId: 'x', entryId: 'in', targetId: 't', presetId: 'standard_j', path: [] });
    log.samples.push({ t: 0, tip: [0, 0.002, 0], s: 0, edge: 'e', forceN: 0, fluoro: false });
    log.samples.push({ t: 1 / 30, tip: [0.5, 0.004, 0], s: 0, edge: 'e', forceN: 0, fluoro: false });
    expect(meanTipDistanceM(log, [[[0, 0, 0], [1, 0, 0]]])).toBeCloseTo(0.003, 15);
  });

  it('gentleness: 100 at or under the reference, 0 at reference + 2 × max(reference, floor)', () => {
    expect(gentlenessPart(0.5, 0.5, 0.1)).toBe(100);
    expect(gentlenessPart(1.0, 0.5, 0.1)).toBeCloseTo(50, 12);
    expect(gentlenessPart(1.5, 0.5, 0.1)).toBe(0);
    expect(gentlenessPart(0.1, 0, 0.1)).toBeCloseTo(50, 12); // floor when the reference is 0
    expect(gentlenessScore(1.0, 0.1, { peakForceN: 0.5, cumulativeForceNs: 0.1 })).toBeCloseTo(75, 12);
  });

  it('radiation: within the estimate → 100, 1.5× → 50, 2× → 0; estimate 0 → any fluoro is 0', () => {
    expect(radiationScore(20, 20)).toBe(100);
    expect(radiationScore(5, 20)).toBe(100);
    expect(radiationScore(30, 20)).toBeCloseTo(50, 12);
    expect(radiationScore(40, 20)).toBe(0);
    expect(radiationScore(1, 0)).toBe(0);
    expect(radiationScore(0, 0)).toBe(100);
  });

  it('errors: −10 per wrong branch, −15 per prolapse, −5 per back-out, floor 0', () => {
    expect(errorsScore(0, 0, 0)).toBe(100);
    expect(errorsScore(1, 1, 1)).toBe(100 - ERROR_PENALTY.wrongBranch - ERROR_PENALTY.prolapse - ERROR_PENALTY.backOut);
    expect(errorsScore(5, 4, 3)).toBe(0);
  });

  it('totals: force and fluoro from the samples at 1/sampleHz each; time from target_reached, else the last sample', () => {
    const log = createEventLog({ mode: 'rail', caseId: 'x', entryId: 'in', targetId: 't', presetId: 'standard_j', path: [] });
    for (let i = 0; i < 4; i++) log.samples.push({ t: i / 30, tip: [0, 0, 0], s: 0, edge: 'e', forceN: i * 0.1, fluoro: i % 2 === 0 });
    const t = sampleTotals(log);
    expect(t.peakForceN).toBeCloseTo(0.3, 12);
    expect(t.cumulativeForceNs).toBeCloseTo(0.6 / 30, 12);
    expect(t.fluoroS).toBeCloseTo(2 / 30, 12);
    expect(timeOf(log)).toBeCloseTo(3 / 30, 12);
    log.events.push({ kind: 'target_reached', t: 0.05, target: 't' });
    expect(timeOf(log)).toBe(0.05);
  });

  it('weights are the spec’s 25/30/25/20', () => {
    expect(Object.values(DRIVE_WEIGHTS)).toEqual([0.25, 0.3, 0.25, 0.2]);
  });
});

// ---------------------------------------------------------------- stars and budget (§6.3, §6.5)

describe('stars (§6.3) and the radiation budget (§6.5)', () => {
  it('0 if the target was not reached, whatever the scores', () => expect(starsFor(false, 100, 100)).toBe(0));
  it('1 for reaching the target', () => expect(starsFor(true, 69.9, 100)).toBe(1));
  it('2 for plan ≥ 70 and drive ≥ 60', () => {
    expect(starsFor(true, 70, 60)).toBe(2);
    expect(starsFor(true, 70, 59.99)).toBe(1);
  });
  it('3 for both ≥ 85', () => {
    expect(starsFor(true, 85, 85)).toBe(3);
    expect(starsFor(true, 85, 84.99)).toBe(2);
  });
  it('over the allowance costs a star, never below 1 when reached', () => {
    expect(applyFluoroBudget(3, true, 70, 60)).toEqual({ stars: 2, overS: 10 });
    expect(applyFluoroBudget(1, true, 70, 60)).toEqual({ stars: 1, overS: 10 });
    expect(applyFluoroBudget(0, false, 70, 60)).toEqual({ stars: 0, overS: 10 });
    expect(applyFluoroBudget(3, true, 60, 60)).toEqual({ stars: 3, overS: 0 });
    expect(applyFluoroBudget(3, true, 500, undefined)).toEqual({ stars: 3, overS: 0 });
  });
});

// ---------------------------------------------------------------- feedback templates (§6.4)

const numbersIn = (s: string) => s.match(/\d+(\.\d+)?/g) ?? [];

function expectGrounded(line: { text: string; values: Record<string, number | string> }) {
  const allowed = new Set(Object.values(line.values).flatMap((v) => (typeof v === 'number' ? [String(v)] : numbersIn(v))));
  for (const n of numbersIn(line.text)) expect(allowed, `${n} in "${line.text}"`).toContain(n);
}

const SAMPLE_VALUES: Record<TemplateId, Record<string, number | string>> = {
  'plan.too_narrow': { vessel: 'Left branch', diameter_mm: 1.6, preset: 'Standard J', required_mm: 1.89 },
  'plan.turn_too_sharp': { turn_deg: 120, vessel: 'Left subclavian', preset: 'Standard J', max_turn_deg: 80 },
  'plan.forbidden_zone': { zone: 'the dissection in the Aorta' },
  'plan.arch_never_reached': { preset: 'Stiff straight' },
  'plan.cannot_steer': { takeoff_deg: 73, vessel: 'Left common carotid', preset: 'Soft angled', tip_deg: 45 },
  'plan.blocked_at': { preset: 'Soft angled', vessel: 'Left branch' },
  'plan.blocked': { preset: 'Soft angled' },
  'plan.no_safe_route': { target: 'Right branch' },
  'plan.heavy_crossing_shorter': { dl_cm: 2.4, zone: 'the plaque in the Right branch', route: 'Soft angled wire through Aorta → Left branch' },
  'plan.heavy_crossing': { zone: 'the plaque in the Right branch', route: 'Soft angled wire through Aorta → Left branch' },
  'plan.heavy_crossing_no_alt': { zone: 'the plaque in the Right branch', target: 'Right branch' },
  'plan.dominated': { route: 'Soft angled wire through Aorta → Left branch' },
  'plan.top_contributor_turn': { turn_deg: 120, vessel: 'Left subclavian' },
  'plan.top_contributor': { measure: 'route length', value: 18.2, unit: 'cm' },
  'plan.best': {},
  'drive.not_reached': { target: 'Left branch' },
  'drive.fidelity_drift': { mean_mm: 3.8, zero_mm: 10 },
  'drive.gentleness': { peak_n: 0.6, ref_peak_n: 0.094, cum_ns: 0.924, ref_cum_ns: 0.004 },
  'drive.force_spike': { threshold_n: 0.5, n: 2 },
  'drive.radiation_within': { fluoro_s: 7.5, est_fluoro_s: 16.5 },
  'drive.radiation_over': { fluoro_s: 30, over_s: 13.5, est_fluoro_s: 16.5 },
  'drive.wrong_branch': { n: 2, wrong_vessel: 'Right branch', target_vessel: 'Left branch' },
  'drive.prolapse': { n: 1, vessel: 'Right branch' },
  'drive.back_out': { n: 1, penalty: 5 },
  'result.over_budget': { over_s: 17.5, budget_s: 60 },
  'result.over_budget_kept': { over_s: 17.5, budget_s: 60 },
  'replay.wrong_branch': { vessel: 'Right branch', expected_vessel: 'Left branch' },
  'replay.prolapse': { vessel: 'Right branch' },
  'replay.force_spike': { force_n: 0.6, threshold_n: 0.5 },
  'replay.back_out': { dist_mm: 21 },
  'replay.contrast_puff': {},
  'replay.target_reached': { target: 'Left branch' },
  'assist.next_branch': { vessel: 'Left branch' },
  'assist.pull_back': { wrong_vessel: 'Right branch', vessel: 'Left branch' },
  'assist.at_target': { target: 'Left branch' },
  'assist.best_route': { vessel: 'Left branch', label: 'shortest' },
  'assist.best_route_plain': { vessel: 'Left branch' },
  'assist.options': { n: 2, vessels: 'Left branch, Right branch' },
  'assist.off_frontier': { vessels: 'Left branch' },
  'assist.complete': { target: 'Left branch' },
  'assist.no_continuation': { target: 'Left branch' },
  'assist.no_safe_route': {},
  'assist.wrong_branch_ahead': { wrong_vessel: 'Right branch', vessel: 'Left branch', direction: 'left' },
  'assist.wrong_branch_ahead_no_roll': { wrong_vessel: 'Right branch', vessel: 'Left branch' },
  'assist.on_plan': { vessel: 'Left branch' },
  'assist.on_plan_last': { target: 'Left branch target' },
  'assist.mark_cannot_steer': { vessel: 'Left vertebral' },
  'assist.mark_off_frontier': { vessel: 'Left subclavian' },
  'assist.mark_heavy_zone': { vessel: 'Aortic arch', zone: 'the calcified plaque in the Aortic arch' },
  'assist.no_answer': {},
  'assist.cannot_steer': {},
};

describe('feedback templates (§6.4)', () => {
  const ids = Object.keys(FEEDBACK_TEMPLATES) as TemplateId[];

  it.each(ids)('%s has no number of its own and fills only from its values', (id) => {
    const template = FEEDBACK_TEMPLATES[id];
    expect(numbersIn(template.replace(/\{\w+\}/g, ''))).toEqual([]);
    const keys = [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    expect(Object.keys(SAMPLE_VALUES[id]).sort()).toEqual(keys);
    const text = fillTemplate(template, SAMPLE_VALUES[id]);
    expect(text).not.toMatch(/[{}]/);
    expectGrounded({ text, values: SAMPLE_VALUES[id] });
  });

  it('throws on a missing value', () => expect(() => fillTemplate('{a} and {b}', { a: 1 })).toThrow(/b/));

  it('rounds for display without "-0"', () => {
    expect(round(-0.0001, 2)).toBe(0);
    expect(String(round(-0.0001, 2))).toBe('0');
    expect(round(1.005, 1)).toBe(1);
    expect(MEASURE_DISPLAY.lengthM.unit).toBe('cm');
  });

  const c = loadFixtureY();
  const n = new Names(c);

  it('a line for each constraint kind, numbers in display units', () => {
    expect(violationLine({ kind: 'too_narrow', edge: 'e_left', diameterM: 0.0016, requiredM: 0.001889 }, 'standard_j', n)).toMatchObject({
      template: 'plan.too_narrow',
      text: 'Route blocked: the Left branch narrows to 1.6 mm, and the Standard J wire needs 1.89 mm.',
      formulaRef: 'plan.feasible',
    });
    expect(violationLine({ kind: 'turn_too_sharp', edge: 'e_left', turnDeg: 119.6, maxTurnDeg: 80 }, 'standard_j', n).text).toBe(
      'Route blocked: the 120° turn into the Left branch is sharper than the Standard J wire can take (80°).',
    );
    expect(violationLine({ kind: 'forbidden_zone', edge: 'e_right', zone: 'plaque_r' }, 'standard_j', n).text).toBe(
      'Route blocked: it passes through the plaque in the Right branch, a no-go zone.',
    );
    expect(violationLine({ kind: 'arch_never_reached', presetId: 'stiff_straight', target: 'left_branch' }, 'stiff_straight', n).template).toBe(
      'plan.arch_never_reached',
    );
    // a kind the contract gains later (cannot_steer) is still explained, never dropped
    const later = (v: object) => violationLine(v as ConstraintViolation, 'soft_angled', n);
    expect(later({ kind: 'cannot_steer', edge: 'e_left', takeoffDeg: 73, tipDeg: 45, toleranceDeg: 25 }).text).toBe(
      "Route blocked: the branch into the Left branch leaves at 73°, beyond what the Soft angled wire's 45° tip can point into.",
    );
    expect(later({ kind: 'something_new' }).text).toBe("Route blocked: the Soft angled wire can't take this route.");
  });

  it('plan lines for heavy crossing (shorter or not), dominated, top contributor and best', () => {
    const safer = mk('S', { lengthM: 0.15 }, { presetId: 'soft_angled', edges: ['e_aorta', 'e_left'] });
    const player = mk('P', { lengthM: 0.126 }, { edges: ['e_aorta', 'e_right'] });
    const f = frontierOf([safer], [player]);
    const heavy = (zoneCrossed: string) => ({ plan: { score: 40, decidedBy: 'heavy_crossings' as const, cap: 40, violations: [], zoneCrossed, saferRouteId: 'S', regret: 0, regretMax: 0 } });
    expect(planLines(heavy('plaque_r'), player, f, n, 'left_branch')[0]!.text).toBe(
      'Your route was 2.4 cm shorter but crossed the plaque in the Right branch. The Soft angled wire through Aorta → Left branch avoids it.',
    );
    const longer = { ...player, cost: { ...player.cost, lengthM: 0.2 } };
    expect(planLines(heavy('plaque_r'), longer, f, n, 'left_branch')[0]!.template).toBe('plan.heavy_crossing');
    const dom = { plan: { score: 80, decidedBy: 'frontier' as const, cap: 80, violations: [], dominatedByRouteId: 'S', regret: 0, regretMax: 0 } };
    expect(planLines(dom, player, f, n, 'left_branch')[0]!.template).toBe('plan.dominated');
    const top = (t: CaseResult['plan']['topContributor']): Pick<CaseResult, 'plan'> => {
      const plan: CaseResult['plan'] = { score: 50, decidedBy: 'regret', cap: 100, violations: [], regret: 0.1, regretMax: 0.2 };
      if (t) plan.topContributor = t;
      return { plan };
    };
    expect(planLines(top({ measure: 'sharpestTurnDeg', edge: 'e_left', value: 45.2 }), player, f, n, 'left_branch')[0]!.text).toBe(
      'Most of your penalty came from the 45° turn into the Left branch.',
    );
    expect(planLines(top({ measure: 'lengthM', value: 0.1823 }), player, f, n, 'left_branch')[0]!.text).toBe(
      'Most of your penalty came from route length: 18.2 cm.',
    );
    expect(planLines(top(undefined), player, f, n, 'left_branch')[0]!.template).toBe('plan.best');
  });

  it('every line in every golden result is grounded in its values', () => {
    const files = ['score-clean-fixture-y', 'score-wrong-branch-fixture-y', 'score-prolapse-fixture-y', 'score-over-budget-fixture-y'];
    for (const f of files) {
      const r = (JSON.parse(readFileSync(join(LOGS, `${f}.json`), 'utf8')) as { result: CaseResult }).result;
      for (const line of r.feedback) {
        expect(line.text).toBe(fillTemplate(FEEDBACK_TEMPLATES[line.template as TemplateId], line.values));
        expectGrounded(line);
      }
    }
  });
});

// ---------------------------------------------------------------- whole attempts

function driveLog(target: 'left_branch' | 'right_branch', presetId: Route['presetId'], path: string[]): EventLog {
  const c = loadFixtureY();
  const model = createRailModel(c, 'fem_r', target, presetId, path);
  let st = initialRailState(model);
  const inputs = [];
  while (!st.atTarget && inputs.length < 3000) {
    const i = { ...railAutopilot(model, st, RAIL_DT_S), fluoro: true };
    inputs.push(i);
    st = step(model, st, i, RAIL_DT_S).state;
  }
  return replayRail({ case: c, entryId: 'fem_r', targetId: target, presetId, path }, inputs);
}

describe('scoreCase', () => {
  const c = loadFixtureY();
  const optimizeFor = (targetId: string) => optimizeCase(buildGraph(c), { caseId: c.id, targetId });

  it('target not reached: 0 stars, both scores still computed, that line first', () => {
    const full = driveLog('left_branch', 'soft_angled', ['e_aorta', 'e_left']);
    const cut = full.events.find((e) => e.kind === 'target_reached')!.t;
    const log: EventLog = { ...full, samples: full.samples.filter((s) => s.t < cut - 1), events: full.events.filter((e) => e.kind !== 'target_reached') };
    const r = scoreCase({ log, optimized: optimizeFor('left_branch'), weights: W, case: c });
    expect(r.reachedTarget).toBe(false);
    expect([r.stars, r.starsBeforeBudget]).toEqual([0, 0]);
    expect(r.plan.score).toBe(100);
    expect(r.drive.score).toBeGreaterThan(0);
    expect(r.feedback[0]).toMatchObject({ template: 'drive.not_reached', text: 'The wire did not reach the Left branch.', formulaRef: 'result.stars' });
    expect(r.drive.timeS).toBe(log.samples.at(-1)!.t);
  });

  it('no safe route (fixture-y right branch crosses a heavy plaque): a feasible route is capped at 40 and says so', () => {
    const optimized = optimizeFor('right_branch');
    expect(optimized.kind).toBe('no_safe_route');
    const log = driveLog('right_branch', 'soft_angled', ['e_aorta', 'e_right']);
    const r = scoreCase({ log, optimized, weights: W, case: c });
    expect(r.plan).toMatchObject({ score: 40, decidedBy: 'heavy_crossings', cap: 40, zoneCrossed: 'plaque_r' });
    expect(r.plan.saferRouteId).toBeUndefined();
    expect(r.reachedTarget).toBe(true);
    expect(r.stars).toBe(1);
    expect(r.feedback[0]).toMatchObject({
      template: 'plan.heavy_crossing_no_alt',
      text: 'Your route crossed the plaque in the Right branch. No route to the Right branch with these entries and wires avoids a heavy risk zone.',
    });
    // reference: the player's own path, as there is no frontier
    expect(r.drive.gentleness.score).toBe(100);
  });

  it('a route the optimizer did not enumerate is measured with the same checks', () => {
    const f = optimizeFor('left_branch') as Frontier;
    const log = driveLog('left_branch', 'standard_j', ['e_aorta', 'e_left']);
    const id = routeIdOfLog(log);
    const listed = f.candidates.find((r) => r.id === id)!;
    const without: Frontier = { ...f, candidates: f.candidates.filter((r) => r.id !== id) };
    const got = playerRoute(log, without, c);
    expect(got.inCandidates).toBe(false);
    expect(got.route).toEqual(listed);
    expect(routeFor(buildGraph(c), 'fem_r', 'left_branch', 'stiff_straight', ['e_aorta', 'e_left']).feasible).toBe(false);
  });

  it('the gentleness reference is the best-ranked frontier route driven by the autopilot', () => {
    const f = optimizeFor('left_branch') as Frontier;
    const ref = forceReference(c, f.routes[0]!, 30);
    expect(ref.reached).toBe(true);
    expect(ref.peakForceN).toBeGreaterThanOrEqual(0);
    expect(forceReference(c, f.routes[0]!, 30)).toEqual(ref);
  });

  it('rejects a log for another case or target', () => {
    const log = driveLog('left_branch', 'soft_angled', ['e_aorta', 'e_left']);
    expect(() => scoreCase({ log: { ...log, caseId: 'other' }, optimized: optimizeFor('left_branch'), weights: W, case: c })).toThrow(/case mismatch/);
    expect(() => scoreCase({ log, optimized: optimizeFor('right_branch'), weights: W, case: c })).toThrow(/target/);
  });

  it('feedback leads with something to change: a "best plan" line goes after the drive lines that took points off', () => {
    const load = (f: string) => (JSON.parse(readFileSync(join(LOGS, f), 'utf8')) as { result: CaseResult }).result;
    const pro = load('score-prolapse-fixture-y.json').feedback.map((l) => l.template);
    expect(pro[0]).toBe('drive.fidelity_drift'); // the lowest drive component, not praise
    expect(pro.indexOf('plan.best')).toBeGreaterThan(pro.indexOf('drive.back_out'));
    expect(pro.indexOf('drive.fidelity_drift')).toBeLessThan(pro.indexOf('drive.wrong_branch')); // lowest component first
    expect(pro.at(-1)).toBe('drive.radiation_within'); // neutral notes stay last
    // a star lost to the budget is something to change: it leads
    expect(load('score-over-budget-fixture-y.json').feedback[0]!.template).toBe('result.over_budget');
    // a clean drive has nothing to change, so the plan line leads
    expect(load('score-clean-fixture-y.json').feedback[0]!.template).toBe('plan.best');
    // a plan check that cost points (here: infeasible) still leads
    expect(load('rail-golden-diamond-j.result.json').feedback[0]!.template).toBe('plan.turn_too_sharp');
    expect(buildFeedback).toBeTypeOf('function');
  });

  it('scoreAttempt in a real build runs the real scoring', async () => {
    const log = driveLog('left_branch', 'soft_angled', ['e_aorta', 'e_left']);
    const input = { log, optimized: optimizeFor('left_branch'), weights: W, case: c };
    expect(JSON.stringify(await scoreAttempt(input))).toBe(JSON.stringify(scoreCase(input)));
  });
});
