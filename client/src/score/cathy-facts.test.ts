/**
 * G5 engine facts: planMarks, the assist_check lines, and cathyFacts (the only thing the LLM sees).
 */

import { describe, expect, it } from 'vitest';
import type { Route } from '../contracts';
import { planAssist } from '../optimize/assist';
import { buildGraph } from '../optimize/graph';
import { optimizeCase } from '../optimize/optimizer';
import { DEFAULT_WEIGHTS } from '../optimize/rank';
import { steerableAt } from '../optimize/steerability';
import { createRailModel, initialRailState, step } from '../wire/rail';
import { RAIL_DT_S, replayRail } from '../wire/rail-source';
import { caseNames, cathyFacts } from './cathy-facts';
import { caseIndex, driveScene, loadBundledCase, planScene } from './cathy.testutil';
import { driveCheckLine, planCheckLine } from './live';
import { planMarkLine, planMarks } from './plan-marks';
import { driveWarning } from './warn';

describe('planMarks', () => {
  it('a full frontier route has no off_frontier mark, and an unsteerable or heavy candidate is marked where it fails', () => {
    let steerChecked = 0;
    let heavyChecked = 0;
    let offChecked = 0;
    for (const { id } of caseIndex.cases) {
      const c = loadBundledCase(id);
      const g = buildGraph(c);
      for (const t of c.targets) {
        const res = optimizeCase(g, { caseId: c.id, targetId: t.id });
        if (res.kind !== 'frontier') continue;
        const marksOf = (r: Route) => planMarks({ routeSoFar: r.edges, measures: r, optimized: res, entryId: r.entryId, presetId: r.presetId, graph: g });
        for (const r of res.routes) expect(marksOf(r).filter((m) => m.why === 'off_frontier'), r.id).toEqual([]);
        // leave the frontier at the second step: an edge at the first branch point no frontier route takes
        for (const r of res.routes) {
          const mine = res.routes.filter((f) => f.entryId === r.entryId && f.presetId === r.presetId && f.edges[0] === r.edges[0]);
          const alt = c.edges.find((e) => (e.from === r.nodes[1] || e.to === r.nodes[1]) && e.id !== r.edges[0] && !mine.some((f) => f.edges[1] === e.id));
          if (!alt) continue;
          const marks = planMarks({ routeSoFar: [r.edges[0]!, alt.id], measures: null, optimized: res, entryId: r.entryId, presetId: r.presetId });
          expect(marks).toEqual([{ edge: alt.id, why: 'off_frontier' }]);
          offChecked++;
        }
        for (const r of res.candidates) {
          const marks = marksOf(r);
          for (const f of steerableAt(g, r.edges, r.presetId, g.entries.get(r.entryId)).failures) {
            expect(marks).toContainEqual({ edge: f.edge, why: 'cannot_steer' });
            steerChecked++;
          }
          for (const x of r.crossings.filter((x) => x.tier !== 'proximity')) {
            expect(marks).toContainEqual({ edge: x.edge, why: 'heavy_zone', zone: x.zone });
            heavyChecked++;
          }
          // marks are in route order, and each has a grounded spoken line
          const order = marks.map((m) => r.edges.indexOf(m.edge));
          expect(order).toEqual([...order].sort((a, b) => a - b));
          for (const m of marks) expect(planMarkLine(m, c).text).not.toMatch(/\{/);
        }
      }
    }
    expect(steerChecked, 'cannot_steer checked').toBeGreaterThan(0);
    expect(heavyChecked, 'heavy checked').toBeGreaterThan(0);
    expect(offChecked, 'off checked').toBeGreaterThan(0);
  });

  it('nothing to mark on an empty route', () => {
    const s = planScene('type-iii', 'rcca');
    expect(planMarks({ routeSoFar: [], measures: null, optimized: s.optimized, entryId: 'fem_r', presetId: 'soft_angled' })).toEqual([]);
  });
});

describe('assist_check lines (deterministic, LLM off)', () => {
  it('drive: the warning when active, else "on the plan; next", else "pull back" off the plan', () => {
    const c = loadBundledCase('type-iii');
    const g = buildGraph(c);
    const res = optimizeCase(g, { caseId: c.id, targetId: 'rcca' });
    if (res.kind !== 'frontier') throw new Error('type-iii rcca');
    const r = res.routes.find((x) => x.entryId === 'rad_l' && x.presetId === 'soft_angled')!;
    const model = createRailModel(c, r.entryId, 'rcca', r.presetId, r.edges);
    const push = { push: 1, rotate: 0, fluoro: false, contrastPuff: false };
    const inputs = [];
    let state = initialRailState(model);
    const lines: string[] = [];
    for (let i = 0; i < 3000 && !state.atTarget; i++) {
      const log = replayRail({ case: c, entryId: r.entryId, targetId: 'rcca', presetId: r.presetId, path: r.edges }, inputs);
      if (i % 60 === 0 || driveWarning(model, state)) {
        const line = driveCheckLine({ log, optimized: res, weights: DEFAULT_WEIGHTS, case: c }, driveWarning(model, state));
        if (lines.at(-1) !== line.template) lines.push(line.template);
      }
      inputs.push(push);
      state = step(model, state, push, RAIL_DT_S).state;
      if (lines.includes('assist.pull_back') || lines.includes('assist.past_opening')) break;
    }
    expect(lines[0]).toBe('assist.on_plan');
    expect(lines).toContain('assist.wrong_branch_ahead');
    // off the plan: "pull back", or "gone past the opening" when the tip stayed in a vessel the plan uses
    const off = Math.max(lines.indexOf('assist.pull_back'), lines.indexOf('assist.past_opening'));
    expect(off).toBeGreaterThan(-1);
    expect(lines.indexOf('assist.wrong_branch_ahead')).toBeLessThan(off);
  });

  it('plan: the first mark when there is one, else the best way on', () => {
    const c = loadBundledCase('type-iii');
    const g = buildGraph(c);
    const res = optimizeCase(g, { caseId: c.id, targetId: 'rcca' });
    if (res.kind !== 'frontier') throw new Error('type-iii rcca');
    const best = res.routes[0]!;
    const soFar = best.edges.slice(0, 1);
    const assist = planAssist({ optimized: res, weights: DEFAULT_WEIGHTS, entryId: best.entryId, presetId: best.presetId, routeSoFar: soFar, graph: g });
    expect(planCheckLine([], assist, c, 'rcca').template).toMatch(/^assist\.best_route/);
    const mark = { edge: soFar[0]!, why: 'off_frontier' as const };
    expect(planCheckLine([mark], assist, c, 'rcca')).toEqual(planMarkLine(mark, c));
  });
});

describe('cathyFacts', () => {
  it('is plain JSON, deterministic, and carries display names and units only', () => {
    const a = planScene('type-iii', 'rcca').facts;
    const b = planScene('type-iii', 'rcca').facts;
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const text = JSON.stringify(a);
    expect(text).not.toMatch(/"e_[a-z_]+"|"n_[a-z_]+"|\|soft_angled\|/); // no edge, node or route ids
    expect(a.route.measures?.['route length']).toEqual({ value: expect.any(Number), unit: 'cm' });
    expect(a.routes[0]).toMatchObject({ rank: 1 });
    expect(a.routes.length).toBeLessThanOrEqual(5);
  });

  it('names: every vessel, entry, target, zone and wire, nothing else', () => {
    const c = loadBundledCase('type-iii');
    const names = caseNames(c);
    for (const v of c.vessels) expect(names).toContain(v.name);
    for (const e of c.entries) expect(names).toContain(e.name);
    for (const w of ['Soft angled', 'Standard J', 'Stiff straight']) expect(names).toContain(w);
  });

  it('drive facts carry the live warning in display terms', () => {
    const d = driveScene('type-iii', 'rcca').facts;
    expect(d.drive?.warning).toEqual({ would_enter: 'Aorta', planned: 'Brachiocephalic trunk', distance_mm: 20, rotate: 'right' });
    expect(d.lines[0]).toBe('Careful: the tip will go into the Aorta, not the Brachiocephalic trunk. Rotate right.');
  });

  it('builds for a case with no safe route without inventing routes', () => {
    const id = caseIndex.cases.find((x) => x.id === 'ts-s0727-cta')?.id;
    if (!id) return;
    const c = loadBundledCase(id);
    const g = buildGraph(c);
    const t = c.targets[0]!;
    const res = optimizeCase(g, { caseId: c.id, targetId: t.id });
    const entryId = c.entries[0]!.id;
    const assist = planAssist({ optimized: res, weights: DEFAULT_WEIGHTS, entryId, presetId: 'soft_angled', routeSoFar: [] });
    const f = cathyFacts({ screen: 'plan', case: c, targetId: t.id, entryId, presetId: 'soft_angled', weights: DEFAULT_WEIGHTS, optimized: res, lines: [], routeSoFar: [], measures: null, assist, marks: [] });
    if (res.kind === 'no_safe_route') expect(f.routes).toEqual([]);
  });
});
