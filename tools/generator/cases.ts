/**
 * The two D6-min cases (spec §3.4, DECISIONS.md "D6-min comes before the full generator").
 * Seeds were chosen with tune.test.ts; see the D6-min handoff for what each seed gives.
 */
import type { ArchParams } from './arch';

export const TYPE_III: ArchParams = {
  id: 'type-iii',
  title: 'Type III arch, right carotid target',
  seed: 251,
  arch_type: 'III',
  bovine: false,
  tortuosity: 0.6,
  // The scenario's tortuous right iliac.
  tortuosityWeight: { r_iliac: 1.6, l_iliac: 0.4 },
  entries: ['fem_r', 'fem_l', 'rad_r', 'rad_l'],
  targets: ['rcca', 'lcca'],
  risk_zones: [{ id: 'r_vertebral_origin', kind: 'critical_branch', tier: 'proximity', edge: 'e_r_arm', from_mm: 14, to_mm: 24 }],
  scenario: 'Teaching scenario: a 72-year-old with symptomatic right carotid stenosis, Type III arch and a tortuous right iliac artery. Plan access to the right common carotid.',
  difficulty: 'expert',
  fluoro_budget_s: 240,
};

export const LOW_TORT: ArchParams = {
  id: 'low-tort',
  title: 'Low-tortuosity arch, first case',
  seed: 1,
  arch_type: 'I',
  bovine: false,
  tortuosity: 0.05,
  entries: ['fem_r'],
  targets: ['rcca', 'lcca'],
  risk_zones: [],
  scenario: 'Teaching scenario: a 58-year-old with a smooth Type I arch. Learn the controls by reaching each common carotid from the right femoral artery.',
  difficulty: 'beginner',
  fluoro_budget_s: 180,
};
