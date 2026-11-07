import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WIRE_EVENT_KINDS, type CaseResult, type EventLog, type LoadedCase, type NoSafeRoute, type Weights } from '../contracts';
import { loadFixtureY } from '../optimize/fixture-y.testutil';
import { buildGraph } from '../optimize/graph';
import { loadSynthetic } from '../optimize/graphs.testutil';
import { optimizeCase } from '../optimize/optimizer';
import { replayTimeline } from './replay';
import { bestFrontierRoute, type ScoreInput } from './score';
import { FEEDBACK_TEMPLATES, fillTemplate, type TemplateId } from './templates';

const LOGS = join(import.meta.dirname, '../../../tests/fixtures/logs');
const read = (f: string) => JSON.parse(readFileSync(join(LOGS, f), 'utf8'));

function golden(name: string): { input: ScoreInput; result: CaseResult } {
  if (name === 'rail-golden-diamond-j') {
    const r = read('rail-golden-diamond-j.result.json') as { log: string; weights: Weights; result: CaseResult };
    const c = loadSynthetic('diamond');
    const log = (read(r.log) as { log: EventLog }).log;
    return { input: { log, weights: r.weights, case: c, optimized: optimizeCase(buildGraph(c), { caseId: c.id, targetId: log.targetId }) }, result: r.result };
  }
  const g = read(`${name}.json`) as { log: EventLog; weights: Weights; result: CaseResult };
  const c: LoadedCase = loadFixtureY();
  return { input: { log: g.log, weights: g.weights, case: c, optimized: optimizeCase(buildGraph(c), { caseId: c.id, targetId: g.log.targetId }) }, result: g.result };
}

const NAMES = ['score-clean-fixture-y', 'score-wrong-branch-fixture-y', 'score-prolapse-fixture-y', 'score-over-budget-fixture-y', 'rail-golden-diamond-j'];

describe('replayTimeline (spec §6.3)', () => {
  it.each(NAMES)('%s: one ordered marker per event, duration = timeS, deterministic', (name) => {
    const { input, result } = golden(name);
    const r = replayTimeline(input);
    expect(r.markers).toHaveLength(input.log.events.length);
    expect(r.markers.map((m) => m.kind).sort()).toEqual(input.log.events.map((e) => e.kind).sort());
    for (let i = 1; i < r.markers.length; i++) {
      const a = r.markers[i - 1]!;
      const b = r.markers[i]!;
      expect(a.t < b.t || (a.t === b.t && WIRE_EVENT_KINDS.indexOf(a.kind) <= WIRE_EVENT_KINDS.indexOf(b.kind))).toBe(true);
    }
    expect(r.durationS).toBe(result.drive.timeS);
    expect(r.drivenPath).toHaveLength(input.log.samples.length);
    expect(r.bestRouteId).toBe(bestFrontierRoute(input.optimized, input.weights)!.id);
    expect(JSON.stringify(replayTimeline(structuredClone(input)))).toBe(JSON.stringify(r));
    for (const m of r.markers) {
      const id = `replay.${m.kind}` as TemplateId;
      expect(m.label).toBe(fillTemplate(FEEDBACK_TEMPLATES[id], m.values));
      const s = [...input.log.samples].reverse().find((x) => x.t <= m.t)!;
      expect(m.tip).toEqual(s.tip);
    }
  });

  it('the best path runs entry to target along the best route', () => {
    const { input } = golden('score-clean-fixture-y');
    const r = replayTimeline(input);
    const c = input.case;
    const node = (id: string) => c.nodes.find((n) => n.id === id)!.pos;
    const entry = node(c.entries.find((e) => e.id === input.log.entryId)!.node);
    const target = node(c.targets.find((t) => t.id === input.log.targetId)!.node);
    const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 9));
    close(r.bestPath[0]!, entry);
    close(r.bestPath.at(-1)!, target);
  });

  it('on the wrong-branch log the marker sits on the wrong edge, labelled with both vessels', () => {
    const { input } = golden('score-wrong-branch-fixture-y');
    const r = replayTimeline(input);
    const m = r.markers.find((x) => x.kind === 'wrong_branch')!;
    const sample = input.log.samples.find((s) => s.t === m.t)!;
    expect(sample.edge).toBe('e_right');
    expect(m.tip).toEqual(sample.tip);
    expect(m.label).toBe('Wrong branch: into the Right branch; the plan goes into the Left branch.');
    expect(r.markers.find((x) => x.kind === 'back_out')!.values['dist_mm']).toBeGreaterThan(20);
  });

  it('with no safe route, the best route is the player’s own', () => {
    const { input } = golden('score-clean-fixture-y');
    const none: NoSafeRoute = { kind: 'no_safe_route', caseId: input.case.id, targetId: input.log.targetId, reasons: [], crossings: [], suggestion: null };
    const r = replayTimeline({ ...input, optimized: none });
    expect(r.bestRouteId).toBe(`${input.log.entryId}|${input.log.presetId}|${input.log.path.join(',')}`);
    expect(r.bestPath.length).toBeGreaterThan(2);
  });
});
