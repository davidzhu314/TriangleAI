/**
 * Study log: one record per procedure in a training session or a large-animal study, the plan beside what happened.
 * Pure functions plus a guarded localStorage store; no DOM, no AI. Records hold what a person typed, and plan values
 * copied from a case's apex plan (client/src/apex). The summary counts only what was entered.
 *
 * Storage is this browser's localStorage: the app has no server. CSV export and import move records between people
 * and keep them safe. Not for patient data: the screen says so, and nothing here is built to protect it.
 */
import type { Species } from '../contracts';

export const STUDY_KEY = 'threadsim.study.v1';

export const SPECIES: readonly Species[] = ['porcine', 'ovine', 'canine', 'human', 'other'];
export const SPECIES_WORD: Record<Species, string> = { porcine: 'Pig', ovine: 'Sheep', canine: 'Dog', human: 'Human (training only)', other: 'Other' };

export type Closure = 'yes' | 'partial' | 'no';
export const CLOSURE_WORD: Record<Closure, string> = { yes: 'Achieved', partial: 'Partial', no: 'Not achieved' };

export interface StudyRecord {
  id: string;
  /** Study label, e.g. "Pig 03". Never a name or a record number. */
  subject: string;
  species: Species;
  weightKg: number | null;
  /** YYYY-MM-DD. */
  date: string;
  /** The case the plan came from, if any. */
  caseKey: string | null;
  caseTitle: string | null;
  /** The apex plan's line id, and what it planned. */
  plannedLine: string | null;
  plannedIcs: number | null;
  plannedCoaxialDeg: number | null;
  /** True when the plan came from draft landmarks. */
  plannedFromDraft: boolean;
  actualIcs: number | null;
  attempts: number | null;
  timeToAccessMin: number | null;
  sheathFr: number | null;
  closure: Closure | null;
  bloodLossMl: number | null;
  notes: string;
}

export type RecordField = keyof StudyRecord;

export interface FieldError {
  field: RecordField;
  message: string;
}

// ================================================================ validation

type Rule = { min?: number; max?: number; integer?: boolean };
const NUMBER_RULES: Partial<Record<RecordField, Rule & { label: string }>> = {
  weightKg: { label: 'Weight', min: 0.1, max: 500 },
  plannedIcs: { label: 'Planned intercostal space', min: 1, max: 11, integer: true },
  plannedCoaxialDeg: { label: 'Planned angle', min: 0, max: 180 },
  actualIcs: { label: 'Intercostal space used', min: 1, max: 11, integer: true },
  attempts: { label: 'Attempts', min: 1, max: 50, integer: true },
  timeToAccessMin: { label: 'Time to access', min: 0, max: 600 },
  sheathFr: { label: 'Sheath size', min: 4, max: 40 },
  bloodLossMl: { label: 'Blood loss', min: 0, max: 20000 },
};

/** Patterns a study label must not look like: an email, a long digit run (a record number), a date of birth. */
const IDENTIFIER = [/@/, /\d{6,}/, /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/];

export function validateRecord(r: StudyRecord): FieldError[] {
  const errors: FieldError[] = [];
  // Stored or imported records may be missing fields: read them defensively.
  if (typeof r.subject !== 'string' || typeof r.notes !== 'string' || typeof r.id !== 'string') return [{ field: 'subject', message: 'Not a study record.' }];
  if (!r.subject.trim()) errors.push({ field: 'subject', message: 'Give the subject a study label, such as “Pig 03”.' });
  else if (IDENTIFIER.some((p) => p.test(r.subject))) errors.push({ field: 'subject', message: 'This looks like an identifier. Use a study label, such as “Pig 03”.' });
  if (!SPECIES.includes(r.species)) errors.push({ field: 'species', message: 'Choose a species.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || Number.isNaN(Date.parse(r.date))) errors.push({ field: 'date', message: 'Give the date as YYYY-MM-DD.' });
  for (const [field, rule] of Object.entries(NUMBER_RULES) as [RecordField, Rule & { label: string }][]) {
    const v = r[field];
    if (v === null) continue;
    if (typeof v !== 'number' || !Number.isFinite(v)) errors.push({ field, message: `${rule.label} must be a number.` });
    else if (rule.integer && !Number.isInteger(v)) errors.push({ field, message: `${rule.label} must be a whole number.` });
    else if ((rule.min !== undefined && v < rule.min) || (rule.max !== undefined && v > rule.max)) errors.push({ field, message: `${rule.label} must be between ${rule.min} and ${rule.max}.` });
  }
  if (r.closure !== null && !(r.closure in CLOSURE_WORD)) errors.push({ field: 'closure', message: 'Closure must be achieved, partial or not achieved.' });
  return errors;
}

export function blankRecord(today: string, id: string): StudyRecord {
  return {
    id,
    subject: '',
    species: 'porcine',
    weightKg: null,
    date: today,
    caseKey: null,
    caseTitle: null,
    plannedLine: null,
    plannedIcs: null,
    plannedCoaxialDeg: null,
    plannedFromDraft: false,
    actualIcs: null,
    attempts: null,
    timeToAccessMin: null,
    sheathFr: null,
    closure: null,
    bloodLossMl: null,
    notes: '',
  };
}

export function newRecordId(now = Date.now(), rand = Math.random): string {
  return `r-${now.toString(36)}-${Math.floor(rand() * 36 ** 4).toString(36).padStart(4, '0')}`;
}

// ================================================================ summary

export interface StudySummary {
  records: number;
  subjects: number;
  /** Records with both a planned and an actual intercostal space, and how many matched. */
  icsCompared: number;
  icsMatched: number;
  /** Medians over the records that have the value; null when none do. */
  medianAttempts: number | null;
  medianTimeMin: number | null;
  /** How many records have each closure outcome. */
  closure: Record<Closure, number>;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function summarize(records: readonly StudyRecord[]): StudySummary {
  const compared = records.filter((r) => r.plannedIcs !== null && r.actualIcs !== null);
  const closure: Record<Closure, number> = { yes: 0, partial: 0, no: 0 };
  for (const r of records) if (r.closure) closure[r.closure]++;
  return {
    records: records.length,
    subjects: new Set(records.map((r) => `${r.species}:${r.subject.trim().toLowerCase()}`)).size,
    icsCompared: compared.length,
    icsMatched: compared.filter((r) => r.plannedIcs === r.actualIcs).length,
    medianAttempts: median(records.flatMap((r) => (r.attempts === null ? [] : [r.attempts]))),
    medianTimeMin: median(records.flatMap((r) => (r.timeToAccessMin === null ? [] : [r.timeToAccessMin]))),
    closure,
  };
}

// ================================================================ CSV (RFC 4180)

/** Column order and header names. The header row is what an import matches on. */
export const CSV_COLUMNS: readonly [RecordField, string][] = [
  ['id', 'id'],
  ['subject', 'subject'],
  ['species', 'species'],
  ['weightKg', 'weight_kg'],
  ['date', 'date'],
  ['caseKey', 'case'],
  ['caseTitle', 'case_title'],
  ['plannedLine', 'planned_line'],
  ['plannedIcs', 'planned_ics'],
  ['plannedCoaxialDeg', 'planned_off_axis_deg'],
  ['plannedFromDraft', 'planned_from_draft'],
  ['actualIcs', 'actual_ics'],
  ['attempts', 'attempts'],
  ['timeToAccessMin', 'time_to_access_min'],
  ['sheathFr', 'sheath_fr'],
  ['closure', 'closure'],
  ['bloodLossMl', 'blood_loss_ml'],
  ['notes', 'notes'],
];

const NUMERIC = new Set<RecordField>(['weightKg', 'plannedIcs', 'plannedCoaxialDeg', 'actualIcs', 'attempts', 'timeToAccessMin', 'sheathFr', 'bloodLossMl']);
const NULLABLE_TEXT = new Set<RecordField>(['caseKey', 'caseTitle', 'plannedLine', 'closure']);

function cell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  // A leading = + - @ would run as a formula in a spreadsheet: prefix a quote mark.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(records: readonly StudyRecord[]): string {
  const rows = [CSV_COLUMNS.map(([, h]) => h).join(',')];
  for (const r of records) rows.push(CSV_COLUMNS.map(([k]) => cell(r[k])).join(','));
  return rows.join('\r\n') + '\r\n';
}

/** RFC 4180 rows: quoted fields, doubled quotes, CRLF or LF line ends. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

export interface CsvImport {
  records: StudyRecord[];
  /** One line per row that couldn't be read, with its row number in the file. */
  problems: string[];
}

export function fromCsv(text: string): CsvImport {
  const rows = parseCsvRows(text.replace(/^﻿/, ''));
  if (!rows.length) return { records: [], problems: ['The file is empty.'] };
  const header = rows[0]!.map((h) => h.trim());
  const at = new Map(header.map((h, i) => [h, i]));
  const missing = ['subject', 'species', 'date'].filter((h) => !at.has(h));
  if (missing.length) return { records: [], problems: [`Not a study log CSV: no ${missing.join(', ')} column.`] };
  const records: StudyRecord[] = [];
  const problems: string[] = [];
  for (const [n, row] of rows.slice(1).entries()) {
    const r = blankRecord('', '') as unknown as Record<RecordField, unknown>;
    for (const [k, h] of CSV_COLUMNS) {
      const i = at.get(h);
      if (i === undefined) continue;
      let raw = (row[i] ?? '').trim();
      if (raw.startsWith("'") && /^'[=+\-@]/.test(raw)) raw = raw.slice(1);
      if (NUMERIC.has(k)) r[k] = raw === '' ? null : Number(raw);
      else if (k === 'plannedFromDraft') r[k] = raw.toLowerCase() === 'true';
      else if (NULLABLE_TEXT.has(k)) r[k] = raw === '' ? null : raw;
      else r[k] = raw;
    }
    const rec = r as unknown as StudyRecord;
    if (!rec.id) rec.id = newRecordId(Date.now() + n);
    const errors = validateRecord(rec);
    if (errors.length) problems.push(`Row ${n + 2}: ${errors.map((e) => e.message).join(' ')}`);
    else records.push(rec);
  }
  return { records, problems };
}

/** Records from an import added to the log; one whose id is already there is skipped, never overwritten. */
export function mergeRecords(current: readonly StudyRecord[], incoming: readonly StudyRecord[]): { records: StudyRecord[]; added: number; skipped: number } {
  const ids = new Set(current.map((r) => r.id));
  const fresh = incoming.filter((r) => !ids.has(r.id));
  return { records: [...current, ...fresh], added: fresh.length, skipped: incoming.length - fresh.length };
}

/** Newest procedure first, then newest record. */
export function sortRecords(records: readonly StudyRecord[]): StudyRecord[] {
  return [...records].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

// ================================================================ storage

export interface Store {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/** The saved log; an unreadable or blocked store reads as empty (and says so through `ok`). */
export function loadRecords(store: Store | undefined = globalThis.localStorage): { records: StudyRecord[]; ok: boolean } {
  try {
    const raw = store?.getItem(STUDY_KEY);
    if (!raw) return { records: [], ok: !!store };
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return { records: [], ok: false };
    return { records: parsed.filter((r): r is StudyRecord => !!r && typeof r === 'object' && validateRecord(r as StudyRecord).length === 0), ok: true };
  } catch {
    return { records: [], ok: false };
  }
}

/** False when the browser blocks storage: the screen then tells the person to export. */
export function saveRecords(records: readonly StudyRecord[], store: Store | undefined = globalThis.localStorage): boolean {
  try {
    if (!store) return false;
    store.setItem(STUDY_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}
