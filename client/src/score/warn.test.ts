/**
 * driveWarning (G5): Cathy's "wrong branch ahead".
 * - It fires before every wrong_branch: the rail golden (its frozen inputs) and, on every bundled case, a
 *   push-only drive of every frontier route (the tip never rotates, so routes that need it take a wrong
 *   branch). The warning names the edge the tip then enters and the planned edge.
 * - It never fires on a clean autopilot drive of any frontier route the wire can steer, on any bundled case
 *   (the case sweep's loop, case-sweep.test.ts).
 * - Deterministic, and under 0.2 ms per call.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CaseJson, CenterlinesJson, ControlInput, LoadedCase, Route, WireEvent } from '../contracts';
import { buildTestLoadedCase } from '../optimize/case-builder.testutil';
import { buildGraph } from '../optimize/graph';
import { loadSynthetic } from '../optimize/graphs.testutil';
import { optimizeCase } from '../optimize/optimizer';
import { steerableAt } from '../optimize/steerability';
import { createRailModel, initialRailState, step, type RailModel, type RailState } from '../wire/rail';
import { railAutopilot } from '../wire/rail-autopilot';
import { RAIL_DT_S } from '../wire/rail-source';
import { driveWarning, warningLine, WARN_AHEAD_M, type DriveWarning } from './warn';

const CASES = join(import.meta.dirname, '../../public/cases');
const MAX_TICKS = 200 * 30;

function loadCase(path: string): LoadedCase {
  const read = <T,>(f: string): T => JSON.parse(readFileSync(join(CASES, path, f), 'utf8')) as T;
  return buildTestLoadedCase(read<CaseJson>('case.json'), read<CenterlinesJson>('centerlines.json'));
}
const index = JSON.parse(readFileSync(join(CASES, 'index.json'), 'utf8')) as { cases: { id: string; path: string }[] };
const fixtureY = (): LoadedCase => loadCase(index.cases.find((x) => x.id === 'fixture-y')!.path);

interface Tick {
  state: RailState;
  planned: readonly string[];
  warning: DriveWarning | null;
  events: WireEvent[];
}

/** Drive with `control` until the target, a stall or MAX_TICKS; the warning is read before each step. */
function run(model: RailModel, control: (s: RailState, i: number) => ControlInput | null): Tick[] {
  let state = initialRailState(model);
  const ticks: Tick[] = [];
  for (let i = 0; i < MAX_TICKS && !state.atTarget; i++) {
    const input = control(state, i);
    if (!input) break;
    const warning = driveWarning(model, state, input.rotate);
    const r = step(model, state, input, RAIL_DT_S);
    ticks.push({ state, planned: model.plan, warning, events: r.events });
    state = r.state;
  }
  return ticks;
}

/**
 * Every wrong_branch taken from the plan was preceded by a warning naming it. Once off the plan, later wrong
 * branches are "pull back" territory (driveAssist), and the warning stays quiet. Returns how many were checked.
 */
function expectWarnedBeforeEachWrongBranch(ticks: Tick[], what: string): number {
  let checked = 0;
  ticks.forEach((tk, i) => {
    const onPlan = tk.state.walked.every((w, k) => w.edge === tk.planned[k]);
    for (const e of tk.events) {
      if (e.kind !== 'wrong_branch') continue;
      if (!onPlan) {
        expect(tk.warning, `${what}: no warning off the plan`).toBeNull();
        continue;
      }
      checked++;
      const before = ticks.slice(0, i + 1).map((t) => t.warning);
      const hit = before.find((w) => w?.wouldEnter === e.edge && w.plannedEdge === e.expectedEdge);
      expect(hit, `${what}: a warning before the wrong branch into ${e.edge}`).toBeDefined();
      expect(hit!.distanceM).toBeLessThanOrEqual(WARN_AHEAD_M);
    }
  });
  return checked;
}

const push: ControlInput = { push: 1, rotate: 0, fluoro: false, contrastPuff: false };
let pushOnlyWarned = 0;

describe('driveWarning: before every wrong branch', () => {
  it('the rail golden (diamond, Standard J): warned before its wrong branch', () => {
    const golden = JSON.parse(readFileSync(join(import.meta.dirname, '../../../tests/fixtures/logs/rail-golden-diamond-j.json'), 'utf8')) as {
      entryId: string;
      targetId: string;
      presetId: 'standard_j';
      path: string[];
      inputs: ControlInput[];
    };
    const model = createRailModel(loadSynthetic('diamond'), golden.entryId, golden.targetId, golden.presetId, golden.path);
    const ticks = run(model, (_, i) => golden.inputs[i] ?? null);
    expect(expectWarnedBeforeEachWrongBranch(ticks, 'rail golden')).toBe(1);
  });

  it('fixture-y pushed straight (score-wrong-branch-fixture-y): warned, with the line naming both branches', () => {
    const c = fixtureY();
    const model = createRailModel(c, 'fem_r', 'left_branch', 'soft_angled', ['e_aorta', 'e_left']);
    const ticks = run(model, () => push);
    expect(expectWarnedBeforeEachWrongBranch(ticks, 'fixture-y')).toBe(1);
    const w = ticks.find((t) => t.warning)!.warning!;
    expect(warningLine(w, c).text).toMatch(/^Careful: the tip will go into the Right branch, not the Left branch\./);
  });

  for (const { id, path } of index.cases) {
    it(`${id}: push-only drives of every frontier route are warned before each wrong branch`, () => {
      const c = loadCase(path);
      const g = buildGraph(c);
      let checked = 0;
      for (const t of c.targets) {
        const res = optimizeCase(g, { caseId: c.id, targetId: t.id });
        if (res.kind !== 'frontier') continue;
        for (const r of res.routes) {
          const model = createRailModel(c, r.entryId, t.id, r.presetId, r.edges);
          checked += expectWarnedBeforeEachWrongBranch(run(model, () => push), `${id} → ${t.id}: ${r.id}`);
        }
      }
      pushOnlyWarned += checked;
    }, 60_000);
  }
});

describe('driveWarning: the push-only sweep found wrong branches to warn about', () => {
  it('at least one per bundled case on average', () => {
    expect(pushOnlyWarned).toBeGreaterThanOrEqual(index.cases.length);
  });
});

describe('driveWarning: never on a clean autopilot drive', () => {
  for (const { id, path } of index.cases) {
    it(`${id}: no warning on any steerable frontier route`, () => {
      const c = loadCase(path);
      const g = buildGraph(c);
      for (const t of c.targets) {
        const res = optimizeCase(g, { caseId: c.id, targetId: t.id });
        if (res.kind !== 'frontier') continue;
        const steerable = (r: Route) => steerableAt(g, r.edges, r.presetId, g.entries.get(r.entryId)).ok;
        for (const r of res.routes.filter(steerable)) {
          const model = createRailModel(c, r.entryId, t.id, r.presetId, r.edges);
          const ticks = run(model, (s) => railAutopilot(model, s, RAIL_DT_S));
          const warned = ticks.find((tk) => tk.warning);
          expect(warned?.warning ?? null, `${id} → ${t.id}: ${r.id} at t=${warned?.state.t}`).toBeNull();
          expect(ticks.at(-1)!.events.some((e) => e.kind === 'target_reached') || ticks.some((tk) => tk.events.some((e) => e.kind === 'target_reached'))).toBe(true);
        }
      }
    }, 120_000);
  }
});

describe('driveWarning: deterministic and fast', () => {
  it('same model and state, same answer; under 0.2 ms per call', () => {
    const c = fixtureY();
    const model = createRailModel(c, 'fem_r', 'left_branch', 'soft_angled', ['e_aorta', 'e_left']);
    const states = run(model, () => push).map((t) => t.state);
    const a = states.map((s) => JSON.stringify(driveWarning(model, s)));
    const fresh = createRailModel(c, 'fem_r', 'left_branch', 'soft_angled', ['e_aorta', 'e_left']);
    expect(states.map((s) => JSON.stringify(driveWarning(fresh, s)))).toEqual(a);
    for (const s of states) driveWarning(model, s); // warm
    const t0 = performance.now();
    const reps = 20;
    for (let k = 0; k < reps; k++) for (const s of states) driveWarning(model, s);
    const perCall = (performance.now() - t0) / (reps * states.length);
    expect(perCall).toBeLessThan(0.2);
  });
});
