/**
 * Regressions found by sweeping every bundled case through the engine:
 * 1. Regret noise: on type-i-plaque → lcca the two frontier routes tie, R = Rmax = 5.6e-17, and a
 *    perfect drive on the best route scored plan 0 (1 star). It must score 100.
 * 2. Slow scoring: on the real CTA case (ts-s1404-cta) → lcca, the best-ranked frontier route can't be
 *    steered, and the gentleness reference drive retried for 300 s of simulation (2.7 s of scoring).
 *    The reference must use a steerable route and stop early, keeping scoring within budget.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CaseJson, CenterlinesJson, EventLog, Frontier, LoadedCase, Route } from '../contracts';
import { buildTestLoadedCase } from '../optimize/case-builder.testutil';
import { buildGraph } from '../optimize/graph';
import { optimizeCase } from '../optimize/optimizer';
import { DEFAULT_WEIGHTS, defaultWeights, measureRanges, rankRoutes } from '../optimize/rank';
import { steerableAt } from '../optimize/steerability';
import { planAssist } from '../optimize/assist';
import { PRESET_IDS } from '../optimize';
import { planAssistLine } from './live';
import { RailWireSource } from '../wire/rail-source';
import { snapScore } from './constants';
import { regretScore } from './plan';
import { forceReference } from './reference';
import { referenceFor, scoreCase } from './score';
import { upToTarget } from './drive';

const CASES = join(import.meta.dirname, '../../public/cases');

/**
 * The case from its JSON files only. The engine never reads the mesh, and parsing and validating a
 * real case's large vessels.glb would load the CPU enough to disturb the suite's timing tests.
 */
const cache = new Map<string, LoadedCase>();
async function bundled(id: string): Promise<LoadedCase> {
  if (!cache.has(id)) {
    const read = <T>(f: string): T => JSON.parse(readFileSync(join(CASES, id, f), 'utf8')) as T;
    cache.set(id, buildTestLoadedCase(read<CaseJson>('case.json'), read<CenterlinesJson>('centerlines.json')));
  }
  return cache.get(id)!;
}

/** An autopilot drive, capped at `maxS` of simulation (a stuck player gives up long before 200 s). */
async function autopilotLog(c: LoadedCase, targetId: string, r: Route, maxS = 200): Promise<EventLog> {
  const src = new RailWireSource({ clock: 'manual', autoDrive: true });
  let at = false;
  src.onState((s) => (at = s.atTarget));
  await src.start({ case: c, entryId: r.entryId, targetId, presetId: r.presetId, path: r.edges });
  src.control({ push: 0, rotate: 0, fluoro: true, contrastPuff: false });
  for (let i = 0; i < maxS * 30 && !at; i++) src.tick();
  return src.stop();
}

const best = (f: Frontier) => f.routes.find((r) => r.id === rankRoutes(f.routes, measureRanges(f.candidates), DEFAULT_WEIGHTS).order[0]!.routeId)!;

describe('regret noise', () => {
  it('a regret within floating-point noise of the worst case is still zero regret', () => {
    expect(regretScore(5.551115123125783e-17, 5.551115123125783e-17)).toBe(100);
    expect(regretScore(1e-12, 0.5)).toBe(100);
    expect(regretScore(0.25, 0.5)).toBe(50);
  });

  it('type-i-plaque → lcca: a perfect drive on the best route scores plan 100 and 3 stars', async () => {
    const c = await bundled('type-i-plaque');
    const f = optimizeCase(buildGraph(c), { caseId: c.id, targetId: 'lcca' }) as Frontier;
    const log = await autopilotLog(c, 'lcca', best(f));
    const r = scoreCase({ log, optimized: f, weights: DEFAULT_WEIGHTS, case: c });
    expect(r.plan).toMatchObject({ score: 100, decidedBy: 'regret', regret: 0, regretMax: 0 });
    expect(r.stars).toBe(3);
  });
});

describe('gentleness reference on a case with unsteerable frontier routes', () => {
  it('ts-s1404-cta → lcca: the reference is a steerable route, and scoring stays within its 100 ms budget', async () => {
    const c = await bundled('ts-s1404-cta');
    const g = buildGraph(c);
    const f = optimizeCase(g, { caseId: c.id, targetId: 'lcca' }) as Frontier;
    const top = best(f);
    expect(steerableAt(g, top.edges, top.presetId, g.entries.get(top.entryId)).ok).toBe(false); // the case this guards

    const log = await autopilotLog(c, 'lcca', top, 60); // a long, messy drive: a minute stuck in wrong branches
    expect(log.events.some((e) => e.kind === 'wrong_branch')).toBe(true);
    const input = { log, optimized: f, weights: DEFAULT_WEIGHTS, case: c };
    const ref = referenceFor(input);
    const used = f.routes.find((r) => r.id === ref.routeId)!;
    expect(steerableAt(g, used.edges, used.presetId, g.entries.get(used.entryId)).ok).toBe(true);
    expect(ref.reached).toBe(true);

    // warmed up, median of 7, like the other timing tests (alone it is ~26 ms; was 2.7 s)
    for (let i = 0; i < 3; i++) scoreCase(input);
    const times: number[] = [];
    for (let i = 0; i < 7; i++) {
      const t0 = performance.now();
      scoreCase(input);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    expect(times[3]!).toBeLessThan(100);
  });

  it('a reference drive that goes wrong stops at once instead of retrying for 300 s', async () => {
    const c = await bundled('ts-s1404-cta');
    const g = buildGraph(c);
    const f = optimizeCase(g, { caseId: c.id, targetId: 'lcca' }) as Frontier;
    const bad = f.routes.find((r) => !steerableAt(g, r.edges, r.presetId, g.entries.get(r.entryId)).ok)!;
    const t0 = performance.now();
    const ref = forceReference(c, bad, 30);
    expect(ref.reached).toBe(false);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

describe('scores snap to whole numbers (request from Gibran)', () => {
  it('snapScore removes floating-point dust and leaves real fractions alone', () => {
    expect(snapScore(99.99999999999997)).toBe(100);
    expect(snapScore(100.00000000000001)).toBe(100);
    expect(snapScore(5.551115123125783e-17)).toBe(0);
    expect(snapScore(87.5)).toBe(87.5);
    expect(snapScore(99.9999)).toBe(99.9999);
  });

  it('type-iii → rcca demo: the best route, driven cleanly, scores exactly 100, with regret exactly 0', async () => {
    const c = await bundled('type-iii');
    const f = optimizeCase(buildGraph(c), { caseId: c.id, targetId: 'rcca' }) as Frontier;
    const weights = defaultWeights(f.candidates);
    const top = f.routes.find((r) => r.id === rankRoutes(f.routes, measureRanges(f.candidates), weights).order[0]!.routeId)!;
    const r = scoreCase({ log: await autopilotLog(c, 'rcca', top), optimized: f, weights, case: c });
    expect(r.plan.regret).toBe(0);
    expect(r.plan.score).toBe(100);
    expect(r.drive.score).toBe(100);
    for (const k of ['fidelity', 'gentleness', 'radiation', 'errors'] as const) expect(r.drive[k].score, k).toBe(100);
  });
});

describe('rehearsal 1 findings (Gibran, team/rehearsal/2026-11-07.md)', () => {
  /** An autopilot drive to the target, then `extraTicks` more frames with fluoro still held. */
  async function heldPastTarget(c: LoadedCase, targetId: string, r: Route, extraTicks: number): Promise<EventLog> {
    const src = new RailWireSource({ clock: 'manual', autoDrive: true });
    let at = false;
    src.onState((s) => (at = s.atTarget));
    await src.start({ case: c, entryId: r.entryId, targetId, presetId: r.presetId, path: r.edges });
    src.control({ push: 0, rotate: 0, fluoro: true, contrastPuff: false });
    for (let i = 0; i < 200 * 30 && !at; i++) src.tick();
    for (let i = 0; i < extraTicks; i++) src.tick();
    return src.stop();
  }

  it('fluoro held after the target is reached is not scored', async () => {
    const c = await bundled('type-iii');
    const f = optimizeCase(buildGraph(c), { caseId: c.id, targetId: 'rcca' }) as Frontier;
    const r = best(f);
    const clean = scoreCase({ log: await heldPastTarget(c, 'rcca', r, 0), optimized: f, weights: DEFAULT_WEIGHTS, case: c });
    const held = await heldPastTarget(c, 'rcca', r, 90); // 3 s more at 30 Hz, as on stage
    const reachedT = held.events.find((e) => e.kind === 'target_reached')!.t;
    expect(held.samples.at(-1)!.t).toBeGreaterThan(reachedT + 2.5); // the log really does run on
    const scored = scoreCase({ log: held, optimized: f, weights: DEFAULT_WEIGHTS, case: c });
    expect(scored.drive).toEqual(clean.drive);
    expect(scored.stars).toBe(clean.stars);
    expect(upToTarget(held).samples.every((s) => s.t <= reachedT)).toBe(true);
  });

  it('a log that never reached the target is scored whole', async () => {
    const c = await bundled('type-iii');
    const f = optimizeCase(buildGraph(c), { caseId: c.id, targetId: 'rcca' }) as Frontier;
    const log = await autopilotLog(c, 'rcca', best(f), 2); // 2 s: nowhere near the target
    expect(log.events.some((e) => e.kind === 'target_reached')).toBe(false);
    expect(upToTarget(log)).toBe(log);
  });

  it('a top contributor of exactly 1 reads "1 point", not "1 points"', async () => {
    const c = await bundled('type-iii');
    const f = optimizeCase(buildGraph(c), { caseId: c.id, targetId: 'rcca' }) as Frontier;
    const w = { ...DEFAULT_WEIGHTS, proximityPenalty: 1 }; // risk slider far up, as in the scripted Compare beat
    const radial = f.routes.find((r) => r.entryId === 'rad_r')!;
    const res = scoreCase({ log: await autopilotLog(c, 'rcca', radial), optimized: f, weights: w, case: c });
    const lead = res.feedback.find((l) => l.template === 'plan.top_contributor')!;
    expect(lead.text).toBe('Most of your penalty came from closeness to risk zones: 1 point.');
  });
});

describe("Cathy never recommends a route the wire can't steer (request from Gibran)", () => {
  it('ts-s1404-cta → lcca: the top-ranked route is unsteerable; with the graph, "best" is a steerable one', async () => {
    const c = await bundled('ts-s1404-cta');
    const g = buildGraph(c);
    const f = optimizeCase(g, { caseId: c.id, targetId: 'lcca' }) as Frontier;
    const top = best(f);
    expect(steerableAt(g, top.edges, top.presetId, g.entries.get(top.entryId)).ok).toBe(false); // Gibran's finding
    const input = { optimized: f, weights: DEFAULT_WEIGHTS, entryId: top.entryId, presetId: top.presetId, routeSoFar: [] as string[] };
    expect(planAssist(input).best!.routeIds).toContain(top.id); // without the graph: unchanged, as before

    // with the graph: no route for this entry and wire can be steered to the lcca, so Cathy says so
    const a = planAssist({ ...input, graph: g });
    expect(a).toMatchObject({ best: null, reason: 'cannot_steer' });
    expect(a.options.length).toBeGreaterThan(0); // still listed, flagged
    expect(a.options.every((o) => o.steerable === false)).toBe(true);
    expect(planAssistLine(a, c, 'lcca', 'best').text).toBe("This wire can't steer into any of the ways on from here; try another wire or entry.");

    // another entry or wire does have a steerable best, and following it step by step builds a steerable route
    const other = f.routes.find((r) => steerableAt(g, r.edges, r.presetId, g.entries.get(r.entryId)).ok)!;
    const walked: string[] = [];
    for (let k = 0; k < other.edges.length; k++) {
      const b = planAssist({ ...input, entryId: other.entryId, presetId: other.presetId, routeSoFar: walked, graph: g });
      expect(b.best!.steerable).toBe(true);
      walked.push(b.best!.edge);
    }
    const built = f.candidates.find((r) => r.entryId === other.entryId && r.presetId === other.presetId && r.edges.join() === walked.join())!;
    expect(steerableAt(g, built.edges, built.presetId, g.entries.get(built.entryId)).ok).toBe(true);
  });

  it('every bundled case: with the graph, "best" always has a steerable route, and the spoken lines name only steerable options', async () => {
    const index = JSON.parse(readFileSync(join(CASES, 'index.json'), 'utf8')) as { cases: { id: string }[] };
    for (const { id } of index.cases) {
      const c = await bundled(id);
      const g = buildGraph(c);
      for (const t of c.targets) {
        const res = optimizeCase(g, { caseId: c.id, targetId: t.id });
        if (res.kind !== 'frontier') continue;
        for (const entry of c.entries) {
          for (const presetId of PRESET_IDS) {
            const a = planAssist({ optimized: res, weights: DEFAULT_WEIGHTS, entryId: entry.id, presetId, routeSoFar: [], graph: g });
            if (a.best) {
              const steerable = a.best.routeIds.some((rid) => {
                const r = [...res.routes, ...res.candidates].find((x) => x.id === rid)!;
                return steerableAt(g, r.edges, r.presetId, g.entries.get(r.entryId)).ok;
              });
              expect(steerable, `${id} → ${t.id}, ${entry.id} · ${presetId}`).toBe(true);
            }
            const line = planAssistLine(a, c, t.id, 'options');
            if (line.template === 'assist.options') expect(line.values['n']).toBe(a.options.filter((o) => o.steerable).length);
          }
        }
      }
    }
  });
});
