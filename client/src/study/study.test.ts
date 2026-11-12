import { describe, expect, it } from 'vitest';
import { blankRecord, fromCsv, loadRecords, median, mergeRecords, newRecordId, parseCsvRows, saveRecords, sortRecords, STUDY_KEY, summarize, toCsv, validateRecord, type StudyRecord } from '.';

const rec = (over: Partial<StudyRecord>): StudyRecord => ({ ...blankRecord('2026-11-12', 'r-1'), subject: 'Pig 01', ...over });

describe('study records', () => {
  it('needs a study label, a species and a date, and checks number ranges', () => {
    expect(validateRecord(rec({}))).toEqual([]);
    expect(validateRecord(rec({ subject: ' ' })).map((e) => e.field)).toEqual(['subject']);
    expect(validateRecord(rec({ date: '12/11/2026' })).map((e) => e.field)).toEqual(['date']);
    expect(validateRecord(rec({ attempts: 1.5 }))[0]!.message).toMatch(/whole number/);
    expect(validateRecord(rec({ actualIcs: 12 }))[0]!.message).toMatch(/between 1 and 11/);
    expect(validateRecord(rec({ bloodLossMl: -1 })).map((e) => e.field)).toEqual(['bloodLossMl']);
  });

  it('refuses labels that look like identifiers', () => {
    for (const subject of ['jane@example.org', 'MRN 12345678', 'born 03/04/1961']) {
      expect(validateRecord(rec({ subject }))[0]!.message, subject).toMatch(/identifier/);
    }
  });

  it('makes distinct ids', () => {
    expect(newRecordId(1000, () => 0.5)).not.toBe(newRecordId(1001, () => 0.5));
    expect(newRecordId(1000, () => 0)).toMatch(/^r-[0-9a-z]+-0000$/);
  });
});

describe('summary', () => {
  it('counts only what was entered', () => {
    const s = summarize([
      rec({ id: 'a', plannedIcs: 5, actualIcs: 5, attempts: 1, timeToAccessMin: 4, closure: 'yes' }),
      rec({ id: 'b', subject: 'pig 01', plannedIcs: 5, actualIcs: 6, attempts: 3, closure: 'partial' }),
      rec({ id: 'c', subject: 'Pig 02', actualIcs: 6 }),
    ]);
    expect(s).toEqual({ records: 3, subjects: 2, icsCompared: 2, icsMatched: 1, medianAttempts: 2, medianTimeMin: 4, closure: { yes: 1, partial: 1, no: 0 } });
    expect(summarize([]).medianAttempts).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
  });
});

describe('CSV', () => {
  it('round-trips records, including commas, quotes and line breaks in notes', () => {
    const records = [
      rec({ id: 'a', notes: 'Bled, then "settled"\nSecond line', plannedIcs: 5, plannedCoaxialDeg: 12.5, plannedFromDraft: true, caseKey: 'ts-s1404-cta', closure: 'yes', weightKg: 62 }),
      rec({ id: 'b', subject: 'Pig 02', species: 'ovine' }),
    ];
    const back = fromCsv(toCsv(records));
    expect(back.problems).toEqual([]);
    expect(back.records).toEqual(records);
  });

  it('defuses spreadsheet formulas and restores them on import', () => {
    const csv = toCsv([rec({ notes: '=HYPERLINK("x")' })]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(fromCsv(csv).records[0]!.notes).toBe('=HYPERLINK("x")');
    expect(toCsv([rec({ plannedCoaxialDeg: null, notes: '-3' })])).toContain(',-3\r\n');
  });

  it('reports bad rows by number and keeps the good ones', () => {
    const text = 'subject,species,date,attempts\nPig 01,porcine,2026-11-12,2\n,porcine,2026-11-12,1\nPig 03,porcine,2026-11-12,two\n';
    const r = fromCsv(text);
    expect(r.records.map((x) => x.subject)).toEqual(['Pig 01']);
    expect(r.problems).toHaveLength(2);
    expect(r.problems[0]).toMatch(/^Row 3:/);
    expect(r.problems[1]).toMatch(/^Row 4: Attempts must be a number/);
    expect(fromCsv('a,b\n1,2\n').problems[0]).toMatch(/Not a study log CSV/);
    expect(parseCsvRows('a,"b\r\nc"\r\n')).toEqual([['a', 'b\r\nc']]);
  });

  it('merges by id without overwriting', () => {
    const m = mergeRecords([rec({ id: 'a', notes: 'mine' })], [rec({ id: 'a', notes: 'theirs' }), rec({ id: 'b' })]);
    expect(m.added).toBe(1);
    expect(m.skipped).toBe(1);
    expect(m.records.find((r) => r.id === 'a')!.notes).toBe('mine');
  });

  it('sorts newest first', () => {
    expect(sortRecords([rec({ id: 'a', date: '2026-11-01' }), rec({ id: 'b', date: '2026-11-12' })]).map((r) => r.id)).toEqual(['b', 'a']);
  });
});

describe('storage', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };

  it('saves and loads, and drops malformed records', () => {
    const s = memory();
    expect(saveRecords([rec({ id: 'a' })], s)).toBe(true);
    expect(loadRecords(s).records.map((r) => r.id)).toEqual(['a']);
    s.setItem(STUDY_KEY, JSON.stringify([rec({ id: 'a' }), { id: 'x' }]));
    expect(loadRecords(s).records).toHaveLength(1);
  });

  it('reports blocked or corrupt storage instead of throwing', () => {
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadRecords(blocked)).toEqual({ records: [], ok: false });
    expect(saveRecords([], blocked)).toBe(false);
    const s = memory();
    s.setItem(STUDY_KEY, '{nope');
    expect(loadRecords(s).ok).toBe(false);
  });
});
