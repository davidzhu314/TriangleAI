/**
 * The live cost panel's rows: which cost-vector field, how it is shown, and its formula tooltip.
 * Units and decimals match the Results feedback (score/feedback.ts MEASURE_DISPLAY), so the same measure reads the
 * same everywhere. Tooltips restate the spec's own definitions (§4.2, §4.4, §4.6); they add no numbers.
 */
import type { CostVector, FormulaRef } from '../../contracts';

export interface CostRow {
  key: keyof CostVector;
  label: string;
  unit: string;
  /** Contract units → display units. */
  scale: number;
  decimals: number;
  formulaRef: FormulaRef;
  illustrative?: boolean;
}

export const COST_ROWS: readonly CostRow[] = [
  { key: 'lengthM', label: 'Length', unit: 'cm', scale: 100, decimals: 1, formulaRef: 'measure.length' },
  { key: 'sharpestTurnDeg', label: 'Sharpest turn', unit: '°', scale: 1, decimals: 0, formulaRef: 'measure.sharpest_turn' },
  { key: 'narrowestRadiusM', label: 'Narrowest radius', unit: 'mm', scale: 1000, decimals: 1, formulaRef: 'measure.narrowest' },
  { key: 'heavyCrossings', label: 'Heavy risk zones crossed', unit: '', scale: 1, decimals: 0, formulaRef: 'measure.heavy_crossings' },
  { key: 'proximityPenalty', label: 'Closeness to risk zones', unit: 'points', scale: 1, decimals: 2, formulaRef: 'measure.proximity' },
  { key: 'estFluoroS', label: 'Estimated fluoro time', unit: 's', scale: 1, decimals: 1, formulaRef: 'measure.est_fluoro', illustrative: true },
];

/** Every measure, for Compare's table and sliders: the Plan rows plus total turning and the two simulated measures. */
export const MEASURE_ROWS: readonly CostRow[] = [
  ...COST_ROWS.slice(0, 2),
  { key: 'totalTurningDeg', label: 'Total turning', unit: '°', scale: 1, decimals: 0, formulaRef: 'measure.total_turning' },
  ...COST_ROWS.slice(2),
  { key: 'simPeakForceN', label: 'Simulated peak force', unit: 'N', scale: 1, decimals: 2, formulaRef: 'measure.sim_peak_force' },
  { key: 'simSuccessRate', label: 'Simulated success rate', unit: '%', scale: 100, decimals: 0, formulaRef: 'measure.sim_success_rate' },
];

/** The two measures that exist only with real recorded runs (DECISIONS.md: recorded runs are real or absent). */
export const SIMULATED_KEYS: readonly string[] = ['simPeakForceN', 'simSuccessRate'];

/** Formula text per FormulaRef, from the spec. Only the refs the Plan and Compare screens show. */
export const FORMULA_TEXT: Partial<Record<FormulaRef, string>> = {
  'measure.length': 'Sum of the distances between consecutive centerline points along the route (spec §4.2).',
  'measure.sharpest_turn': 'The largest turning angle along the route, measured over a 5 mm window with branch points included (spec §4.2).',
  'measure.narrowest':
    'The smallest inscribed radius on any edge of the route, r_min (spec §4.2). Shown as a radius; a wire preset compares the diameter, 2 × r_min, with the device diameter plus 1 mm (§4.4).',
  'measure.heavy_crossings': 'How many heavy risk zones the route passes through (spec §4.6).',
  'measure.proximity': 'Sum over proximity zones of (1 − clearance / 10 mm), clamped at 0; no unit (spec §4.6).',
  'measure.est_fluoro': 'Length × seconds per cm + turns × seconds per turn (spec §4.6). The coefficients are illustrative.',
  'measure.total_turning': 'The sum of turning angles along the route, over a 5 mm window (spec §4.2, ΘΣ).',
  'measure.sim_peak_force': 'Peak wall force in the arch segment, from pre-recorded runs (spec §4.6).',
  'measure.sim_success_rate': 'Share of pre-recorded runs that reached the target (spec §4.6).',
  'rank.weighted': 'S = Σ w_k ĉ_k: each measure min–max normalised to 0–1 across the candidates, weighted by your sliders; lower is better (spec §4.8).',
};

export interface Formatted {
  /** null means missing: show a grey dash. */
  value: string | null;
  unit: string;
}

/** Format one cost value. A missing or non-finite value is a dash; a real zero prints as zero. */
export function formatCost(row: CostRow, cost: Partial<CostVector> | null | undefined): Formatted {
  const raw = cost?.[row.key];
  if (raw === undefined || !Number.isFinite(raw)) return { value: null, unit: row.unit };
  const rounded = Number((raw * row.scale).toFixed(row.decimals));
  const shown = rounded === 0 ? 0 : rounded; // a value that rounds to zero prints as zero, never "-0.00"
  return { value: shown.toLocaleString('en-US', { minimumFractionDigits: row.decimals, maximumFractionDigits: row.decimals }), unit: row.unit };
}
