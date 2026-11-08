/**
 * G4: Cathy's answers are grounded in the engine (CLAUDE.md, spec §11: no AI model computes any number).
 *
 * For every bundled case and target, at DEFAULT_WEIGHTS:
 * - Plan answers ("best next artery", "my options": planAssist + planAssistLine), for every entry ×
 *   preset, at the empty route and every prefix of every frontier route and safe candidate:
 *   - every number in the spoken line is in its values, and `n` is the number of options;
 *   - every artery named is the vessel of an option edge, and every option edge lies on a frontier
 *     route (or on a safe candidate when the line says no frontier route continues);
 *   - along the top-ranked route (score's bestFrontierRoute), "best" is that route's next edge;
 *   - a case or wire with no safe route says the no-safe-route line, with no numbers;
 *   - the same input gives the same line.
 * - Live answers ("how am I doing": driveAssist), on rail autopilot drives of every frontier route cut
 *   at a quarter, half, three quarters and the end, plus a push-only drive that takes a wrong branch:
 *   - every number in every line is in its values;
 *   - every non-assist line is a line scoreCase gives for the same partial log;
 *   - "next" names the vessel of the plan's next edge, and "pull back" names the wrong and the
 *     expected vessels;
 *   - the same input gives the same answer.
 * Findings that aren't failures (an option count that differs from the vessels named, a "best" the
 * rail wire can't steer) are listed in metrics/gibran/cathy-qa.md with UPDATE_METRICS=1.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildGraph, DEFAULT_WEIGHTS, isSafe, optimizeCase, planAssist, PRESET_IDS, steerableAt } from '../../client/src/optimize';
import { bestFrontierRoute, driveAssist, planAssistLine, scoreCase } from '../../client/src/score';
import type { EventLog, FeedbackLine, LoadedCase, OptimizeResult, Route } from '../../client/src/contracts';
import { replayRail } from '../../client/src/wire/rail-source';
import { autoDrive, CASES_DIR, loadBundled, MAX_TICKS, machineLine, shouldWriteMetrics, writeMetrics } from './engine.testutil';

const W = DEFAULT_WEIGHTS;
const numbersIn = (s: string) => s.match(/\d+(\.\d+)?/g) ?? [];

/** Every number in the text appears in the line's values (numbers, or numbers inside string values). */
function expectGrounded(line: FeedbackLine) {
  const allowed = new Set(Object.values(line.values).flatMap((v) => (typeof v === 'number' ? [String(v)] : numbersIn(v))));
  for (const n of numbersIn(line.text)) expect(allowed, `${line.template}: "${line.text}"`).toContain(n);
}

const vesselName = (c: LoadedCase, edgeId: string) => {
  const e = c.edges.find((x) => x.id === edgeId)!;
  return c.vessels.find((v) => v.id === e.vessel)?.name ?? e.vessel;
};

/** Cut a log after its first k samples, keeping only events up to that time. */
function cut(log: EventLog, k: number): EventLog {
  const samples = log.samples.slice(0, k);
  const t = samples.at(-1)?.t ?? 0;
  return { ...log, samples, events: log.events.filter((e) => e.t <= t) };
}

const findings: { optionCount: string[]; unsteerableBest: string[]; noSafe: string[]; offFrontier: number; lines: number; drives: number; wrongBranchDrives: number } = {
  optionCount: [],
  unsteerableBest: [],
  noSafe: [],
  offFrontier: 0,
  lines: 0,
  drives: 0,
  wrongBranchDrives: 0,
};

const index = JSON.parse(readFileSync(join(CASES_DIR, 'index.json'), 'utf8')) as { cases: { id: string }[] };

for (const { id } of index.cases) {
  describe(`Cathy grounding on ${id}`, async () => {
    const c = await loadBundled(id);
    const g = buildGraph(c);

    for (const t of c.targets) {
      const res: OptimizeResult = optimizeCase(g, { caseId: c.id, targetId: t.id });

      it(`${t.id}: plan answers are grounded for every entry, wire and prefix`, () => {
        for (const entry of c.entries) {
          for (const preset of PRESET_IDS) {
            const mine = (r: Route) => r.entryId === entry.id && r.presetId === preset;
            const routes = res.kind === 'frontier' ? res.routes.filter(mine) : [];
            const safe = res.kind === 'frontier' ? res.candidates.filter((r) => mine(r) && isSafe(r)) : [];
            const prefixes = new Map<string, string[]>([['', []]]);
            for (const r of [...routes, ...safe]) for (let i = 1; i <= r.edges.length; i++) prefixes.set(r.edges.slice(0, i).join(','), r.edges.slice(0, i));

            for (const prefix of prefixes.values()) {
              const input = { optimized: res, weights: W, entryId: entry.id, presetId: preset, routeSoFar: prefix };
              const a = planAssist(input);
              expect(JSON.stringify(planAssist(input))).toBe(JSON.stringify(a));
              for (const ask of ['best', 'options'] as const) {
                const line = planAssistLine(a, c, t.id, ask);
                expect(JSON.stringify(planAssistLine(a, c, t.id, ask))).toBe(JSON.stringify(line));
                expectGrounded(line);
                findings.lines++;
                const where = `${id} → ${t.id}, ${entry.id} · ${preset}, after [${prefix.join(', ')}]`;

                if (res.kind === 'no_safe_route') {
                  expect(line.template).toBe('assist.no_safe_route');
                  expect(numbersIn(line.text)).toEqual([]);
                  continue;
                }
                if (a.options.length === 0) {
                  expect(['assist.complete', 'assist.no_continuation', 'assist.no_safe_route']).toContain(line.template);
                  expect(numbersIn(line.text)).toEqual([]);
                  continue;
                }
                // Option edges lie on the routes the answer claims to come from.
                const pool = a.reason === 'off_frontier' ? safe : routes;
                const poolEdges = new Set(pool.flatMap((r) => r.edges));
                for (const o of a.options) expect(poolEdges, where).toContain(o.edge);
                // Named arteries are the option edges' vessels.
                const named = new Set(a.options.map((o) => vesselName(c, o.edge)));
                if (typeof line.values['vessel'] === 'string') expect(named, where).toContain(line.values['vessel']);
                if (typeof line.values['vessels'] === 'string') expect(new Set(line.values['vessels'].split(', '))).toEqual(named);
                if (line.template === 'assist.options') {
                  expect(line.values['n']).toBe(a.options.length);
                  if (named.size !== a.options.length && ask === 'options') findings.optionCount.push(`${where}: "${line.text}"`);
                }
                if (a.reason === 'off_frontier' && ask === 'best') findings.offFrontier++;
              }
            }
          }
        }
      });

      if (res.kind !== 'frontier') {
        it(`${t.id}: no safe route, so Cathy says so`, () => {
          findings.noSafe.push(`${id} → ${t.id}`);
          const a = planAssist({ optimized: res, weights: W, entryId: c.entries[0]!.id, presetId: 'soft_angled', routeSoFar: [] });
          expect(planAssistLine(a, c, t.id, 'best').template).toBe('assist.no_safe_route');
        });
        continue;
      }

      it(`${t.id}: "best next artery" follows the top-ranked route at DEFAULT_WEIGHTS`, () => {
        const top = bestFrontierRoute(res, W)!;
        for (let i = 0; i < top.edges.length; i++) {
          const a = planAssist({ optimized: res, weights: W, entryId: top.entryId, presetId: top.presetId, routeSoFar: top.edges.slice(0, i) });
          expect(a.best?.edge, `${top.id} after ${i} edges`).toBe(top.edges[i]);
          expect(a.best?.routeIds).toContain(top.id);
        }
        const done = planAssist({ optimized: res, weights: W, entryId: top.entryId, presetId: top.presetId, routeSoFar: top.edges });
        expect(done.reason).toBe('complete');
        const steer = steerableAt(g, top.edges, top.presetId, g.entries.get(top.entryId));
        if (!steer.ok)
          findings.unsteerableBest.push(
            `${id} → ${t.id}: best is \`${top.entryId} · ${top.presetId} · ${top.edges.join(',')}\`; rail can't steer at ${steer.failures.map((f) => `${f.node} into ${f.edge} (takeoff ${f.takeoffDeg.toFixed(0)}° vs tip ${f.tipDeg}°)`).join('; ')}`,
          );
      });

      it(`${t.id}: "how am I doing" is grounded on drives of every frontier route`, async () => {
        for (const r of res.routes) {
          const { log } = await autoDrive(c, t.id, r);
          findings.drives++;
          const n = log.samples.length;
          for (const k of [Math.ceil(n / 4), Math.ceil(n / 2), Math.ceil((3 * n) / 4), n]) {
            const input = { log: cut(log, k), optimized: res, weights: W, case: c };
            const ans = driveAssist(input);
            expect(JSON.stringify(driveAssist(input))).toBe(JSON.stringify(ans));
            const scored = scoreCase(input).feedback.map((l) => JSON.stringify(l));
            for (const line of ans.lines) {
              expectGrounded(line);
              findings.lines++;
              if (!line.template.startsWith('assist.')) expect(scored, line.text).toContain(JSON.stringify(line));
            }
            const edge = input.log.samples.at(-1)!.edge;
            const at = r.edges.indexOf(edge);
            expect(ans.offPlan).toBeNull();
            expect(ans.nextEdge).toBe(r.edges[at + 1] ?? null);
            const next = ans.lines.find((l) => l.template === 'assist.next_branch');
            if (ans.nextEdge) expect(next?.values['vessel']).toBe(vesselName(c, ans.nextEdge));
          }
        }
      }, 60_000);

      it(`${t.id}: "pull back" is grounded after a wrong branch`, () => {
        for (const r of res.routes) {
          // Push only, no rotation: on routes that need the tip turned, the wire takes a wrong branch.
          const push = Array.from({ length: MAX_TICKS / 3 }, () => ({ push: 1, rotate: 0, fluoro: false, contrastPuff: false }));
          const full = replayRail({ case: c, entryId: r.entryId, targetId: t.id, presetId: r.presetId, path: r.edges }, push);
          const ev = full.events.find((e) => e.kind === 'wrong_branch');
          if (!ev || ev.kind !== 'wrong_branch') continue;
          findings.wrongBranchDrives++;
          // Ask a second after the wrong turn.
          const k = full.samples.findIndex((s) => s.t > ev.t + 1);
          const log = cut(full, k < 0 ? full.samples.length : k + 1);
          const ans = driveAssist({ log, optimized: res, weights: W, case: c });
          expect(ans.offPlan, `${r.id}`).not.toBeNull();
          const pull = ans.lines[0]!;
          expect(pull.template).toBe('assist.pull_back');
          expectGrounded(pull);
          expect(pull.values['wrong_vessel']).toBe(vesselName(c, ans.offPlan!.edge));
          expect(pull.values['vessel']).toBe(vesselName(c, ev.expectedEdge));
          for (const line of ans.lines) expectGrounded(line);
        }
      });
    }
  });
}

describe('Cathy QA summary', () => {
  it('writes metrics/gibran/cathy-qa.md when asked', () => {
    if (!shouldWriteMetrics()) return;
    const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`) : ['- none']);
    writeMetrics('cathy-qa.md', [
      '# G4 — Cathy QA: answer grounding',
      '',
      `Written by \`UPDATE_METRICS=1 pnpm exec vitest run tests/engine/cathy-grounding.test.ts\`. ${machineLine()}`,
      '',
      `Every bundled case (${index.cases.map((x) => `\`${x.id}\``).join(', ')}), every target, at DEFAULT_WEIGHTS. ${findings.lines} spoken lines checked over ${findings.drives} rail drives and every entry × wire × route prefix. All checks in \`tests/engine/cathy-grounding.test.ts\` pass: every number is in the line's values, every artery named is on a frontier route (or safe candidate), "best" follows the top-ranked route, live lines match scoreCase, and the same input gives the same line. No LLM is involved.`,
      '',
      `Off-frontier answers ("no frontier route continues from here"): ${findings.offFrontier} prefixes. Push-only drives that took a wrong branch and got a grounded "pull back": ${findings.wrongBranchDrives}.`,
      '',
      '## Targets with no safe route',
      '',
      ...list(findings.noSafe),
      '',
      '## Findings (not failures)',
      '',
      '### "My options" counts more ways than it names',
      '',
      'The count is the number of option edges, but the vessels are deduplicated, so two edges on one vessel read as, for example, "2 good ways on from here: Aorta."',
      '',
      ...list(findings.optionCount),
      '',
      '### "Best next artery" on a route the rail wire can\'t steer',
      '',
      'The assistant follows the top-ranked frontier route; the optimizer does not yet check steering (`cannot_steer` waits on a contract bump).',
      '',
      ...list(findings.unsteerableBest),
      '',
      '## Not covered yet',
      '',
      '- Hint counting and the "assisted" mark: see `tests/engine/cathy-hints.test.ts`. The Results mark is Aroovee\'s, after the demo.',
      '- Voice command corpus, push-to-talk timing and hand clips: after PR #22 merges.',
    ]);
  });
});
