/**
 * G1: rail acceptance on the generated cases (spec §5.7: "rail mode reaches every target on every
 * template case using the frontier routes").
 *
 * For type-iii and low-tort, every target and every frontier route: the rail autopilot reaches the
 * target with no wrong branch and no prolapse, and steerableAt accepts the route with its own preset.
 * Never loosen this check: a failure is an engine or case bug, filed to Vaibhav or David.
 */

import { describe, expect, it } from 'vitest';
import { buildGraph, optimizeCase, steerableAt } from '../../client/src/optimize';
import type { Frontier } from '../../client/src/contracts';
import { autoDrive, G1_CASES, loadBundled } from './engine.testutil';

for (const id of G1_CASES) {
  describe(`rail acceptance on ${id}`, async () => {
    const c = await loadBundled(id);
    const g = buildGraph(c);

    for (const t of c.targets) {
      const res = optimizeCase(g, { caseId: c.id, targetId: t.id });

      it(`${t.id}: the optimizer returns a frontier`, () => {
        expect(res.kind).toBe('frontier');
        expect((res as Frontier).routes.length).toBeGreaterThan(0);
      });
      if (res.kind !== 'frontier') continue;

      for (const r of res.routes) {
        const label = `${t.id}: ${r.entryId} · ${r.presetId} · ${r.edges.join(',')}`;

        it(`${label} is steerable`, () => {
          const s = steerableAt(g, r.edges, r.presetId, g.entries.get(r.entryId));
          expect(s.failures, JSON.stringify(s.failures)).toEqual([]);
          expect(s.ok).toBe(true);
        });

        it(`${label} drives to the target cleanly`, async () => {
          const { log, reached } = await autoDrive(c, t.id, r);
          const kinds = log.events.map((e) => e.kind);
          expect(reached).toBe(true);
          expect(kinds).toContain('target_reached');
          expect(kinds).not.toContain('wrong_branch');
          expect(kinds).not.toContain('prolapse');
        });
      }
    }
  });
}
