/**
 * Feedback templates (spec §6.4). Text is filled only from `values`, so every number in a line comes
 * from computed results. Numbers are rounded for display before they go into `values`.
 */

import type { FeedbackLine, FormulaRef } from '../contracts';

export const FEEDBACK_TEMPLATES = {
  'plan.too_narrow': 'Route blocked: the {vessel} narrows to {diameter_mm} mm; the {preset} wire needs {required_mm} mm.',
  'plan.turn_too_sharp': 'Route blocked: the {turn_deg}° turn into the {vessel} is sharper than the {preset} wire can take ({max_turn_deg}°).',
  'plan.forbidden_zone': 'Route blocked: it passes through {zone}, a no-go zone.',
  'plan.arch_never_reached': 'Route blocked: the {preset} wire never reached the arch in the recorded runs.',
  'plan.no_safe_route': 'No safe route to the {target} with this entry and wire; every route is blocked or crosses a heavy risk zone.',
  'plan.heavy_crossing_shorter': 'Your route was {dl_cm} cm shorter but crossed {zone}. The {route} avoids it.',
  'plan.heavy_crossing': 'Your route crossed {zone}. The {route} avoids it.',
  'plan.heavy_crossing_no_alt': 'Your route crossed {zone}. No route to the {target} with these entries and wires avoids a heavy risk zone.',
  'plan.dominated': 'The {route} is at least as good as your route on every measure and better on some.',
  'plan.top_contributor_turn': 'Most of your penalty came from the {turn_deg}° turn into the {vessel}.',
  'plan.top_contributor': 'Most of your penalty came from {measure}: {value} {unit}.',
  'plan.best': 'Your route is the best available at your own weights.',
  'drive.not_reached': 'The wire did not reach the {target}.',
  'drive.fidelity_drift': 'The tip ran {mean_mm} mm from the planned centerline on average; {zero_mm} mm or more scores zero.',
  'drive.gentleness': 'Peak force was {peak_n} N against {ref_peak_n} N on the reference drive, and total force {cum_ns} N·s against {ref_cum_ns} N·s.',
  'drive.force_spike': 'Force spikes above {threshold_n} N: {n}. Ease off the push at sharp turns.',
  'drive.radiation_within': 'Fluoro ran {fluoro_s} s, within the {est_fluoro_s} s estimate for this route.',
  'drive.radiation_over': 'Fluoro ran {fluoro_s} s, {over_s} s over the {est_fluoro_s} s estimate for this route.',
  'drive.wrong_branch': 'Wrong branches: {n}, first into the {wrong_vessel}. Rotate the tip toward the {target_vessel} before pushing at the branch.',
  'drive.prolapse': 'Prolapses: {n}, first in the {vessel}. Pull back and re-aim instead of pushing harder.',
  'drive.back_out': 'Back-outs: {n}, at {penalty} points each. Aim the tip before you push.',
  'result.over_budget': "Fluoro went {over_s} s over this case's {budget_s} s allowance, which cost a star.",
  'result.over_budget_kept': "Fluoro went {over_s} s over this case's {budget_s} s allowance.",
} as const;

export type TemplateId = keyof typeof FEEDBACK_TEMPLATES;
export type TemplateValues = Record<string, number | string>;

/** Fill `{key}` placeholders from values. Throws if a key is missing. */
export function fillTemplate(template: string, values: TemplateValues): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    if (!(k in values)) throw new Error(`template value missing: ${k}`);
    return String(values[k]);
  });
}

export function feedbackLine(template: TemplateId, values: TemplateValues, formulaRef: FormulaRef): FeedbackLine {
  return { template, text: fillTemplate(FEEDBACK_TEMPLATES[template], values), values: { ...values }, formulaRef };
}

/** Round for display; never "-0". */
export function round(x: number, decimals: number): number {
  const r = Number(x.toFixed(decimals));
  return r === 0 ? 0 : r;
}
