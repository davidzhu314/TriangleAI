/**
 * Cathy test helpers (G5): a bundled case loaded from client/public/cases, and the facts Cathy would see on
 * its Plan and Drive screens, built from the real engine (optimize → planAssist / planMarks, rail drive →
 * driveAssist / driveWarning). Used by the grounding, facts and eval tests.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CaseJson, CenterlinesJson, ControlInput, LoadedCase, OptimizeResult } from '../contracts';
import { planAssist } from '../optimize/assist';
import { buildTestLoadedCase } from '../optimize/case-builder.testutil';
import { buildGraph } from '../optimize/graph';
import { measureRoute } from '../optimize/measure-route';
import { optimizeCase } from '../optimize/optimizer';
import { DEFAULT_WEIGHTS } from '../optimize/rank';
import { createRailModel, initialRailState, step, type RailState } from '../wire/rail';
import { RAIL_DT_S, replayRail } from '../wire/rail-source';
import { cathyFacts, type CathyFacts } from './cathy-facts';
import { driveAssist, driveCheckLine, planAssistLine, planCheckLine } from './live';
import { planMarks } from './plan-marks';
import { driveWarning } from './warn';

export const CASES_DIR = join(import.meta.dirname, '../../public/cases');
export const caseIndex = JSON.parse(readFileSync(join(CASES_DIR, 'index.json'), 'utf8')) as { cases: { id: string; path: string }[] };

export function loadBundledCase(id: string): LoadedCase {
  const path = caseIndex.cases.find((x) => x.id === id)!.path;
  const read = <T,>(f: string): T => JSON.parse(readFileSync(join(CASES_DIR, path, f), 'utf8')) as T;
  return buildTestLoadedCase(read<CaseJson>('case.json'), read<CenterlinesJson>('centerlines.json'));
}

export interface PlanScene {
  c: LoadedCase;
  targetId: string;
  optimized: OptimizeResult;
  facts: CathyFacts;
}

/** Plan screen facts for `routeSoFar` (default: the first two edges of the best frontier route). */
export function planScene(caseId: string, targetId: string, routeSoFar?: readonly string[], route?: { entryId: string; presetId: 'soft_angled' | 'standard_j' | 'stiff_straight' }): PlanScene {
  const c = loadBundledCase(caseId);
  const g = buildGraph(c);
  const optimized = optimizeCase(g, { caseId: c.id, targetId });
  if (optimized.kind !== 'frontier') throw new Error(`${caseId} → ${targetId}: no safe route`);
  const best = optimized.routes[0]!;
  const entryId = route?.entryId ?? best.entryId;
  const presetId = route?.presetId ?? best.presetId;
  const soFar = routeSoFar ?? best.edges.slice(0, Math.max(1, best.edges.length - 1));
  const startNode = g.entries.get(entryId);
  const measures = soFar.length > 0 ? measureRoute(g, soFar, startNode === undefined ? {} : { startNode }) : null;
  const assist = planAssist({ optimized, weights: DEFAULT_WEIGHTS, entryId, presetId, routeSoFar: soFar, graph: g });
  const marks = planMarks({ routeSoFar: soFar, measures, optimized, entryId, presetId, graph: g });
  const lines = [planAssistLine(assist, c, targetId, 'best'), planAssistLine(assist, c, targetId, 'options'), planCheckLine(marks, assist, c, targetId)];
  const facts = cathyFacts({ screen: 'plan', case: c, targetId, entryId, presetId, weights: DEFAULT_WEIGHTS, optimized, lines, routeSoFar: soFar, measures, assist, marks });
  return { c, targetId, optimized, facts };
}

export interface DriveScene extends PlanScene {
  state: RailState;
}

/**
 * Drive screen facts: the best frontier route, driven push-only (no rotation) until `stopWhen` says so
 * (default: the first tick a warning is active, else the end), so a warning is often live.
 */
export function driveScene(caseId: string, targetId: string, stopWhen: 'warning' | 'end' = 'warning'): DriveScene {
  const c = loadBundledCase(caseId);
  const g = buildGraph(c);
  const optimized = optimizeCase(g, { caseId: c.id, targetId });
  if (optimized.kind !== 'frontier') throw new Error(`${caseId} → ${targetId}: no safe route`);
  const push: ControlInput = { push: 1, rotate: 0, fluoro: true, contrastPuff: false };
  const driveRoute = (route: (typeof optimized.routes)[number]) => {
    const model = createRailModel(c, route.entryId, targetId, route.presetId, route.edges);
    let state = initialRailState(model);
    const inputs: ControlInput[] = [];
    for (let i = 0; i < 6000 && !state.atTarget; i++) {
      if (stopWhen === 'warning' && driveWarning(model, state)) break;
      const next = step(model, state, push, RAIL_DT_S).state;
      if (next.s === state.s && next.walked.length === state.walked.length && i > 30) break; // stalled
      inputs.push(push);
      state = next;
    }
    return { model, state, inputs };
  };
  // the first frontier route a push-only drive gets a warning on (when one is wanted), else the best route
  let r = optimized.routes[0]!;
  let run = driveRoute(r);
  if (stopWhen === 'warning') {
    for (const cand of optimized.routes) {
      const d = driveRoute(cand);
      if (driveWarning(d.model, d.state)) {
        r = cand;
        run = d;
        break;
      }
    }
  }
  const { model, state, inputs } = run;
  const log = replayRail({ case: c, entryId: r.entryId, targetId, presetId: r.presetId, path: r.edges }, inputs);
  const input = { log, optimized, weights: DEFAULT_WEIGHTS, case: c };
  const drive = driveAssist(input);
  const warning = driveWarning(model, state);
  const lines = [driveCheckLine(input, warning), ...drive.lines];
  const facts = cathyFacts({ screen: 'drive', case: c, targetId, entryId: r.entryId, presetId: r.presetId, weights: DEFAULT_WEIGHTS, optimized, lines, plan: r.edges, drive, warning });
  return { c, targetId, optimized, facts, state };
}
