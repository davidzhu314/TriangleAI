/**
 * V1 MOCK scoring: one fixed CaseResult for the fixture-y standard_j route to the left branch,
 * with three feedback lines. Aroovee builds the Results screen and its formula tooltips on it
 * until V5.
 *
 * Every number here is a PLACEHOLDER, not a computed score. The values are kept consistent with
 * each other and with the spec's rules, so the screen shows a coherent result:
 * - plan = 100·(1 − R/Rmax)
 * - drive = Σ weight × component, with the §6.2 weights
 * - errors = 100 − 10·wrong − 15·prolapse − 5·back-out
 * - the §6.3 star rule
 * - the case's 60 s fluoro budget
 * Contact force is 0, matching the mock wire, which models no force.
 */

import type { CaseResult, FeedbackLine, FormulaRef } from '../contracts';
import { MOCK_CASE_ID, mockRouteId } from '../optimize/mock';

/** Fill `{key}` placeholders from values. Every number in the text therefore comes from `values`. */
export function fillTemplate(template: string, values: Record<string, number | string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    if (!(k in values)) throw new Error(`template value missing: ${k}`);
    return String(values[k]);
  });
}

export const MOCK_FEEDBACK_TEMPLATES = {
  'plan.top_contributor': 'Most of your penalty came from the {turn_deg}° turn into the {vessel}.',
  'drive.wrong_branch': 'You entered the {wrong_vessel} {n} times; rotate the tip toward the {target_vessel} before pushing at the branch.',
  'drive.radiation_within': 'Fluoro ran {fluoro_s} s, within the {est_fluoro_s} s estimate for this route.',
} as const;

type TemplateId = keyof typeof MOCK_FEEDBACK_TEMPLATES;

function line(template: TemplateId, values: Record<string, number | string>, formulaRef: FormulaRef): FeedbackLine {
  return { template, text: fillTemplate(MOCK_FEEDBACK_TEMPLATES[template], values), values, formulaRef };
}

/** Fresh object on every call. */
export function mockCaseResult(): CaseResult {
  return {
    caseId: MOCK_CASE_ID,
    routeId: mockRouteId('standard_j'),
    reachedTarget: true,
    plan: {
      score: 80,
      decidedBy: 'regret',
      cap: 100,
      violations: [],
      regret: 0.12,
      regretMax: 0.6,
      topContributor: { measure: 'sharpestTurnDeg', edge: 'e_left', value: 45 },
    },
    drive: {
      score: 92,
      fidelity: { score: 88, weight: 0.25, formulaRef: 'drive.fidelity', meanDistanceM: 0.0012 },
      gentleness: { score: 100, weight: 0.3, formulaRef: 'drive.gentleness', peakForceN: 0, cumulativeForceNs: 0 },
      radiation: { score: 100, weight: 0.25, formulaRef: 'drive.radiation', fluoroS: 24, estFluoroS: 31 },
      errors: { score: 75, weight: 0.2, formulaRef: 'drive.errors', wrongBranches: 2, prolapses: 0, backOuts: 1 },
      timeS: 42.5,
    },
    stars: 2,
    starsBeforeBudget: 2,
    fluoroOverBudgetS: 0,
    feedback: [
      line('plan.top_contributor', { turn_deg: 45, vessel: 'Left branch' }, 'plan.regret'),
      line('drive.wrong_branch', { wrong_vessel: 'Right branch', n: 2, target_vessel: 'Left branch' }, 'drive.errors'),
      line('drive.radiation_within', { fluoro_s: 24, est_fluoro_s: 31 }, 'drive.radiation'),
    ],
  };
}
