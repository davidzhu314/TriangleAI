import { describe, expect, it } from 'vitest';
import type { Frontier } from '../contracts';
import { loadFixtureY } from '../optimize/fixture-y.testutil';
import { mockOptimizeSync } from '../optimize/mock';
import { MOCK_FEEDBACK_TEMPLATES, fillTemplate, mockCaseResult } from './mock';

describe('mock CaseResult', () => {
  const r = mockCaseResult();
  const d = r.drive;
  const components = [d.fidelity, d.gentleness, d.radiation, d.errors];

  it('points at a route in the mock frontier', () => {
    const f = mockOptimizeSync({ caseId: r.caseId, targetId: 'left_branch' }) as Frontier;
    const route = f.routes.find((x) => x.id === r.routeId)!;
    expect(route).toBeDefined();
    expect(d.radiation.estFluoroS).toBe(route.cost.estFluoroS);
  });

  it('keeps the plan score consistent with regret (§6.1)', () => {
    expect(r.plan.decidedBy).toBe('regret');
    expect(r.plan.score).toBeCloseTo(100 * (1 - Math.min(1, r.plan.regret / r.plan.regretMax)), 9);
  });

  it('keeps the drive score the weighted sum of its components (§6.2)', () => {
    expect(components.map((c) => c.weight)).toEqual([0.25, 0.3, 0.25, 0.2]);
    expect(d.score).toBeCloseTo(components.reduce((a, c) => a + c.weight * c.score, 0), 9);
    expect(d.errors.score).toBe(Math.max(0, 100 - 10 * d.errors.wrongBranches - 15 * d.errors.prolapses - 5 * d.errors.backOuts));
    expect(d.fidelity.score).toBeCloseTo(100 * (1 - Math.min(1, (d.fidelity.meanDistanceM * 1000) / 10)), 9);
    expect(d.radiation.fluoroS).toBeLessThanOrEqual(d.radiation.estFluoroS);
    expect(d.radiation.score).toBe(100);
  });

  it('applies the star rule (§6.3) and the case fluoro budget (§6.5)', () => {
    const p = r.plan.score;
    const s = d.score;
    const expected = !r.reachedTarget ? 0 : p >= 85 && s >= 85 ? 3 : p >= 70 && s >= 60 ? 2 : 1;
    expect(r.starsBeforeBudget).toBe(expected);
    const budget = loadFixtureY().fluoroBudgetS!;
    expect(r.fluoroOverBudgetS).toBe(Math.max(0, d.radiation.fluoroS - budget));
    expect(r.stars).toBe(r.starsBeforeBudget);
  });

  it('carries three feedback lines filled only from their values (§6.4)', () => {
    expect(r.feedback).toHaveLength(3);
    for (const line of r.feedback) {
      const template = MOCK_FEEDBACK_TEMPLATES[line.template as keyof typeof MOCK_FEEDBACK_TEMPLATES];
      expect(line.text).toBe(fillTemplate(template, line.values));
      const valueNumbers = new Set(Object.values(line.values).filter((v) => typeof v === 'number').map(String));
      for (const n of line.text.match(/\d+(\.\d+)?/g) ?? []) expect(valueNumbers).toContain(n);
    }
  });

  it('models no force, matching the mock wire', () => {
    expect(d.gentleness.peakForceN).toBe(0);
    expect(d.gentleness.cumulativeForceNs).toBe(0);
  });

  it('returns a fresh object each call', () => {
    r.feedback.length = 0;
    expect(mockCaseResult().feedback).toHaveLength(3);
  });

  it('rejects a template with a missing value', () => {
    expect(() => fillTemplate('{a} and {b}', { a: 1 })).toThrow(/b/);
  });
});
