/**
 * Drive score (spec §6.2), from the event log alone plus the case geometry and the references:
 * - path fidelity: mean over the samples of the tip's distance to the nearest point on the planned
 *   path's centerline segments; 0 mm → 100, ≥ 10 mm → 0.
 * - gentleness: peak and cumulative force against the reference drive (./reference).
 * - radiation: fluoro seconds against the route's estFluoroS.
 * - errors: 100 − 10·wrong branches − 15·prolapses − 5·back-outs, floor 0.
 * Time is reported, never scored.
 */

import type { DriveScore, EventLog, LoadedCase, Vec3 } from '../contracts';
import {
  DRIVE_WEIGHTS,
  ERROR_PENALTY,
  FIDELITY_ZERO_M,
  GENTLENESS_FLOOR_N,
  GENTLENESS_FLOOR_NS,
  GENTLENESS_SPAN,
  RADIATION_ZERO_FACTOR,
} from './constants';
import type { ForceReference } from './reference';

export type Segment = readonly [Vec3, Vec3];

/** Every centerline segment of the planned path's edges (metres, Y-up). */
export function planSegments(c: LoadedCase, path: readonly string[]): Segment[] {
  const out: Segment[] = [];
  for (const id of path) {
    const e = c.edges.find((x) => x.id === id);
    if (!e) throw new Error(`score: planned edge ${id} is not in case ${c.id}`);
    for (let i = 1; i < e.points.length; i++) out.push([e.points[i - 1]!, e.points[i]!]);
  }
  return out;
}

/** Distance from p to segment ab. */
export function pointSegmentDistance(p: readonly number[], a: readonly number[], b: readonly number[]): number {
  const ab0 = b[0]! - a[0]!;
  const ab1 = b[1]! - a[1]!;
  const ab2 = b[2]! - a[2]!;
  const ap0 = p[0]! - a[0]!;
  const ap1 = p[1]! - a[1]!;
  const ap2 = p[2]! - a[2]!;
  const len2 = ab0 * ab0 + ab1 * ab1 + ab2 * ab2;
  const t = len2 > 0 ? Math.max(0, Math.min(1, (ap0 * ab0 + ap1 * ab1 + ap2 * ab2) / len2)) : 0;
  return Math.hypot(ap0 - t * ab0, ap1 - t * ab1, ap2 - t * ab2);
}

/** §6.2 fidelity: (1/N) Σ_t min_q ‖tip_t − q‖ over the planned centerline. 0 with no samples. */
export function meanTipDistanceM(log: EventLog, segments: readonly Segment[]): number {
  if (log.samples.length === 0 || segments.length === 0) return 0;
  let sum = 0;
  for (const s of log.samples) {
    let d = Infinity;
    for (const [a, b] of segments) {
      const x = pointSegmentDistance(s.tip, a, b);
      if (x < d) d = x;
    }
    sum += d;
  }
  return sum / log.samples.length;
}

export const fidelityScore = (meanM: number): number => 100 * (1 - Math.min(1, meanM / FIDELITY_ZERO_M));

/** 100 at or below the reference, 0 at reference + SPAN × max(reference, floor). */
export function gentlenessPart(value: number, reference: number, floor: number): number {
  if (value <= reference) return 100;
  return 100 * (1 - Math.min(1, (value - reference) / (GENTLENESS_SPAN * Math.max(reference, floor))));
}

export function gentlenessScore(peakN: number, cumulativeNs: number, ref: Pick<ForceReference, 'peakForceN' | 'cumulativeForceNs'>): number {
  return (gentlenessPart(peakN, ref.peakForceN, GENTLENESS_FLOOR_N) + gentlenessPart(cumulativeNs, ref.cumulativeForceNs, GENTLENESS_FLOOR_NS)) / 2;
}

/** 100 within the estimate, 0 at ZERO_FACTOR × the estimate. */
export function radiationScore(fluoroS: number, estFluoroS: number): number {
  if (fluoroS <= estFluoroS) return 100;
  if (estFluoroS <= 0) return 0;
  return 100 * (1 - Math.min(1, (fluoroS - estFluoroS) / ((RADIATION_ZERO_FACTOR - 1) * estFluoroS)));
}

export function errorsScore(wrongBranches: number, prolapses: number, backOuts: number): number {
  return Math.max(0, 100 - ERROR_PENALTY.wrongBranch * wrongBranches - ERROR_PENALTY.prolapse * prolapses - ERROR_PENALTY.backOut * backOuts);
}

/** Force and fluoro totals from the samples, each sample standing for 1/sampleHz s. */
export function sampleTotals(log: EventLog): { peakForceN: number; cumulativeForceNs: number; fluoroS: number } {
  const dt = 1 / log.sampleHz;
  let peak = 0;
  let cum = 0;
  let fluoroSamples = 0;
  for (const s of log.samples) {
    if (s.forceN > peak) peak = s.forceN;
    cum += s.forceN * dt;
    if (s.fluoro) fluoroSamples++;
  }
  return { peakForceN: peak, cumulativeForceNs: cum, fluoroS: fluoroSamples * dt };
}

export function timeOf(log: EventLog): number {
  const reached = log.events.find((e) => e.kind === 'target_reached');
  return reached ? reached.t : (log.samples.at(-1)?.t ?? 0);
}

export function driveScore(log: EventLog, c: LoadedCase, estFluoroS: number, ref: ForceReference): DriveScore {
  const meanDistanceM = meanTipDistanceM(log, planSegments(c, log.path));
  const totals = sampleTotals(log);
  const count = (k: string) => log.events.filter((e) => e.kind === k).length;
  const wrongBranches = count('wrong_branch');
  const prolapses = count('prolapse');
  const backOuts = count('back_out');

  const fidelity = { score: fidelityScore(meanDistanceM), weight: DRIVE_WEIGHTS.fidelity, formulaRef: 'drive.fidelity' as const, meanDistanceM };
  const gentleness = {
    score: gentlenessScore(totals.peakForceN, totals.cumulativeForceNs, ref),
    weight: DRIVE_WEIGHTS.gentleness,
    formulaRef: 'drive.gentleness' as const,
    peakForceN: totals.peakForceN,
    cumulativeForceNs: totals.cumulativeForceNs,
  };
  const radiation = {
    score: radiationScore(totals.fluoroS, estFluoroS),
    weight: DRIVE_WEIGHTS.radiation,
    formulaRef: 'drive.radiation' as const,
    fluoroS: totals.fluoroS,
    estFluoroS,
  };
  const errors = {
    score: errorsScore(wrongBranches, prolapses, backOuts),
    weight: DRIVE_WEIGHTS.errors,
    formulaRef: 'drive.errors' as const,
    wrongBranches,
    prolapses,
    backOuts,
  };
  const score = fidelity.weight * fidelity.score + gentleness.weight * gentleness.score + radiation.weight * radiation.score + errors.weight * errors.score;
  return { score, fidelity, gentleness, radiation, errors, timeS: timeOf(log) };
}
