/**
 * The generated ladder (spec §3.4, §6.5). D6-min shipped LOW_TORT and TYPE_III; D6 adds the rest.
 * Seeds were chosen with tune.test.ts; see the D6-min and D6 handoffs for what each seed gives.
 * Ladder tier comes from `anatomy` (client/src/score/progress.ts): Type I → 0, Type II → 1,
 * Type III → 2, bovine → 3.
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

/** Tier 0, second case: a Type I arch with a heavy left iliac plaque and narrower iliacs. */
export const TYPE_I_PLAQUE: ArchParams = {
  id: 'type-i-plaque',
  title: 'Type I arch, left iliac plaque',
  seed: 1,
  arch_type: 'I',
  bovine: false,
  tortuosity: 0.2,
  diameters_mm: { r_iliac: [8, 6.5], l_iliac: [8, 6.5] },
  entries: ['fem_r', 'fem_l', 'rad_r'],
  targets: ['rcca', 'lcca'],
  risk_zones: [
    { id: 'l_iliac_plaque', kind: 'plaque', tier: 'heavy', edge: 'e_l_iliac', from_mm: 40, to_mm: 75 },
    { id: 'bca_origin_plaque', kind: 'plaque', tier: 'proximity', edge: 'e_bca', from_mm: 0, to_mm: 8 },
  ],
  scenario: 'Teaching scenario: a 66-year-old with a Type I arch and a heavily calcified left iliac artery. Choose the access side, then reach each common carotid.',
  difficulty: 'beginner',
  fluoro_budget_s: 180,
};

/** Tier 1: a Type II arch with a small descending aortic aneurysm to keep clear of. */
export const TYPE_II: ArchParams = {
  id: 'type-ii',
  title: 'Type II arch, left carotid target',
  seed: 1,
  arch_type: 'II',
  bovine: false,
  tortuosity: 0.3,
  entries: ['fem_r', 'fem_l', 'rad_r', 'rad_l'],
  targets: ['lcca', 'rcca'],
  risk_zones: [{ id: 'desc_aneurysm', kind: 'aneurysm', tier: 'proximity', edge: 'e_aorta_desc', from_mm: 150, to_mm: 200 }],
  scenario: 'Teaching scenario: a 69-year-old with left carotid stenosis, a Type II arch and a small descending aortic aneurysm. Plan access to the left common carotid.',
  difficulty: 'intermediate',
  fluoro_budget_s: 210,
};

/** Tier 1, second case: a Type II arch with tortuous, narrow iliacs, where the arm can beat the groin. */
export const TYPE_II_TORTUOUS: ArchParams = {
  id: 'type-ii-tortuous',
  title: 'Type II arch, tortuous narrow iliacs',
  seed: 14,
  arch_type: 'II',
  bovine: false,
  tortuosity: 0.8,
  tortuosityWeight: { r_iliac: 1.5, l_iliac: 1.5 },
  diameters_mm: { r_iliac: [7, 5.5], l_iliac: [7, 5.5], r_subclavian: [9.5, 2.8] },
  entries: ['fem_r', 'fem_l', 'rad_r'],
  targets: ['rcca', 'lcca'],
  risk_zones: [],
  scenario: 'Teaching scenario: a 74-year-old with a Type II arch and tortuous, narrow iliac arteries. Compare groin and arm access to each common carotid.',
  difficulty: 'intermediate',
  fluoro_budget_s: 210,
};

/** Tier 3: a bovine arch (common brachiocephalic and left carotid origin). */
export const BOVINE_ARCH: ArchParams = {
  id: 'bovine',
  title: 'Bovine arch, left carotid target',
  seed: 1,
  arch_type: 'II',
  bovine: true,
  tortuosity: 0.3,
  entries: ['fem_r', 'fem_l', 'rad_r', 'rad_l'],
  targets: ['lcca', 'rcca'],
  risk_zones: [],
  scenario: 'Teaching scenario: a 63-year-old with left carotid stenosis and a bovine arch, where the brachiocephalic trunk and left common carotid share one origin. Plan access to the left common carotid.',
  difficulty: 'expert',
  fluoro_budget_s: 240,
};
