/**
 * Import a case.zip: one drop zone with a keyboard path (a real file input). The file is checked in this browser
 * by David's loader and never uploaded. Every result shows in §3.5 order; warnings offer their fix.
 */
import type { CaseLoadResult, LoadedCase } from '../contracts';
import { h, replace } from './dom';
import { labelled } from './icons';
import { href } from './router';
import { acceptFix, importZip } from './store';
import { validationList } from './validation-list';

export interface ImportPanel {
  element: HTMLElement;
  /** Focus the file chooser (the empty state's action). */
  focus: () => void;
}

export function targetList(c: LoadedCase): HTMLUListElement {
  return h(
    'ul',
    { class: 'target-list' },
    c.targets.map((t) =>
      h(
        'li',
        { class: t.reachable ? 'target' : 'target target-unreachable' },
        labelled('target', t.name),
        t.reachable ? null : h('span', { class: 'pill pill-neutral' }, 'Unreachable'),
      ),
    ),
  );
}

export function importPanel(onCatalogChange: () => void): ImportPanel {
  const input = h('input', { type: 'file', accept: '.zip,application/zip', class: 'visually-hidden', id: 'import-file', 'data-testid': 'import-input' });
  const choose = h('label', { for: 'import-file', class: 'btn btn-secondary' }, 'Choose a case.zip');
  const status = h('p', { class: 'import-status', role: 'status', 'aria-live': 'polite' });
  const result = h('div', { class: 'import-result', 'data-testid': 'import-result' });

  const zone = h(
    'div',
    { class: 'dropzone', 'data-testid': 'dropzone' },
    h('p', { class: 'dropzone-title' }, 'Drop a case.zip here'),
    h('p', { class: 'muted' }, 'It is checked in this browser and never uploaded.'),
    choose,
    input,
  );

  const show = (key: string | undefined, r: CaseLoadResult): void => {
    if (!r.ok) {
      status.textContent = `Rejected: ${r.results.length} ${r.results.length === 1 ? 'problem' : 'problems'} to fix in the package.`;
      replace(result, validationList(r.results));
      return;
    }
    const c = r.case;
    const warnings = c.validation.filter((v) => v.severity === 'warning').length;
    status.textContent = warnings ? `Loaded “${c.title}” with ${warnings} ${warnings === 1 ? 'warning' : 'warnings'}.` : `Loaded “${c.title}”.`;
    replace(
      result,
      validationList(c.validation, key ? (fix) => void accept(key, fix) : undefined),
      h('div', { class: 'import-summary' }, h('h3', {}, 'Targets'), targetList(c)),
      key ? h('a', { class: 'btn btn-secondary', href: href.brief(key) }, 'Open case brief') : null,
    );
  };

  const accept = async (key: string, fix: Parameters<typeof acceptFix>[1]): Promise<void> => {
    status.textContent = 'Applying the fix and checking again…';
    show(key, await acceptFix(key, fix));
    onCatalogChange();
  };

  const handle = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    status.textContent = `Checking ${file.name}…`;
    replace(result);
    const outcome = await importZip(file);
    show(outcome.key, outcome.result);
    if (outcome.key) onCatalogChange();
  };

  input.addEventListener('change', () => {
    void handle(input.files?.[0]);
    input.value = '';
  });
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dropzone-active');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dropzone-active'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dropzone-active');
    void handle(e.dataTransfer?.files[0]);
  });

  const element = h(
    'section',
    { class: 'block', 'aria-labelledby': 'import-heading' },
    h('h2', { id: 'import-heading' }, 'Import a case'),
    h('p', { class: 'subline' }, 'A case package in the threadsim.case/1 format: case.json, centerlines.json and vessels.glb.'),
    zone,
    status,
    result,
  );
  return { element, focus: () => choose.focus() };
}
