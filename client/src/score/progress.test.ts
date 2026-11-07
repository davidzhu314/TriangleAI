import { describe, expect, it } from 'vitest';
import type { CaseResult, Stars } from '../contracts';
import { rng } from '../optimize/graphs.testutil';
import { LOW_TORTUOSITY_MAX } from './constants';
import {
  adaptiveSuggestion,
  bestStars,
  completedCaseIds,
  courseGrade,
  currentTier,
  isUnlocked,
  ladderTier,
  nextCase,
  recordFromResult,
  unlockedCaseIds,
  unlockedTiers,
  type CaseMeta,
  type ProgressRecord,
} from './progress';

// made-up case metadata: the ladder reads nothing else
const LOW: CaseMeta = { id: 'low', anatomy: { tortuosity: 0.2 } };
const ARCH1: CaseMeta = { id: 'arch1', anatomy: { arch_type: 'I' } };
const TYPE2: CaseMeta = { id: 'type2', anatomy: { arch_type: 'II', tortuosity: 0.1 } };
const TYPE3: CaseMeta = { id: 'type3', anatomy: { arch_type: 'III' } };
const BOVINE: CaseMeta = { id: 'bovine', anatomy: { arch_type: 'III', bovine: true } };
const FIXTURE: CaseMeta = { id: 'fixture-y' };
const PHANTOM: CaseMeta = { id: 'phantom3', planningOnly: false };
const CASES: CaseMeta[] = [LOW, ARCH1, TYPE2, TYPE3, BOVINE, FIXTURE, PHANTOM];

const rec = (seq: number, caseId: string, reachedTarget: boolean, stars: Stars, fluoroOverBudgetS = 0): ProgressRecord => ({
  seq,
  caseId,
  reachedTarget,
  stars,
  fluoroOverBudgetS,
});

function deepFreeze<T>(x: T): T {
  if (x && typeof x === 'object') {
    for (const v of Object.values(x)) deepFreeze(v);
    Object.freeze(x);
  }
  return x;
}

function shuffled<T>(xs: readonly T[], seed: number): T[] {
  const r = rng(seed);
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

describe('ladder tiers (§6.5)', () => {
  it('maps each anatomy to its tier; no anatomy is outside the ladder', () => {
    expect([LOW, ARCH1, TYPE2, TYPE3, BOVINE, FIXTURE, PHANTOM].map(ladderTier)).toEqual([0, 0, 1, 2, 3, null, null]);
    expect(ladderTier({ id: 'x', anatomy: {} })).toBeNull();
  });

  it('bovine wins over arch type, and arch type over tortuosity', () => {
    expect(ladderTier({ id: 'b', anatomy: { arch_type: 'I', bovine: true } })).toBe(3);
    expect(ladderTier({ id: 'b', anatomy: { bovine: true } })).toBe(3);
    expect(ladderTier({ id: 'b', anatomy: { arch_type: 'III', bovine: false } })).toBe(2);
    expect(ladderTier(TYPE2)).toBe(1); // tortuosity 0.1 but arch type II
  });

  it('the tortuosity boundary sits at LOW_TORTUOSITY_MAX', () => {
    expect(ladderTier({ id: 't', anatomy: { tortuosity: LOW_TORTUOSITY_MAX } })).toBe(0);
    expect(ladderTier({ id: 't', anatomy: { tortuosity: LOW_TORTUOSITY_MAX + 1e-9 } })).toBeNull();
  });
});

describe('unlocking', () => {
  it('a fresh history opens tier 0 and the cases outside the ladder only', () => {
    expect(unlockedTiers(CASES, [], 'ladder')).toEqual([0]);
    expect(unlockedCaseIds(CASES, [], 'ladder')).toEqual(['arch1', 'low', 'fixture-y', 'phantom3']);
    for (const id of ['type2', 'type3', 'bovine']) expect(isUnlocked(id, CASES, [], 'ladder')).toBe(false);
  });

  it('finishing a case on tier n opens tier n + 1', () => {
    const h1 = [rec(1, 'low', true, 2)];
    expect(unlockedTiers(CASES, h1, 'ladder')).toEqual([0, 1]);
    const h2 = [...h1, rec(2, 'type2', true, 2)];
    expect(unlockedTiers(CASES, h2, 'ladder')).toEqual([0, 1, 2]);
    const h3 = [...h2, rec(3, 'type3', true, 2)];
    expect(unlockedTiers(CASES, h3, 'ladder')).toEqual([0, 1, 2, 3]);
    // tier 4 has no cases (no whole-body marker yet), so finishing tier 3 shows no new tier
    expect(unlockedTiers(CASES, [...h3, rec(4, 'bovine', true, 3)], 'ladder')).toEqual([0, 1, 2, 3]);
  });

  it('a failed attempt opens nothing', () => {
    expect(unlockedTiers(CASES, [rec(1, 'low', false, 0), rec(2, 'arch1', false, 0)], 'ladder')).toEqual([0]);
  });

  it('stars never gate progress: a 1★ finish and an over-budget finish both unlock', () => {
    expect(unlockedTiers(CASES, [rec(1, 'low', true, 1)], 'ladder')).toEqual([0, 1]);
    expect(unlockedTiers(CASES, [rec(1, 'arch1', true, 1, 45)], 'ladder')).toEqual([0, 1]);
  });

  it('an empty middle tier is skipped', () => {
    const noType2 = CASES.filter((c) => c !== TYPE2);
    expect(unlockedTiers(noType2, [], 'ladder')).toEqual([0]);
    expect(unlockedTiers(noType2, [rec(1, 'low', true, 1)], 'ladder')).toEqual([0, 2]);
    const noTier0 = [TYPE2, TYPE3];
    expect(unlockedTiers(noTier0, [], 'ladder')).toEqual([1]);
  });

  it('open mode unlocks every case on an empty history, the Type III one included', () => {
    expect(unlockedTiers(CASES, [], 'open')).toEqual([0, 1, 2, 3]);
    expect(isUnlocked('type3', CASES, [], 'open')).toBe(true);
    expect(unlockedCaseIds(CASES, [], 'open')).toEqual(['arch1', 'low', 'type2', 'type3', 'bovine', 'fixture-y', 'phantom3']);
  });

  it('currentTier is the highest open tier with cases', () => {
    expect(currentTier(CASES, [], 'ladder')).toBe(0);
    expect(currentTier(CASES, [rec(1, 'low', true, 1)], 'ladder')).toBe(1);
    expect(currentTier([FIXTURE], [], 'ladder')).toBeNull();
  });
});

describe('library helpers', () => {
  it('nextCase is the first unfinished unlocked case by (tier, id); null when all are done', () => {
    expect(nextCase(CASES, [], 'ladder')).toBe('arch1');
    expect(nextCase(CASES, [rec(1, 'arch1', true, 3)], 'ladder')).toBe('low');
    expect(nextCase(CASES, [rec(1, 'arch1', true, 3), rec(2, 'low', false, 0)], 'ladder')).toBe('low');
    expect(nextCase(CASES, [rec(1, 'arch1', true, 3), rec(2, 'low', true, 1)], 'ladder')).toBe('type2');
    const all = CASES.map((c, i) => rec(i + 1, c.id, true, 1));
    expect(nextCase(CASES, all, 'ladder')).toBeNull();
  });

  it('bestStars is the max over attempts, 0 with none', () => {
    const h = [rec(1, 'low', true, 1), rec(2, 'low', true, 3), rec(3, 'low', false, 0), rec(4, 'arch1', true, 2)];
    expect(bestStars('low', h)).toBe(3);
    expect(bestStars('arch1', h)).toBe(2);
    expect(bestStars('type3', h)).toBe(0);
  });

  it('completedCaseIds lists cases reached at least once, sorted', () => {
    expect(completedCaseIds([rec(2, 'low', true, 1), rec(1, 'arch1', true, 1), rec(3, 'type2', false, 0), rec(4, 'low', true, 2)])).toEqual(['arch1', 'low']);
  });

  it('recordFromResult copies what progression needs from a CaseResult', () => {
    const r = { caseId: 'low', reachedTarget: true, stars: 2, fluoroOverBudgetS: 3.5 } as CaseResult;
    expect(recordFromResult(7, r)).toEqual({ seq: 7, caseId: 'low', reachedTarget: true, stars: 2, fluoroOverBudgetS: 3.5 });
  });
});

describe('adaptive difficulty (§6.5)', () => {
  const opened = [rec(1, 'low', true, 2), rec(2, 'type2', true, 2)]; // tiers 0..2 open

  it('two 3★ on the player’s tier offer the next tier', () => {
    expect(adaptiveSuggestion(CASES, [rec(1, 'low', true, 3), rec(2, 'arch1', true, 3)], 'ladder')).toEqual({ kind: 'next_tier', tier: 1, caseIds: ['type2'] });
    expect(adaptiveSuggestion(CASES, [...opened, rec(3, 'type2', true, 3), rec(4, 'type2', true, 3)], 'ladder')).toEqual({
      kind: 'next_tier',
      tier: 2,
      caseIds: ['type3'],
    });
  });

  it('two 1★ suggest guided mode on the lowest-id tier-0 case', () => {
    expect(adaptiveSuggestion(CASES, [...opened, rec(3, 'type2', true, 1), rec(4, 'type2', true, 1)], 'ladder')).toEqual({ kind: 'guided', caseId: 'arch1' });
  });

  it('mixed results, a single record, or 0★ give no suggestion', () => {
    expect(adaptiveSuggestion(CASES, [rec(1, 'low', true, 3), rec(2, 'low', true, 1)], 'ladder')).toBeNull();
    expect(adaptiveSuggestion(CASES, [rec(1, 'low', true, 3)], 'ladder')).toBeNull();
    expect(adaptiveSuggestion(CASES, [rec(1, 'low', false, 0), rec(2, 'low', false, 0)], 'ladder')).toBeNull();
    expect(adaptiveSuggestion(CASES, [rec(1, 'low', true, 1), rec(2, 'low', false, 0)], 'ladder')).toBeNull();
    expect(adaptiveSuggestion(CASES, [], 'ladder')).toBeNull();
  });

  it('only the last two records on the player’s tier count; other tiers and unknown cases are ignored', () => {
    const h = [rec(1, 'low', true, 3), rec(2, 'fixture-y', true, 1), rec(3, 'ghost', true, 1), rec(4, 'arch1', true, 3)];
    expect(adaptiveSuggestion(CASES, h, 'ladder')).toMatchObject({ kind: 'next_tier', tier: 1 });
    // the player moved to tier 1: their tier-0 3★ results no longer count
    expect(adaptiveSuggestion(CASES, [...h, rec(5, 'type2', true, 3)], 'ladder')).toBeNull();
    // order is by seq, not by array position
    expect(adaptiveSuggestion(CASES, [rec(4, 'low', true, 1), rec(1, 'low', true, 3), rec(3, 'arch1', true, 1)], 'ladder')).toEqual({ kind: 'guided', caseId: 'arch1' });
  });

  it('the 3★ rule offers nothing past the last tier with cases', () => {
    const top = [...opened, rec(3, 'type3', true, 2), rec(4, 'bovine', true, 3), rec(5, 'bovine', true, 3)];
    expect(adaptiveSuggestion(CASES, top, 'ladder')).toBeNull();
  });

  it('guided falls back to the lowest tier with cases when tier 0 is empty', () => {
    expect(adaptiveSuggestion([TYPE2, TYPE3], [rec(1, 'type2', true, 1), rec(2, 'type2', true, 1)], 'ladder')).toEqual({ kind: 'guided', caseId: 'type2' });
  });
});

describe('course grading (§6.5)', () => {
  it('counts completion and attempts; nothing assigned gives 1', () => {
    const h = [rec(1, 'low', false, 0), rec(2, 'low', true, 1), rec(3, 'type3', false, 0), rec(4, 'other', true, 3)];
    expect(courseGrade(['low', 'type3', 'low'], h)).toEqual({
      assigned: 2,
      completed: 1,
      fraction: 0.5,
      perCase: { low: { completed: true, attempts: 2 }, type3: { completed: false, attempts: 1 } },
    });
    expect(courseGrade([], h)).toEqual({ assigned: 0, completed: 0, fraction: 1, perCase: {} });
  });

  it('never reads stars or fluoro: histories differing only there grade the same', () => {
    const a = [rec(1, 'low', true, 3, 0), rec(2, 'type3', true, 3, 0), rec(3, 'type2', false, 0)];
    const b = [rec(1, 'low', true, 1, 40), rec(2, 'type3', true, 1, 12.5), rec(3, 'type2', false, 0, 99)];
    expect(courseGrade(['low', 'type2', 'type3'], a)).toEqual(courseGrade(['low', 'type2', 'type3'], b));
  });
});

describe('determinism and validation', () => {
  const history = [
    rec(1, 'low', true, 3),
    rec(2, 'arch1', false, 0),
    rec(3, 'arch1', true, 3),
    rec(4, 'type2', true, 1),
    rec(5, 'type2', true, 1),
    rec(6, 'fixture-y', true, 2),
  ];
  const all = (cases: CaseMeta[], h: ProgressRecord[]) =>
    JSON.stringify({
      tiers: unlockedTiers(cases, h, 'ladder'),
      ids: unlockedCaseIds(cases, h, 'ladder'),
      current: currentTier(cases, h, 'ladder'),
      next: nextCase(cases, h, 'ladder'),
      done: completedCaseIds(h),
      best: CASES.map((c) => bestStars(c.id, h)), // fixed id order; the function itself takes one id
      suggestion: adaptiveSuggestion(cases, h, 'ladder'),
      grade: courseGrade(['type3', 'low', 'arch1'], h),
    });

  it('shuffling the case list or the history gives identical outputs', () => {
    const want = all(CASES, history);
    for (let seed = 1; seed <= 20; seed++) expect(all(shuffled(CASES, seed), shuffled(history, seed + 100))).toBe(want);
  });

  it('never mutates its inputs', () => {
    const cases = deepFreeze(structuredClone(CASES));
    const h = deepFreeze(structuredClone(history));
    expect(() => all(cases, h)).not.toThrow();
    expect(cases).toEqual(CASES);
    expect(h).toEqual(history);
  });

  it('throws on a repeated or non-integer seq, and on a repeated case id', () => {
    const dup = [rec(1, 'low', true, 1), rec(1, 'arch1', true, 1)];
    expect(() => unlockedTiers(CASES, dup, 'ladder')).toThrow(/seq 1/);
    expect(() => adaptiveSuggestion(CASES, dup, 'ladder')).toThrow(/seq 1/);
    expect(() => courseGrade(['low'], dup)).toThrow(/seq 1/);
    expect(() => bestStars('low', [rec(1.5, 'low', true, 1)])).toThrow(/integer/);
    expect(() => unlockedTiers([LOW, LOW], [], 'ladder')).toThrow(/case low/);
  });
});
