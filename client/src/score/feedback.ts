/**
 * Feedback lines (spec §6.4), most important first: not reaching the target, then the plan's
 * deciding check, then a star lost to the budget, then the drive components from lowest score up
 * (each one below 100 adds its lines), then the neutral radiation and budget notes. The Results
 * screen's demo step shows only the top line.
 */

import type {
  CaseResult,
  ConstraintViolation,
  EventLog,
  FeedbackLine,
  LoadedCase,
  MeasureKey,
  OptimizeResult,
  Route,
  WrongBranchEvent,
} from '../contracts';
import { getPreset } from '../optimize/presets';
import { ERROR_PENALTY, FIDELITY_ZERO_M } from './constants';
import type { ForceReference } from './reference';
import { feedbackLine, round } from './templates';

/** Display for each measure in plan.top_contributor: name, unit, scale from contract units, decimals. */
export const MEASURE_DISPLAY: Readonly<Record<MeasureKey, { name: string; unit: string; scale: number; decimals: number }>> = {
  lengthM: { name: 'route length', unit: 'cm', scale: 100, decimals: 1 },
  sharpestTurnDeg: { name: 'the sharpest turn', unit: 'degrees', scale: 1, decimals: 0 },
  totalTurningDeg: { name: 'total turning', unit: 'degrees', scale: 1, decimals: 0 },
  narrowestRadiusM: { name: 'the narrowest radius', unit: 'mm', scale: 1000, decimals: 1 },
  heavyCrossings: { name: 'heavy risk zones crossed', unit: 'zones', scale: 1, decimals: 0 },
  proximityPenalty: { name: 'closeness to risk zones', unit: 'penalty points', scale: 1, decimals: 2 },
  estFluoroS: { name: 'estimated fluoro time', unit: 's', scale: 1, decimals: 1 },
  simPeakForceN: { name: 'simulated peak force', unit: 'N', scale: 1, decimals: 2 },
  simSuccessRate: { name: 'simulated success rate', unit: '%', scale: 100, decimals: 0 },
};

export class Names {
  constructor(private readonly c: LoadedCase) {}

  vesselOfEdge(edgeId: string): string {
    const e = this.c.edges.find((x) => x.id === edgeId);
    if (!e) return edgeId;
    return this.c.vessels.find((v) => v.id === e.vessel)?.name ?? e.vessel;
  }

  zone(zoneId: string): string {
    const z = this.c.riskZones.find((x) => x.id === zoneId);
    if (!z) return zoneId;
    return `the ${z.kind.replace(/_/g, ' ')} in the ${this.vesselOfEdge(z.edge)}`;
  }

  target(targetId: string): string {
    return this.c.targets.find((t) => t.id === targetId)?.name ?? targetId;
  }

  route(r: Pick<Route, 'presetId' | 'edges'>): string {
    const vessels: string[] = [];
    for (const e of r.edges) {
      const v = this.vesselOfEdge(e);
      if (vessels.at(-1) !== v) vessels.push(v);
    }
    return `${getPreset(r.presetId).name} wire through ${vessels.join(' → ')}`;
  }
}

export function violationLine(v: ConstraintViolation, presetId: Route['presetId'], n: Names): FeedbackLine {
  const preset = getPreset(presetId).name;
  switch (v.kind) {
    case 'too_narrow':
      return feedbackLine(
        'plan.too_narrow',
        { vessel: n.vesselOfEdge(v.edge), diameter_mm: round(v.diameterM * 1000, 2), preset, required_mm: round(v.requiredM * 1000, 2) },
        'plan.feasible',
      );
    case 'turn_too_sharp':
      return feedbackLine(
        'plan.turn_too_sharp',
        { turn_deg: round(v.turnDeg, 0), vessel: n.vesselOfEdge(v.edge), preset, max_turn_deg: round(v.maxTurnDeg, 0) },
        'plan.feasible',
      );
    case 'forbidden_zone':
      return feedbackLine('plan.forbidden_zone', { zone: n.zone(v.zone) }, 'plan.feasible');
    case 'arch_never_reached':
      return feedbackLine('plan.arch_never_reached', { preset: getPreset(v.presetId).name }, 'plan.feasible');
  }
}

function routeById(optimized: OptimizeResult, id: string | undefined): Route | undefined {
  return optimized.kind === 'frontier' && id ? optimized.routes.find((r) => r.id === id) : undefined;
}

export function planLines(result: Pick<CaseResult, 'plan'>, player: Route, optimized: OptimizeResult, n: Names, targetId: string): FeedbackLine[] {
  const p = result.plan;
  switch (p.decidedBy) {
    case 'feasible':
      if (player.violations.length > 0) return [violationLine(player.violations[0]!, player.presetId, n)];
      return [feedbackLine('plan.no_safe_route', { target: n.target(targetId) }, 'plan.feasible')];
    case 'heavy_crossings': {
      const safer = routeById(optimized, p.saferRouteId);
      const zone = p.zoneCrossed ? n.zone(p.zoneCrossed) : 'a heavy risk zone';
      const route = safer ? n.route(safer) : '';
      const dlCm = safer ? round((safer.cost.lengthM - player.cost.lengthM) * 100, 1) : 0;
      return [
        dlCm > 0
          ? feedbackLine('plan.heavy_crossing_shorter', { dl_cm: dlCm, zone, route }, 'plan.heavy_cap')
          : feedbackLine('plan.heavy_crossing', { zone, route }, 'plan.heavy_cap'),
      ];
    }
    case 'frontier': {
      const dom = routeById(optimized, p.dominatedByRouteId);
      return [feedbackLine('plan.dominated', { route: dom ? n.route(dom) : '' }, 'plan.frontier_cap')];
    }
    case 'regret': {
      const t = p.topContributor;
      if (!t) return [feedbackLine('plan.best', {}, 'plan.regret')];
      if (t.measure === 'sharpestTurnDeg' && t.edge) {
        return [feedbackLine('plan.top_contributor_turn', { turn_deg: round(t.value, 0), vessel: n.vesselOfEdge(t.edge) }, 'plan.regret')];
      }
      const d = MEASURE_DISPLAY[t.measure];
      return [feedbackLine('plan.top_contributor', { measure: d.name, value: round(t.value * d.scale, d.decimals), unit: d.unit }, 'plan.regret')];
    }
  }
}

/** A component adds its lines only when its score, shown to one decimal, is below 100 (float noise is not a fault). */
export const belowFull = (score: number): boolean => round(score, 1) < 100;

const FORCE_DECIMALS = 3;

type DriveKey = 'fidelity' | 'gentleness' | 'radiation' | 'errors';
const DRIVE_ORDER: readonly DriveKey[] = ['fidelity', 'gentleness', 'radiation', 'errors'];

function componentLines(k: DriveKey, r: CaseResult, log: EventLog, ref: ForceReference, n: Names): FeedbackLine[] {
  const d = r.drive;
  switch (k) {
    case 'fidelity':
      return [
        feedbackLine('drive.fidelity_drift', { mean_mm: round(d.fidelity.meanDistanceM * 1000, 1), zero_mm: round(FIDELITY_ZERO_M * 1000, 0) }, 'drive.fidelity'),
      ];
    case 'gentleness': {
      const out = [
        feedbackLine(
          'drive.gentleness',
          {
            peak_n: round(d.gentleness.peakForceN, FORCE_DECIMALS),
            ref_peak_n: round(ref.peakForceN, FORCE_DECIMALS),
            cum_ns: round(d.gentleness.cumulativeForceNs, FORCE_DECIMALS),
            ref_cum_ns: round(ref.cumulativeForceNs, FORCE_DECIMALS),
          },
          'drive.gentleness',
        ),
      ];
      const spikes = log.events.filter((e) => e.kind === 'force_spike');
      if (spikes.length > 0) {
        out.push(feedbackLine('drive.force_spike', { threshold_n: round(spikes[0]!.thresholdN, 2), n: spikes.length }, 'drive.gentleness'));
      }
      return out;
    }
    case 'radiation':
      return [
        feedbackLine(
          'drive.radiation_over',
          {
            fluoro_s: round(d.radiation.fluoroS, 1),
            over_s: round(d.radiation.fluoroS - d.radiation.estFluoroS, 1),
            est_fluoro_s: round(d.radiation.estFluoroS, 1),
          },
          'drive.radiation',
        ),
      ];
    case 'errors': {
      const out: FeedbackLine[] = [];
      const wrong = log.events.filter((e): e is WrongBranchEvent => e.kind === 'wrong_branch');
      if (wrong.length > 0) {
        out.push(
          feedbackLine(
            'drive.wrong_branch',
            { n: wrong.length, wrong_vessel: n.vesselOfEdge(wrong[0]!.edge), target_vessel: n.vesselOfEdge(wrong[0]!.expectedEdge) },
            'drive.errors',
          ),
        );
      }
      const prolapses = log.events.filter((e) => e.kind === 'prolapse');
      if (prolapses.length > 0) out.push(feedbackLine('drive.prolapse', { n: prolapses.length, vessel: n.vesselOfEdge(prolapses[0]!.edge) }, 'drive.errors'));
      if (d.errors.backOuts > 0) out.push(feedbackLine('drive.back_out', { n: d.errors.backOuts, penalty: ERROR_PENALTY.backOut }, 'drive.errors'));
      return out;
    }
  }
}

export interface FeedbackContext {
  log: EventLog;
  case: LoadedCase;
  optimized: OptimizeResult;
  player: Route;
  reference: ForceReference;
}

export function buildFeedback(r: CaseResult, ctx: FeedbackContext): FeedbackLine[] {
  const n = new Names(ctx.case);
  const lines: FeedbackLine[] = [];
  if (!r.reachedTarget) lines.push(feedbackLine('drive.not_reached', { target: n.target(ctx.log.targetId) }, 'result.stars'));
  lines.push(...planLines(r, ctx.player, ctx.optimized, n, ctx.log.targetId));

  const budget = ctx.case.fluoroBudgetS;
  const budgetValues = () => ({ over_s: round(r.fluoroOverBudgetS, 1), budget_s: round(budget ?? 0, 1) });
  const starLost = r.stars < r.starsBeforeBudget;
  if (starLost) lines.push(feedbackLine('result.over_budget', budgetValues(), 'result.fluoro_budget'));

  const order = [...DRIVE_ORDER].sort((a, b) => r.drive[a].score - r.drive[b].score || DRIVE_ORDER.indexOf(a) - DRIVE_ORDER.indexOf(b));
  for (const k of order) if (belowFull(r.drive[k].score)) lines.push(...componentLines(k, r, ctx.log, ctx.reference, n));

  if (!belowFull(r.drive.radiation.score) && r.drive.radiation.fluoroS > 0) {
    lines.push(
      feedbackLine('drive.radiation_within', { fluoro_s: round(r.drive.radiation.fluoroS, 1), est_fluoro_s: round(r.drive.radiation.estFluoroS, 1) }, 'drive.radiation'),
    );
  }
  if (r.fluoroOverBudgetS > 0 && !starLost) lines.push(feedbackLine('result.over_budget_kept', budgetValues(), 'result.fluoro_budget'));
  return lines;
}
