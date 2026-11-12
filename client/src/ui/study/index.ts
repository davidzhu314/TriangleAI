/**
 * Study log — "What happened in each procedure, against its plan?" The list answers it: one row per record, planned
 * intercostal space beside the one used, attempts, time to access and closure, under a summary of the entered
 * records. The form adds or edits one record; opened from an apex plan's line, it copies that line's plan in.
 * Records live in this browser (client/src/study); CSV export and import keep and share them.
 */
import type { Species } from '../../contracts';
import {
  blankRecord,
  CLOSURE_WORD,
  fromCsv,
  loadRecords,
  mergeRecords,
  newRecordId,
  nextSubjectFrom,
  saveRecords,
  sortRecords,
  SPECIES,
  SPECIES_WORD,
  summarize,
  toCsv,
  validateRecord,
  type Closure,
  type FieldError,
  type RecordField,
  type StudyRecord,
} from '../../study';
import { loadApex } from '../apex';
import { dash, h } from '../dom';
import { href, type Route } from '../router';
import { honestyLine, renderShell } from '../shell';
import { entry, loadBundled } from '../store';
import './study.css';

const NOT_PATIENT = 'For training and animal-study records only. Don’t enter patient information.';
const LOCAL_ONLY = 'Saved in this browser only. Export a CSV to keep the log or share it.';

let notice: string | null = null;

const today = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function num(v: number | null, unit = '', digits = 0): Node {
  if (v === null) return dash('Not entered');
  return h('span', { class: 'figure num' }, v.toFixed(digits), unit ? h('span', { class: 'unit' }, ` ${unit}`) : null);
}

// ================================================================ list

function summaryCard(records: StudyRecord[]): HTMLElement {
  const s = summarize(records);
  const stat = (label: string, value: Node, note?: string) => h('div', { class: 'study-stat' }, h('dt', {}, label), h('dd', {}, value, note ? h('span', { class: 'muted study-stat-note' }, note) : null));
  return h(
    'section',
    { class: 'study-summary', 'aria-labelledby': 'study-summary-heading', 'data-testid': 'study-summary' },
    h('h2', { id: 'study-summary-heading', class: 'visually-hidden' }, 'Summary of the entered records'),
    h(
      'dl',
      { class: 'study-stats' },
      stat('Records', num(s.records), `${s.subjects} subject${s.subjects === 1 ? '' : 's'}`),
      stat('Planned space used', s.icsCompared ? h('span', { class: 'figure num' }, `${s.icsMatched} of ${s.icsCompared}`) : dash('No record has both a planned and a used space'), s.icsCompared ? 'records with both' : undefined),
      stat('Median attempts', num(s.medianAttempts, '', s.medianAttempts !== null && !Number.isInteger(s.medianAttempts) ? 1 : 0)),
      stat('Median time to access', num(s.medianTimeMin, 'min', 1)),
      stat('Closure achieved', h('span', { class: 'figure num' }, `${s.closure.yes}`), `${s.closure.partial} partial, ${s.closure.no} not`),
    ),
  );
}

function icsCell(r: StudyRecord): Node {
  if (r.plannedIcs === null && r.actualIcs === null) return dash('Not entered');
  const p = r.plannedIcs === null ? '—' : String(r.plannedIcs);
  const a = r.actualIcs === null ? '—' : String(r.actualIcs);
  const match = r.plannedIcs !== null && r.actualIcs !== null ? (r.plannedIcs === r.actualIcs ? h('span', { class: 'pill pill-positive' }, 'As planned') : h('span', { class: 'pill pill-warning' }, 'Different')) : null;
  return h('span', { class: 'study-ics' }, h('span', { class: 'num' }, `${p} → ${a}`), match);
}

function table(records: StudyRecord[]): HTMLElement {
  return h(
    'div',
    { class: 'study-table-scroll' },
    h(
      'table',
      { class: 'study-table', 'data-testid': 'study-table' },
      h(
        'thead',
        {},
        h('tr', {}, ['Date', 'Subject', 'Case and plan', 'Space, planned → used', 'Attempts', 'Time to access', 'Closure', ''].map((t, i) => h('th', { scope: 'col', class: [4, 5].includes(i) ? 'num' : '' }, t))),
      ),
      h(
        'tbody',
        {},
        sortRecords(records).map((r) =>
          h(
            'tr',
            { 'data-record': r.id },
            h('td', { class: 'study-date', 'data-label': 'Date' }, r.date),
            h('th', { scope: 'row', 'data-label': 'Subject' }, r.subject, h('span', { class: 'muted study-sub' }, SPECIES_WORD[r.species])),
            h(
              'td',
              { 'data-label': 'Case and plan' },
              r.caseTitle ?? dash('No case'),
              r.plannedLine ? h('span', { class: 'muted study-sub' }, `Line ${r.plannedLine}${r.plannedCoaxialDeg !== null ? `, ${r.plannedCoaxialDeg.toFixed(0)}° off axis` : ''}${r.plannedFromDraft ? ' (draft landmarks)' : ''}`) : null,
            ),
            h('td', { 'data-label': 'Space' }, icsCell(r)),
            h('td', { class: 'num', 'data-label': 'Attempts' }, num(r.attempts)),
            h('td', { class: 'num', 'data-label': 'Time to access' }, num(r.timeToAccessMin, 'min', 1)),
            h('td', { 'data-label': 'Closure' }, r.closure ? CLOSURE_WORD[r.closure] : dash('Not entered')),
            h('td', { class: 'study-row-actions' }, h('a', { href: href.studyEdit(r.id), 'aria-label': `Edit ${r.subject}, ${r.date}` }, 'Edit'), duplicateLink(r)),
          ),
        ),
      ),
    ),
  );
}

/** A record for the next subject on the same day and plan, opened in the form. */
let pendingNew: StudyRecord | null = null;

function duplicateLink(r: StudyRecord): HTMLElement {
  const b = h('button', { type: 'button', class: 'link-button', 'aria-label': `New record for the next subject, from ${r.subject}, ${r.date}`, 'data-duplicate': r.id }, 'Next subject');
  b.addEventListener('click', () => {
    pendingNew = nextSubjectFrom(r, newRecordId());
    location.hash = href.studyNew();
  });
  return b;
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function listBody(root: HTMLElement, records: StudyRecord[], storageOk: boolean): HTMLElement {
  const fileInput = h('input', { type: 'file', accept: '.csv,text/csv', id: 'study-import', class: 'visually-hidden', 'data-testid': 'study-import' }) as HTMLInputElement;
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    void file.text().then((text) => {
      const parsed = fromCsv(text);
      const merged = mergeRecords(loadRecords().records, parsed.records);
      const saved = saveRecords(merged.records);
      notice = [
        `Imported ${merged.added} record${merged.added === 1 ? '' : 's'}${merged.skipped ? `; ${merged.skipped} already in the log, kept as they were` : ''}.`,
        ...parsed.problems,
        saved ? '' : 'This browser blocks storage: export before you leave.',
      ]
        .filter(Boolean)
        .join(' ');
      void renderStudy(root, { name: 'study' });
    });
  });
  const exportButton = h('button', { type: 'button', class: 'btn btn-secondary', 'data-testid': 'study-export', disabled: records.length === 0 }, 'Export CSV');
  exportButton.addEventListener('click', () => download(`study-log-${today()}.csv`, toCsv(sortRecords(records))));

  return h(
    'div',
    { class: 'screen study' },
    h('div', { class: 'title-row' }, h('h1', {}, 'Study log')),
    h('p', { class: 'study-note', role: 'note' }, `${LOCAL_ONLY} ${NOT_PATIENT}`),
    !storageOk ? h('p', { class: 'study-warning', role: 'alert' }, 'This browser blocks storage, so records won’t be kept after you leave. Export a CSV before you do.') : null,
    notice ? h('p', { class: 'study-notice', role: 'status', 'data-testid': 'study-notice' }, notice) : null,
    h('div', { class: 'actions' }, h('a', { class: 'btn btn-primary', href: href.studyNew(), 'data-testid': 'study-new' }, 'New record'), exportButton, h('label', { for: 'study-import', class: 'btn btn-secondary' }, 'Import CSV'), fileInput),
    records.length
      ? [summaryCard(records), table(records)]
      : h('p', { class: 'muted study-empty' }, 'No records yet. Add one here, or from a line on a case’s apex plan (“Log a procedure from this line”).'),
    honestyLine(),
  );
}

// ================================================================ form

interface FieldSpec {
  field: RecordField;
  label: string;
  hint?: string;
  kind: 'text' | 'number' | 'date' | 'species' | 'closure' | 'notes';
  step?: string;
  readOnly?: boolean;
}

function control(spec: FieldSpec, r: StudyRecord, error: string | undefined): HTMLElement {
  const id = `study-${spec.field}`;
  const describedBy = [spec.hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || null;
  const common = { id, name: spec.field, 'aria-describedby': describedBy, 'aria-invalid': error ? 'true' : null, 'data-field': spec.field };
  const value = r[spec.field];
  let input: HTMLElement;
  if (spec.kind === 'species') {
    input = h('select', { ...common, class: 'select' }, SPECIES.map((s) => h('option', { value: s, selected: value === s }, SPECIES_WORD[s])));
  } else if (spec.kind === 'closure') {
    input = h('select', { ...common, class: 'select' }, h('option', { value: '', selected: value === null }, 'Not entered'), (Object.keys(CLOSURE_WORD) as Closure[]).map((c) => h('option', { value: c, selected: value === c }, CLOSURE_WORD[c])));
  } else if (spec.kind === 'notes') {
    input = h('textarea', { ...common, class: 'input', rows: '3' }, String(value ?? ''));
  } else {
    input = h('input', {
      ...common,
      class: 'input',
      type: spec.kind === 'number' ? 'number' : spec.kind,
      inputmode: spec.kind === 'number' ? 'decimal' : null,
      step: spec.step ?? (spec.kind === 'number' ? 'any' : null),
      value: value === null || value === undefined ? '' : String(value),
      readonly: spec.readOnly ?? false,
      autocomplete: 'off',
    });
  }
  return h(
    'div',
    { class: spec.kind === 'notes' ? 'study-field study-field-wide' : 'study-field' },
    h('label', { for: id, class: 'field-label' }, spec.label),
    input,
    spec.hint ? h('p', { id: `${id}-hint`, class: 'muted study-hint' }, spec.hint) : null,
    error ? h('p', { id: `${id}-error`, class: 'study-error' }, error) : null,
  );
}

function read(form: HTMLFormElement, base: StudyRecord): StudyRecord {
  const r = { ...base } as Record<RecordField, unknown>;
  for (const el of Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-field]'))) {
    const f = el.dataset['field'] as RecordField;
    const raw = el.value.trim();
    if (el instanceof HTMLInputElement && el.type === 'number') r[f] = raw === '' ? null : Number(raw);
    else if (f === 'closure') r[f] = raw === '' ? null : raw;
    else if (f === 'notes') r[f] = el.value;
    else r[f] = raw;
  }
  return r as unknown as StudyRecord;
}

const SUBJECT: FieldSpec[] = [
  { field: 'subject', label: 'Study label', hint: 'Such as “Pig 03”. Never a name or record number.', kind: 'text' },
  { field: 'species', label: 'Species', kind: 'species' },
  { field: 'weightKg', label: 'Weight (kg)', kind: 'number' },
  { field: 'date', label: 'Date', kind: 'date' },
];
const PROCEDURE: FieldSpec[] = [
  { field: 'actualIcs', label: 'Intercostal space used', hint: 'Space k lies between ribs k and k + 1.', kind: 'number', step: '1' },
  { field: 'attempts', label: 'Puncture attempts', kind: 'number', step: '1' },
  { field: 'timeToAccessMin', label: 'Time to access (min)', hint: 'Skin incision to sheath in the ventricle.', kind: 'number' },
  { field: 'sheathFr', label: 'Sheath size (Fr)', kind: 'number' },
  { field: 'closure', label: 'Closure', kind: 'closure' },
  { field: 'bloodLossMl', label: 'Blood loss (mL)', kind: 'number' },
  { field: 'notes', label: 'Notes', kind: 'notes' },
];

function formBody(root: HTMLElement, base: StudyRecord, isNew: boolean, errors: FieldError[] = []): HTMLElement {
  const err = new Map(errors.map((e) => [e.field, e.message]));
  const fromPlan = base.plannedLine !== null;
  const plan: FieldSpec[] = [
    { field: 'plannedIcs', label: 'Planned intercostal space', kind: 'number', step: '1', readOnly: fromPlan },
    { field: 'plannedCoaxialDeg', label: 'Planned angle off valve axis (°)', kind: 'number', readOnly: fromPlan },
  ];
  const form = h('form', { class: 'study-form', novalidate: true, 'data-testid': 'study-form' }) as HTMLFormElement;
  const fieldset = (legend: string, specs: FieldSpec[], extra?: Node | null) => h('fieldset', { class: 'study-fieldset' }, h('legend', {}, legend), extra ?? null, h('div', { class: 'study-grid' }, specs.map((s) => control(s, base, err.get(s.field)))));
  const planNote = base.caseTitle
    ? h(
        'p',
        { class: 'muted study-plan-note' },
        fromPlan ? `From the apex plan of ${base.caseTitle}, line ${base.plannedLine}${base.plannedFromDraft ? ' (draft landmarks: not anatomy)' : ''}.` : `Case: ${base.caseTitle}.`,
      )
    : h('p', { class: 'muted study-plan-note' }, 'No case linked. Open a case’s apex plan and use “Log a procedure from this line” to copy its plan in, or type the plan here.');
  const actions = h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'btn btn-primary', 'data-testid': 'study-save' }, isNew ? 'Save record' : 'Save changes'), h('a', { class: 'btn btn-secondary', href: href.study() }, 'Cancel'));
  if (!isNew) {
    const del = h('button', { type: 'button', class: 'btn btn-secondary study-delete', 'data-testid': 'study-delete' }, 'Delete record');
    del.addEventListener('click', () => {
      if (!window.confirm(`Delete the record for ${base.subject} on ${base.date}? This can’t be undone unless you exported it.`)) return;
      const { records } = loadRecords();
      saveRecords(records.filter((x) => x.id !== base.id));
      notice = `Deleted the record for ${base.subject}.`;
      location.hash = href.study();
    });
    actions.append(del);
  }
  form.append(
    errors.length ? h('p', { class: 'study-warning', role: 'alert', 'data-testid': 'study-errors' }, `Check ${errors.length} field${errors.length === 1 ? '' : 's'}: ${errors.map((e) => e.message).join(' ')}`) : '',
    fieldset('Subject', SUBJECT),
    fieldset('Plan', plan, planNote),
    fieldset('Procedure', PROCEDURE),
    actions,
  );
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const r = read(form, base);
    const problems = validateRecord(r);
    if (problems.length) {
      frame(root, isNew ? 'New record' : 'Edit record', formBody(root, r, isNew, problems));
      root.querySelector<HTMLElement>(`[data-field="${problems[0]!.field}"]`)?.focus();
      return;
    }
    const { records } = loadRecords();
    const saved = saveRecords(isNew ? [...records, r] : records.map((x) => (x.id === r.id ? r : x)));
    notice = saved ? `Saved the record for ${r.subject}.` : 'This browser blocks storage: the record is shown until you leave. Export a CSV now.';
    if (!saved) memoryOnly = isNew ? [...memoryOnly, r] : memoryOnly.map((x) => (x.id === r.id ? r : x));
    location.hash = href.study();
  });
  return h(
    'div',
    { class: 'screen study' },
    h('div', { class: 'title-row' }, h('h1', {}, isNew ? 'New record' : `Edit record: ${base.subject}`)),
    h('p', { class: 'study-note', role: 'note' }, NOT_PATIENT),
    form,
    honestyLine(),
  );
}

/** Records kept in memory when the browser blocks storage, so a save still shows until the page is left. */
let memoryOnly: StudyRecord[] = [];

function frame(root: HTMLElement, title: string, body: Node): void {
  renderShell(root, { crumbs: title === 'Study log' ? [{ label: 'Study log' }] : [{ label: 'Study log', href: href.study() }, { label: title }], body }, 'study');
}

/** A new record with the plan copied from a case's apex plan line, when the route names one that exists. */
async function prefilled(caseKey: string | undefined, line: string | undefined): Promise<StudyRecord> {
  const r = blankRecord(today(), newRecordId());
  if (!caseKey) return r;
  await loadBundled().catch(() => undefined);
  const e = entry(caseKey);
  if (!e || !e.result.ok) return r;
  const c = e.result.case;
  r.caseKey = caseKey;
  r.caseTitle = c.title;
  if (c.subject) r.species = c.subject.species as Species;
  if (c.subject?.label) r.subject = c.subject.label;
  const load = await loadApex(e);
  const sel = load.kind === 'plan' && line ? load.plan.frontier.find((f) => f.id === line) : undefined;
  if (sel && load.kind === 'plan') {
    r.plannedLine = sel.id;
    r.plannedIcs = sel.ics;
    r.plannedCoaxialDeg = Math.round(sel.coaxialDeg * 10) / 10;
    r.plannedFromDraft = load.plan.draft;
  }
  return r;
}

export async function renderStudy(root: HTMLElement, r: Extract<Route, { name: 'study' | 'study-new' | 'study-edit' }>): Promise<void> {
  if (r.name === 'study-new') {
    const base = pendingNew && !r.caseKey ? pendingNew : await prefilled(r.caseKey, r.line);
    pendingNew = null;
    frame(root, 'New record', formBody(root, base, true));
    return;
  }
  const { records, ok } = loadRecords();
  const all = ok ? records : memoryOnly;
  if (r.name === 'study-edit') {
    const rec = all.find((x) => x.id === r.id);
    if (rec) frame(root, 'Edit record', formBody(root, rec, false));
    else frame(root, 'Record not found', h('div', { class: 'screen study' }, h('div', { class: 'title-row' }, h('h1', {}, 'Record not found')), h('p', { class: 'muted' }, 'No record with that id is in this browser’s log.'), h('a', { class: 'btn btn-primary', href: href.study() }, 'Back to the study log')));
    return;
  }
  frame(root, 'Study log', listBody(root, all, ok));
  notice = null;
}
