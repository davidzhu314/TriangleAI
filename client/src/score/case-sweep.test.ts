/**
 * The engine sweep: every bundled case through optimize → steer → rail drive → score, with the V7
 * timing budgets, plus the optimizer on graphs larger than any case so far. Run it before new anatomy
 * ships (more real CT cases, more vessels; DECISIONS.md, "Case sweep before new anatomy").
 *
 * - SWEEP_CASES_DIR: a cases folder with an index.json (default: client/public/cases), e.g. a
 *   teammate's branch extracted to a scratch folder.
 * - SWEEP_OUT: write the Markdown report there (metrics/vaibhav/case-sweep.md is the committed copy).
 *
 * What fails the test: a timing budget missed, a score out of range, or a frontier route the rail wire
 * can steer that the autopilot still doesn't drive cleanly to the target. Routes the wire can't steer
 * are findings, not failures, until the optimizer's cannot_steer constraint lands (contracts v2).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CaseJson, CenterlinesJson, EventLog, LoadedCase, OptimizeResult, Route } from '../contracts';
import { buildTestLoadedCase } from '../optimize/case-builder.testutil';
import { buildGraph, type RouteGraph } from '../optimize/graph';
import { gridCase } from '../optimize/graphs.testutil';
import { measureRoute } from '../optimize/measure-route';
import { isSafe, LARGE_GRAPH_EDGES, optimizeCase, RouteEnumerator } from '../optimize/optimizer';
import { getPreset } from '../optimize/presets';
import { DEFAULT_WEIGHTS } from '../optimize/rank';
import { BRANCH_ENTRY_DEG, steerableAt } from '../optimize/steerability';
import { RailWireSource } from '../wire/rail-source';
import { scoreCase } from './score';

const CASES = process.env['SWEEP_CASES_DIR'] ?? join(import.meta.dirname, '../../public/cases');

/** V7 budgets (DECISIONS.md, "Engine timing budgets"); the large-graph optimizer budget is the 84-edge grid's. */
const BUDGET = { optimizeMs: 50, optimizeLargeMs: 500, scoreMs: 100, railTickMs: 1 } as const;
const MAX_DRIVE_S = 200;
/**
 * Budgets are asserted on a deliberate sweep run (SWEEP_OUT set), not in CI: this sweep drives every
 * frontier route, so its timings swing with machine load (a laptop on battery runs ~5x slower). The V7
 * timing tests keep guarding the budgets in CI; here CI checks correctness only.
 */
const STRICT_TIMING = process.env['SWEEP_OUT'] !== undefined;
const budget = (value: number, max: number, what: string): void => {
  if (STRICT_TIMING) expect(value, what).toBeLessThan(max);
};

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};
function timeMs(fn: () => void, runs: number, warm = 1): number {
  for (let i = 0; i < warm; i++) fn();
  const t: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    t.push(performance.now() - t0);
  }
  return median(t);
}
const ms = (x: number): string => x.toFixed(x < 1 ? 3 : 1);

function loadCase(id: string, path: string): LoadedCase {
  const read = <T,>(f: string): T => JSON.parse(readFileSync(join(CASES, path, f), 'utf8')) as T;
  const c = buildTestLoadedCase(read<CaseJson>('case.json'), read<CenterlinesJson>('centerlines.json'));
  if (c.id !== id) throw new Error(`sweep: index says ${id}, case.json says ${c.id}`);
  return c;
}

interface Drive {
  route: Route;
  steerable: boolean;
  reached: boolean;
  wrongBranches: number;
  simS: number;
  tickMs: number;
  log: EventLog;
}

async function drive(c: LoadedCase, targetId: string, r: Route, steerable: boolean): Promise<Drive> {
  const src = new RailWireSource({ clock: 'manual', autoDrive: true });
  let at = false;
  src.onState((s) => (at = s.atTarget));
  await src.start({ case: c, entryId: r.entryId, targetId, presetId: r.presetId, path: r.edges });
  src.control({ push: 0, rotate: 0, fluoro: true, contrastPuff: false });
  let ticks = 0;
  const t0 = performance.now();
  for (; ticks < MAX_DRIVE_S * 30 && !at; ticks++) src.tick();
  const tickMs = (performance.now() - t0) / Math.max(1, ticks);
  const log = await src.stop();
  return {
    route: r,
    steerable,
    reached: log.events.some((e) => e.kind === 'target_reached'),
    wrongBranches: log.events.filter((e) => e.kind === 'wrong_branch').length,
    simS: ticks / 30,
    tickMs,
    log,
  };
}

/** One steering failure: the branch the tip should enter, the one it entered, and the angles. */
interface SteerFinding {
  route: string;
  vessel: string;
  entered: string;
  takeoffDeg: number;
  tipDeg: number;
}

const report: string[] = [];
const findings: SteerFinding[] = [];

describe('case sweep: optimize → steer → rail drive → score, with timing budgets', () => {
  const index = JSON.parse(readFileSync(join(CASES, 'index.json'), 'utf8')) as { cases: { id: string; path: string }[] };
  report.push('| Case | Edges | Target | Result | Frontier (steerable) | Safe candidates (steerable) | Optimize median | Drives clean / steerable | Score median (worst) | Plan / drive / stars (best route) | Rail tick mean |');
  report.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');

  for (const { id, path } of index.cases) {
    it(`${id}`, async () => {
      const c = loadCase(id, path);
      const g: RouteGraph = buildGraph(c);
      const large = g.edges.size > LARGE_GRAPH_EDGES;
      const vessel = (edge: string): string => c.edges.find((e) => e.id === edge)?.vessel ?? edge;

      for (const t of c.targets) {
        const req = { caseId: c.id, targetId: t.id };
        const res: OptimizeResult = optimizeCase(g, req);
        const optMs = timeMs(() => optimizeCase(g, req, new RouteEnumerator(g)), 5);
        budget(optMs, large ? BUDGET.optimizeLargeMs : BUDGET.optimizeMs, `${id} → ${t.id}: optimize`);

        if (res.kind !== 'frontier') {
          report.push(`| ${id} | ${g.edges.size} | ${t.id} | no safe route | — | — | ${ms(optMs)} ms | — | — | — | — |`);
          continue;
        }
        const steer = (r: Route) => steerableAt(g, r.edges, r.presetId, g.entries.get(r.entryId));
        const safe = res.candidates.filter(isSafe);
        const safeSteerable = safe.filter((r) => steer(r).ok);
        for (const r of safe) {
          for (const f of steer(r).failures) {
            findings.push({ route: `${id} → ${t.id}: ${r.id}`, vessel: vessel(f.edge), entered: vessel(f.entered), takeoffDeg: f.takeoffDeg, tipDeg: f.tipDeg });
          }
        }

        const drives: Drive[] = [];
        for (const r of res.routes) drives.push(await drive(c, t.id, r, steer(r).ok));
        for (const d of drives.filter((x) => x.steerable)) {
          expect(d.reached, `${id} → ${t.id}: ${d.route.id} (steerable) reaches the target`).toBe(true);
          expect(d.wrongBranches, `${id} → ${t.id}: ${d.route.id} (steerable) takes no wrong branch`).toBe(0);
        }
        const tickMs = Math.max(...drives.map((d) => d.tickMs));
        budget(tickMs, BUDGET.railTickMs, `${id} → ${t.id}: rail tick`);

        let worstScoreMs = 0;
        const scoreMedians: number[] = [];
        for (const d of drives) {
          const input = { log: d.log, optimized: res, weights: DEFAULT_WEIGHTS, case: c };
          const r = scoreCase(input);
          for (const s of [r.plan.score, r.drive.score]) expect(s).toBeGreaterThanOrEqual(0), expect(s).toBeLessThanOrEqual(100);
          const m = timeMs(() => scoreCase(input), 3);
          scoreMedians.push(m);
          worstScoreMs = Math.max(worstScoreMs, m);
        }
        budget(worstScoreMs, BUDGET.scoreMs, `${id} → ${t.id}: scoreCase`);

        // the best route at DEFAULT_WEIGHTS among the steerable ones, driven by the autopilot
        const best = drives.find((d) => d.steerable && d.reached);
        const bestRes = best ? scoreCase({ log: best.log, optimized: res, weights: DEFAULT_WEIGHTS, case: c }) : null;
        const steerableDrives = drives.filter((d) => d.steerable);
        report.push(
          [
            id,
            g.edges.size,
            t.id,
            'frontier',
            `${res.routes.length} (${res.routes.filter((r) => steer(r).ok).length})`,
            `${safe.length} (${safeSteerable.length})`,
            `${ms(optMs)} ms`,
            `${steerableDrives.filter((d) => d.reached && d.wrongBranches === 0).length} / ${steerableDrives.length}`,
            `${ms(median(scoreMedians))} ms (${ms(worstScoreMs)})`,
            bestRes ? `${Math.round(bestRes.plan.score)} / ${Math.round(bestRes.drive.score)} / ${bestRes.stars}★` : '—',
            `${ms(tickMs)} ms`,
          ]
            .join(' | ')
            .replace(/^/, '| ')
            .concat(' |'),
        );
      }
    }, 300_000);
  }
});

describe('scale: the optimizer on graphs larger than any case so far', () => {
  const rows: string[] = [];
  for (const n of [6, 8, 10, 12]) {
    it(`${n} × ${n} grid`, () => {
      const c = gridCase(n, n);
      const g = buildGraph(c);
      // a 90° grid: no wire can steer it, so steering isn't part of this timing
      const req = { caseId: c.id, targetId: [...g.targets.keys()][0]! };
      const res = optimizeCase(g, req, new RouteEnumerator(g));
      const optMs = timeMs(() => optimizeCase(g, req, new RouteEnumerator(g)), 3);
      const maxMs = g.edges.size > LARGE_GRAPH_EDGES ? BUDGET.optimizeLargeMs : BUDGET.optimizeMs;
      budget(optMs, maxMs, `${n}×${n} optimize`);
      const route = res.kind === 'frontier' ? res.routes[0]! : null;
      const measureMs = route ? timeMs(() => measureRoute(g, route.edges, { startNode: g.entries.get(route.entryId)! }), 20) : NaN;
      if (route) budget(measureMs, 16.7, `${n}×${n} measureRoute`);
      rows.push(
        `| ${n} × ${n} grid | ${g.edges.size} | ${g.edges.size > LARGE_GRAPH_EDGES ? "Yen's k-shortest" : 'all simple paths'} | ${ms(optMs)} ms (budget ${maxMs}) | ${route ? `${ms(measureMs)} ms` : '—'} | ${res.kind === 'frontier' ? res.candidates.length : 0} |`,
      );
    }, 120_000);
  }
  it('report', () => {
    report.push('', '## Scale', '', '| Graph | Edges | Search | Optimize median | measureRoute median (one route) | Candidates |', '| --- | --- | --- | --- | --- | --- |', ...rows);
  });
});

describe('steering: what a wire would need', () => {
  it('report', () => {
    report.push('', '## Steering failures among safe candidates', '');
    if (findings.length === 0) {
      report.push('None: every safe candidate route is steerable.');
    } else {
      const presets = ['soft_angled', 'standard_j', 'stiff_straight'] as const;
      const maxTip = Math.max(...presets.map((p) => getPreset(p).tipAngleDeg));
      report.push(
        `${findings.length} branch points where a safe candidate's wire can't steer. The tip enters the branch its direction is closest to, if within ${BRANCH_ENTRY_DEG}°. So a branch is reachable only by a tip within about ${BRANCH_ENTRY_DEG}° of its takeoff, and only if no other branch is closer to where the tip points. Today's tips: ${presets.map((p) => `${getPreset(p).name} ${getPreset(p).tipAngleDeg}°`).join(', ')}.`,
        '',
        `| Route | Should enter | Went into | Takeoff | Tip | Tips that could point in (takeoff ± ${BRANCH_ENTRY_DEG}°) |`,
        '| --- | --- | --- | --- | --- | --- |',
        ...findings
          .sort((a, b) => b.takeoffDeg - a.takeoffDeg)
          .map(
            (f) =>
              `| ${f.route} | ${f.vessel} | ${f.entered} | ${Math.round(f.takeoffDeg)}° | ${Math.round(f.tipDeg)}° | ${Math.max(0, Math.round(f.takeoffDeg - BRANCH_ENTRY_DEG))}–${Math.round(f.takeoffDeg + BRANCH_ENTRY_DEG)}° |`,
          ),
      );
      const steep = findings.filter((f) => f.takeoffDeg - BRANCH_ENTRY_DEG > maxTip);
      if (steep.length > 0) {
        const need = Math.max(...steep.map((f) => f.takeoffDeg - BRANCH_ENTRY_DEG));
        report.push('', `${steep.length} of them are steeper than any of today's tips (up to ${maxTip}°) can reach: the steepest needs a tip of at least ${Math.round(need)}°.`);
      }
    }
    const out = process.env['SWEEP_OUT'];
    const label = process.env['SWEEP_LABEL'] ?? `\`${CASES.replace(/\\/g, '/')}\``;
    if (out) writeFileSync(out, ['# Case sweep', '', `Cases: ${label}`, '', ...report, ''].join('\n'));
  });
});
