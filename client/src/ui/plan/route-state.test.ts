/**
 * Route building on the real engine and fixture-y (loaded with David's loadCase). Expected values come from the
 * engine's own routeFor, never typed in. Node ids are read from the graph, not from fixture-y by name, except to
 * pick which target a test drives toward.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCase } from '../../case';
import type { LoadedCase } from '../../contracts';
import { buildGraph, routeFor, WIRE_PRESETS, type RouteGraph } from '../../optimize';
import { choose, clear, endNode, evaluate, extendTo, isComplete, nextSteps, undo, type RouteState } from './route-state';

const DIR = join(process.cwd(), 'client', 'public', 'cases', 'fixture-y');
let c: LoadedCase;
let graph: RouteGraph;
let start: RouteState;

beforeAll(async () => {
  const files = Object.fromEntries(['case.json', 'centerlines.json', 'vessels.glb'].map((n) => [n, new Uint8Array(readFileSync(join(DIR, n)))]));
  const r = await loadCase({ kind: 'files', origin: 'bundled', files });
  if (!r.ok) throw new Error('fixture-y did not load');
  c = r.case;
  graph = buildGraph(c);
  start = { entryId: c.entries[0]!.id, targetId: c.targets[0]!.id, presetId: WIRE_PRESETS[0]!.id, edges: [] };
});

/** Walk toward the state's target by always taking the step that leads to it, or the only step. */
function walkToTarget(s: RouteState): RouteState {
  let cur = s;
  for (let i = 0; i < 20 && !isComplete(graph, cur); i++) {
    const steps = nextSteps(graph, cur);
    const goal = graph.targets.get(cur.targetId);
    const step = steps.find((x) => x.node === goal) ?? steps.find((x) => !c.targets.some((t) => graph.targets.get(t.id) === x.node)) ?? steps[0];
    if (!step) break;
    cur = extendTo(graph, cur, step.node)!;
  }
  return cur;
}

describe('route building', () => {
  it('starts at the entry with steps only along edges touching it', () => {
    expect(endNode(graph, start)).toBe(graph.entries.get(start.entryId));
    const steps = nextSteps(graph, start);
    expect(steps.length).toBeGreaterThan(0);
    for (const st of steps) expect(graph.adjacency.get(endNode(graph, start)!)).toContain(st.edgeId);
  });

  it('refuses a node that is not one step from the route end', () => {
    const far = graph.targets.get(start.targetId)!;
    expect(nextSteps(graph, start).some((x) => x.node === far)).toBe(false);
    expect(extendTo(graph, start, far)).toBeNull();
  });

  it('never revisits a node: the previous node is not offered again', () => {
    const one = extendTo(graph, start, nextSteps(graph, start)[0]!.node)!;
    expect(nextSteps(graph, one).map((x) => x.node)).not.toContain(graph.entries.get(start.entryId));
  });

  it('completes only when the route ends on the chosen target, and then offers no more steps', () => {
    const done = walkToTarget(start);
    expect(isComplete(graph, done)).toBe(true);
    expect(endNode(graph, done)).toBe(graph.targets.get(start.targetId));
    expect(nextSteps(graph, done)).toEqual([]);
    expect(isComplete(graph, undo(done))).toBe(false);
  });

  it('undo removes the last step and clear removes all of them', () => {
    const done = walkToTarget(start);
    expect(undo(done).edges).toEqual(done.edges.slice(0, -1));
    expect(clear(done).edges).toEqual([]);
    expect(undo(start).edges).toEqual([]);
  });

  it('a new entry clears the route; a new target or preset keeps it', () => {
    const done = walkToTarget(start);
    expect(choose(done, { presetId: WIRE_PRESETS[1]!.id }).edges).toEqual(done.edges);
    expect(choose(done, { targetId: c.targets[1]!.id }).edges).toEqual(done.edges);
    expect(choose(done, { entryId: `${done.entryId}-other` }).edges).toEqual([]);
  });
});

describe('evaluation through the engine', () => {
  it('is null with no edges', () => {
    expect(evaluate(graph, start)).toBeNull();
  });

  it('equals routeFor for the same edges', () => {
    const done = walkToTarget(start);
    expect(evaluate(graph, done)).toEqual(routeFor(graph, done.entryId, done.targetId, done.presetId, done.edges));
  });

  it('re-measures when the preset changes: the verdict follows each preset', () => {
    const done = walkToTarget(start);
    for (const p of WIRE_PRESETS) {
      const s = choose(done, { presetId: p.id });
      const expected = routeFor(graph, s.entryId, s.targetId, p.id, s.edges);
      const got = evaluate(graph, s)!;
      expect(got.presetId).toBe(p.id);
      expect(got.feasible).toBe(expected.feasible);
      expect(got.violations).toEqual(expected.violations);
    }
  });
});
