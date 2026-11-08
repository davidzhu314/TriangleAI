/**
 * Cathy's facts (G5): one plain JSON object of everything Cathy may talk about right now, with display
 * names and display units already applied. It is the ONLY thing the LLM sees, and the grounding check's
 * source of truth (./grounding): every number Cathy says must be one of these values, every name one of
 * `names`.
 *
 * It formats engine results the screen already has (planAssist, planMarks, driveAssist, driveWarning, the
 * optimizer's frontier and the live lines); it computes nothing new. Rounding is MEASURE_DISPLAY's, the
 * same as the feedback lines, so a number in a line and in the facts reads the same. Pure.
 */

import type { CostVector, FeedbackLine, LoadedCase, MeasureKey, OptimizeResult, RouteLabel, RouteMeasures, Weights, WirePresetId } from '../contracts';
import type { PlanAssist } from '../optimize/assist';
import { getPreset, WIRE_PRESETS } from '../optimize/presets';
import { measureRanges, rankRoutes } from '../optimize/rank';
import { MEASURE_DISPLAY, Names } from './feedback';
import type { DriveAssist } from './live';
import type { PlanMark } from './plan-marks';
import { round } from './templates';
import type { DriveWarning } from './warn';

/** At most this many frontier routes go into the facts (best first at the player's weights). */
export const FACTS_MAX_ROUTES = 5;

export interface FactMeasure {
  value: number;
  unit: string;
}

export interface CathyFacts {
  screen: 'plan' | 'drive';
  case: string;
  target: string;
  entry: string;
  wire: string;
  /** The player's route so far (Plan) or the planned route (Drive). */
  route: { vessels: string[]; measures: Record<string, FactMeasure> | null };
  /** Frontier routes ranked at the player's weights; rank 1 is best. Empty when there is no safe route. */
  routes: { rank: number; name: string; entry: string; wire: string; labels: string[]; measures: Record<string, FactMeasure> }[];
  plan?: {
    best_next: string | null;
    options: string[];
    /** planAssist's reason, when not a plain answer ('complete', 'off_frontier', …). */
    situation: string | null;
    marks: { vessel: string; problem: 'cannot steer' | 'off the best routes' | 'heavy risk zone'; zone?: string }[];
  };
  drive?: {
    next: string | null;
    off_plan: { in: string; back_to: string } | null;
    warning: { would_enter: string; planned: string; distance_mm: number; rotate: 'left' | 'right' | null } | null;
  };
  /** The deterministic lines that apply now (what Cathy says with the LLM off). */
  lines: string[];
  /** Every name Cathy may say: vessels, entries, targets, risk zones and wires. */
  names: string[];
}

interface Common {
  case: LoadedCase;
  targetId: string;
  entryId: string;
  presetId: WirePresetId;
  weights: Weights;
  optimized: OptimizeResult;
  /** The deterministic lines for this screen now (planAssistLine, planCheckLine, driveAssist().lines, …). */
  lines: readonly FeedbackLine[];
}

export type CathyScreenState =
  | (Common & { screen: 'plan'; routeSoFar: readonly string[]; measures: Pick<RouteMeasures, 'cost'> | null; assist: PlanAssist; marks: readonly PlanMark[] })
  | (Common & { screen: 'drive'; plan: readonly string[]; drive: DriveAssist; warning: DriveWarning | null });

const LABEL_WORDS: Readonly<Record<RouteLabel, string>> = {
  shortest: 'shortest',
  gentlest: 'gentlest',
  least_radiation: 'least radiation',
  widest: 'widest',
  farthest_from_risk: 'farthest from risk',
  lowest_force: 'lowest force',
  most_reliable: 'most reliable',
};

const MARK_WORDS = { cannot_steer: 'cannot steer', off_frontier: 'off the best routes', heavy_zone: 'heavy risk zone' } as const;

/** A cost vector in display units, keyed by the measure's display name. Measures not computed are left out. */
export function displayMeasures(cost: Partial<CostVector>): Record<string, FactMeasure> {
  const out: Record<string, FactMeasure> = {};
  for (const k of Object.keys(MEASURE_DISPLAY) as MeasureKey[]) {
    const v = cost[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const d = MEASURE_DISPLAY[k];
    out[d.name.replace(/^the /, '')] = { value: round(v * d.scale, d.decimals), unit: d.unit };
  }
  return out;
}

/** Every name Cathy may say in this case. */
export function caseNames(c: LoadedCase): string[] {
  const n = new Names(c);
  const names = new Set<string>([
    ...c.vessels.map((v) => v.name),
    ...c.entries.map((e) => e.name),
    ...c.targets.map((t) => t.name),
    ...c.riskZones.map((z) => n.zone(z.id)),
    ...WIRE_PRESETS.map((p) => p.name),
    c.title,
  ]);
  return [...names].sort();
}

function vesselsOf(c: LoadedCase, edges: readonly string[]): string[] {
  const n = new Names(c);
  const out: string[] = [];
  for (const e of edges) {
    const v = n.vesselOfEdge(e);
    if (out.at(-1) !== v) out.push(v);
  }
  return out;
}

export function cathyFacts(s: CathyScreenState): CathyFacts {
  const c = s.case;
  const n = new Names(c);
  const entryName = (id: string) => c.entries.find((e) => e.id === id)?.name ?? id;

  const routes: CathyFacts['routes'] = [];
  if (s.optimized.kind === 'frontier') {
    const byId = new Map(s.optimized.routes.map((r) => [r.id, r]));
    const order = rankRoutes(s.optimized.routes, measureRanges(s.optimized.candidates), s.weights).order;
    for (const [i, ranked] of order.slice(0, FACTS_MAX_ROUTES).entries()) {
      const r = byId.get(ranked.routeId)!;
      const labels = r.labels.map((l) => LABEL_WORDS[l]);
      routes.push({ rank: i + 1, name: n.route(r), entry: entryName(r.entryId), wire: getPreset(r.presetId).name, labels, measures: displayMeasures(r.cost) });
    }
  }

  const base = {
    case: c.title,
    target: n.target(s.targetId),
    entry: entryName(s.entryId),
    wire: getPreset(s.presetId).name,
    routes,
    lines: s.lines.map((l) => l.text),
    names: caseNames(c),
  };

  if (s.screen === 'plan') {
    const spoken = s.assist.options.filter((o) => o.steerable !== false);
    return {
      screen: 'plan',
      ...base,
      route: { vessels: vesselsOf(c, s.routeSoFar), measures: s.measures ? displayMeasures(s.measures.cost) : null },
      plan: {
        best_next: s.assist.best ? n.vesselOfEdge(s.assist.best.edge) : null,
        options: [...new Set(spoken.map((o) => n.vesselOfEdge(o.edge)))],
        situation: s.assist.reason ? s.assist.reason.replace(/_/g, ' ') : null,
        marks: s.marks.map((m) => ({ vessel: n.vesselOfEdge(m.edge), problem: MARK_WORDS[m.why], ...(m.zone ? { zone: n.zone(m.zone) } : {}) })),
      },
    };
  }
  const w = s.warning;
  return {
    screen: 'drive',
    ...base,
    route: { vessels: vesselsOf(c, s.plan), measures: null },
    drive: {
      next: s.drive.nextEdge ? n.vesselOfEdge(s.drive.nextEdge) : null,
      off_plan: s.drive.offPlan ? { in: n.vesselOfEdge(s.drive.offPlan.edge), back_to: n.vesselOfEdge(s.drive.offPlan.backToEdge) } : null,
      warning: w
        ? { would_enter: n.vesselOfEdge(w.wouldEnter), planned: n.vesselOfEdge(w.plannedEdge), distance_mm: round(w.distanceM * 1000, 0), rotate: w.rotate }
        : null,
    },
  };
}
