/**
 * 5 mm-window turning (spec §4.2; definition in DECISIONS.md and tests/crosscheck/README.md).
 *
 * θ_w(s) is the angle between the chords p(s) − p(s − w) and p(s + w) − p(s). It is sampled at
 * n + 1 evenly spaced s in [w, L − w], with n = max(1, ceil((L − 2w)/step)), plus any extra arc
 * lengths strictly inside (w, L − w) (route junctions). If L < 2w, the window becomes w = L/2.
 *   Θmax = max θ_w
 *   ΘΣ   = (1/w)·trapz(θ_w, s) + θ_w(first) + θ_w(last)
 */

import { angleBetween, cumulativeArclength, pointAt, sub, type Polyline } from './polyline';

export const WINDOW_MM = 5;
export const SAMPLE_STEP_MM = 0.25;

const DEG = 180 / Math.PI;

export interface WindowedTurning {
  /** Sample arc lengths, ascending. */
  s: number[];
  /** θ_w at each sample, radians. */
  thetaRad: number[];
  /** Window actually used (w, or L/2 for a short edge); 0 when there are no samples. */
  windowUsed: number;
}

export interface TurningMeasures {
  thetaMaxDeg: number;
  thetaSumDeg: number;
}

export function windowedTurning(
  points: Polyline,
  windowMm: number = WINDOW_MM,
  stepMm: number = SAMPLE_STEP_MM,
  extraS: readonly number[] = [],
): WindowedTurning {
  const cs = cumulativeArclength(points);
  const L = cs.length ? cs[cs.length - 1]! : 0;
  if (points.length < 3 || L <= 1e-9) return { s: [], thetaRad: [], windowUsed: 0 };

  const w = Math.min(windowMm, L / 2);
  const span = L - 2 * w;
  const n = Math.max(1, Math.ceil(span / stepMm - 1e-9));
  // numpy.linspace: start + i*step, last sample exactly at stop
  const step = span / n;
  let s: number[] = [];
  for (let i = 0; i < n; i++) s.push(w + i * step);
  s.push(L - w);

  const extra = extraS.filter((x) => w < x && x < L - w);
  if (extra.length) {
    // numpy.unique: sorted, exact duplicates removed
    const merged = s.concat(extra).sort((a, b) => a - b);
    s = merged.filter((x, i) => i === 0 || x !== merged[i - 1]);
  }

  const thetaRad = s.map((si) => {
    const a = pointAt(points, si - w, cs);
    const b = pointAt(points, si, cs);
    const c = pointAt(points, si + w, cs);
    return angleBetween(sub(b, a), sub(c, b));
  });
  return { s, thetaRad, windowUsed: w };
}

export function turningMeasures(
  points: Polyline,
  windowMm: number = WINDOW_MM,
  stepMm: number = SAMPLE_STEP_MM,
  extraS: readonly number[] = [],
): TurningMeasures {
  const { s, thetaRad: th, windowUsed: w } = windowedTurning(points, windowMm, stepMm, extraS);
  if (th.length === 0) return { thetaMaxDeg: 0, thetaSumDeg: 0 };
  let total = th[0]! + th[th.length - 1]!;
  if (s.length > 1) {
    let integral = 0;
    for (let i = 1; i < s.length; i++) integral += ((th[i]! + th[i - 1]!) / 2) * (s[i]! - s[i - 1]!);
    total += integral / w;
  }
  let max = -Infinity;
  for (const t of th) if (t > max) max = t;
  return { thetaMaxDeg: max * DEG, thetaSumDeg: total * DEG };
}

/** r_min = min radiiₘₘ. */
export function rMinMm(radii: readonly number[]): number {
  if (radii.length === 0) throw new Error('rMinMm: no radii');
  let m = Infinity;
  for (const r of radii) if (r < m) m = r;
  return m;
}
