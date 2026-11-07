/**
 * Voice-review guard (V7, DECISIONS.md "Feedback voice review rule"). Aroovee may change the words of
 * a feedback template, never its numbers:
 * - each template keeps exactly its {placeholders} (the frozen map below; changing it on purpose
 *   means updating the map in the same commit);
 * - no template text contains a digit, so every number on screen comes from computed values;
 * - no template contains a never-say phrase (spec §9.4, team/DEMO.md).
 * Also: every template is used by feedback.ts, replay.ts or live.ts, and they use no unknown template.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FEEDBACK_TEMPLATES, type TemplateId } from './templates';

const PLACEHOLDERS: Readonly<Record<TemplateId, readonly string[]>> = Object.freeze({
  'plan.too_narrow': ['diameter_mm', 'preset', 'required_mm', 'vessel'],
  'plan.turn_too_sharp': ['max_turn_deg', 'preset', 'turn_deg', 'vessel'],
  'plan.forbidden_zone': ['zone'],
  'plan.arch_never_reached': ['preset'],
  'plan.no_safe_route': ['target'],
  'plan.heavy_crossing_shorter': ['dl_cm', 'route', 'zone'],
  'plan.heavy_crossing': ['route', 'zone'],
  'plan.heavy_crossing_no_alt': ['target', 'zone'],
  'plan.dominated': ['route'],
  'plan.top_contributor_turn': ['turn_deg', 'vessel'],
  'plan.top_contributor': ['measure', 'unit', 'value'],
  'plan.best': [],
  'drive.not_reached': ['target'],
  'drive.fidelity_drift': ['mean_mm', 'zero_mm'],
  'drive.gentleness': ['cum_ns', 'peak_n', 'ref_cum_ns', 'ref_peak_n'],
  'drive.force_spike': ['n', 'threshold_n'],
  'drive.radiation_within': ['est_fluoro_s', 'fluoro_s'],
  'drive.radiation_over': ['est_fluoro_s', 'fluoro_s', 'over_s'],
  'drive.wrong_branch': ['n', 'target_vessel', 'wrong_vessel'],
  'drive.prolapse': ['n', 'vessel'],
  'drive.back_out': ['n', 'penalty'],
  'result.over_budget': ['budget_s', 'over_s'],
  'result.over_budget_kept': ['budget_s', 'over_s'],
  'replay.wrong_branch': ['expected_vessel', 'vessel'],
  'replay.prolapse': ['vessel'],
  'replay.force_spike': ['force_n', 'threshold_n'],
  'replay.back_out': ['dist_mm'],
  'replay.contrast_puff': [],
  'replay.target_reached': ['target'],
  'assist.next_branch': ['vessel'],
  'assist.pull_back': ['vessel', 'wrong_vessel'],
  'assist.at_target': ['target'],
  'assist.best_route': ['label', 'vessel'],
  'assist.best_route_plain': ['vessel'],
  'assist.options': ['n', 'vessels'],
  'assist.off_frontier': ['vessels'],
  'assist.complete': ['target'],
  'assist.no_continuation': ['target'],
  'assist.no_safe_route': [],
});

/** Spec §9.4 "must not say" and team/DEMO.md "Never say". */
export const NEVER_SAY = ['realistic catheter simulation', 'safer for patients', 'clinically validated', 'optimal route'];

const ids = Object.keys(FEEDBACK_TEMPLATES) as TemplateId[];
const placeholdersOf = (t: string) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

describe('feedback voice guard', () => {
  it('the frozen map lists exactly the templates', () => {
    expect(Object.keys(PLACEHOLDERS).sort()).toEqual([...ids].sort());
  });

  it.each(ids)('%s keeps its placeholders, has no digit and says nothing on the never-say list', (id) => {
    const text: string = FEEDBACK_TEMPLATES[id];
    expect(placeholdersOf(text)).toEqual([...PLACEHOLDERS[id]]);
    expect(text).not.toMatch(/[0-9]/);
    for (const phrase of NEVER_SAY) expect(text.toLowerCase()).not.toContain(phrase);
  });

  it('feedback.ts, replay.ts and live.ts use every template and no unknown one', () => {
    const src = ['feedback.ts', 'replay.ts', 'live.ts'].map((f) => readFileSync(join(import.meta.dirname, f), 'utf8')).join('\n');
    const used = new Set([...src.matchAll(/feedbackLine\(\s*'([\w.]+)'/g)].map((m) => m[1]!));
    expect([...used].sort()).toEqual([...ids].sort());
  });
});
