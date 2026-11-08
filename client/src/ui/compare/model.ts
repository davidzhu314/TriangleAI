/**
 * Compare's logic, pure: how frontier routes are grouped and named, which measures and sliders show, the starting
 * weights, which routes the overlay draws, and the one-sentence finding. Every number comes from the engine's
 * contract fields; nothing here measures or scores a route.
 */
import { MEASURE_LOWER_IS_BETTER } from '../../contracts';
import type { CostVector, Frontier, FrontierRoute, LoadedCase, MeasureKey, OptimizeResult, Ranking, Route, RouteLabel, RouteSuggestion, Weights, WirePresetId } from '../../contracts';
import { dominates, WIRE_PRESETS } from '../../optimize';
import { MEASURE_ROWS, SIMULATED_KEYS, type CostRow } from '../plan/cost-rows';
import { vesselName, violationText, zoneLabel } from '../plan/warnings';

export const LABEL_NAME: Record<RouteLabel, string> = {
  shortest: 'shortest',
  gentlest: 'gentlest',
  least_radiation: 'least radiation',
  widest: 'widest',
  farthest_from_risk: 'farthest from risk',
  lowest_force: 'lowest force',
  most_reliable: 'most reliable',
};

const presetName = (id: WirePresetId): string => WIRE_PRESETS.find((p) => p.id === id)?.name ?? id;
const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Frontier routes that differ only by preset and have identical costs, shown as one row (V3 handoff). */
export interface RouteGroup {
  /** The first member's route id. */
  id: string;
  routes: FrontierRoute[];
  presetIds: WirePresetId[];
  labels: RouteLabel[];
  cost: CostVector;
  entryId: string;
  edges: string[];
  /** Name for a heading or a row, e.g. "Shortest, least radiation" or "Through Aorta → Left branch". */
  name: string;
  /** "Soft angled or Standard J". */
  devices: string;
}

function costKey(cost: CostVector): string {
  return JSON.stringify(Object.keys(cost).sort().map((k) => [k, cost[k as MeasureKey]]));
}

/** Neutral name for a route the optimizer gave no label: its path, and its entry when the case has several. */
function pathName(c: LoadedCase, entryId: string, edges: readonly string[]): string {
  const vessels = edges.map((e) => vesselName(c, e)).filter((v, i, all) => v !== all[i - 1]);
  const through = `through ${vessels.join(' → ')}`;
  if (c.entries.length < 2) return capital(through);
  return `From the ${c.entries.find((e) => e.id === entryId)?.name ?? entryId}, ${through}`;
}

export function groupRoutes(c: LoadedCase, frontier: Frontier): RouteGroup[] {
  const groups = new Map<string, RouteGroup>();
  for (const r of frontier.routes) {
    const key = `${r.entryId}|${r.edges.join(',')}|${costKey(r.cost)}`;
    const g = groups.get(key);
    if (g) {
      g.routes.push(r);
      g.presetIds.push(r.presetId);
      for (const l of r.labels) if (!g.labels.includes(l)) g.labels.push(l);
      continue;
    }
    groups.set(key, { id: r.id, routes: [r], presetIds: [r.presetId], labels: [...r.labels], cost: r.cost, entryId: r.entryId, edges: [...r.edges], name: '', devices: '' });
  }
  return [...groups.values()].map((g) => {
    const presetIds = WIRE_PRESETS.map((p) => p.id).filter((id) => g.presetIds.includes(id));
    return {
      ...g,
      presetIds,
      name: g.labels.length ? capital(g.labels.map((l) => LABEL_NAME[l]).join(', ')) : pathName(c, g.entryId, g.edges),
      devices: presetIds.map(presetName).join(' or '),
    };
  });
}

/** Measures the cost vectors carry. The simulated two only with real recorded runs; never a stand-in. */
export function visibleMeasures(frontier: Frontier | null, player: Route | null): CostRow[] {
  const costs = [...(frontier?.routes ?? []).map((r) => r.cost), ...(player ? [player.cost] : [])];
  return MEASURE_ROWS.filter((row) => {
    if (SIMULATED_KEYS.includes(row.key) && !frontier?.recordedRunsUsed) return false;
    return costs.some((cost) => cost[row.key] !== undefined);
  });
}

/**
 * Starting weights: equal on every measure shown. The engine defines no default (normaliseWeights of nothing
 * ranks every route equal), so the neutral choice is used and favours no route (DECISIONS.md).
 */
export function startingWeights(measures: readonly CostRow[]): Weights {
  return Object.fromEntries(measures.map((m) => [m.key, 1])) as Weights;
}

/** 1-based rank of each group: the best rank among its member routes in the engine's ranking. */
export function groupRanks(groups: readonly RouteGroup[], ranking: Ranking): Map<string, number> {
  const pos = new Map(ranking.order.map((r, i) => [r.routeId, i]));
  const best = groups.map((g) => ({ id: g.id, at: Math.min(...g.routes.map((r) => pos.get(r.id) ?? Infinity)) }));
  best.sort((a, b) => a.at - b.at);
  return new Map(best.map((b, i) => [b.id, i + 1]));
}

export const OVERLAY_CAP = 4;

/**
 * Which groups the overlay draws: the top four by the current ranking (all of them stay in the table). Each gets a
 * colour and pattern slot by its frontier order, so a line keeps its colour while the order changes.
 */
export function overlaySelection(groups: readonly RouteGroup[], ranks: ReadonlyMap<string, number>, cap = OVERLAY_CAP): { group: RouteGroup; slot: 1 | 2 | 3 | 4 }[] {
  const shown = [...groups].sort((a, b) => (ranks.get(a.id) ?? Infinity) - (ranks.get(b.id) ?? Infinity)).slice(0, cap);
  const stable = groups.filter((g) => shown.includes(g));
  return stable.map((group, i) => ({ group, slot: (i + 1) as 1 | 2 | 3 | 4 }));
}

function suggestionText(c: LoadedCase, s: RouteSuggestion | null): string {
  if (!s) return 'No change of entry or wire gives a safe route.';
  const entry = (id: string): string => c.entries.find((e) => e.id === id)?.name ?? id;
  if (s.change === 'preset') return `Try the ${presetName(s.presetId)} wire.`;
  if (s.change === 'entry') return `Try the ${entry(s.entryId)} entry.`;
  return `Try the ${entry(s.entryId)} entry with the ${presetName(s.presetId)} wire.`;
}

const lower = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

/** The measures on which `a` is strictly better than `b`, in display names. */
export function betterOn(a: CostVector, b: CostVector, rows: readonly CostRow[]): string[] {
  return rows
    .filter((row) => {
      const x = a[row.key];
      const y = b[row.key];
      if (x === undefined || y === undefined || x === y) return false;
      return MEASURE_LOWER_IS_BETTER[row.key] ? x < y : x > y;
    })
    .map((row) => row.label.toLowerCase());
}

const listWords = (items: readonly string[]): string => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

/** The screen's one finding: "Is my route on the frontier?", from contract fields only. Never "optimal". */
export function finding(c: LoadedCase, player: Route | null, result: OptimizeResult, groups: readonly RouteGroup[], rows: readonly CostRow[]): string {
  const target = c.targets.find((t) => t.id === result.targetId)?.name ?? result.targetId;
  if (result.kind === 'no_safe_route') {
    const first = result.crossings[0];
    const why = first
      ? `Every route that gets there crosses ${zoneLabel(c, first.zone)}, a heavy risk zone.`
      : result.reasons[0]
        ? `The routes that get there are blocked. ${violationText(c, result.reasons[0])}`
        : 'No route gets there.';
    return `No safe route to the ${target} with these entries and wires. ${why} ${suggestionText(c, result.suggestion)}`;
  }
  if (!player) return 'No route planned yet.';
  if (!player.feasible) {
    const v = player.violations[0];
    return `Your route can't be on the frontier because it is blocked: ${v ? lower(violationText(c, v, presetName(player.presetId)).replace(/^Blocked: /, '')) : 'it breaks a hard constraint.'}`;
  }
  if (player.cost.heavyCrossings > 0) {
    const zone = player.crossings.find((x) => x.tier === 'heavy');
    return `Your route is feasible but crosses ${zone ? zoneLabel(c, zone.zone) : 'a heavy risk zone'}, a heavy risk zone, so it isn't safe and can't be on the frontier.`;
  }
  const dominators = groups.filter((g) => dominates(g.cost, player.cost));
  const top = dominators[0];
  if (!top) return 'Your route is on the frontier: no other safe route beats it on every measure.';
  const measures = betterOn(top.cost, player.cost, rows);
  const lead = dominators.length > 1 ? `${dominators.length} frontier routes beat yours. The ${lower(top.name)} route` : `The ${lower(top.name)} route`;
  return `${lead} is better on ${listWords(measures)} and no worse on the rest.`;
}
