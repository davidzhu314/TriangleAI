/**
 * Library — "Which case do I do next?" A grid of case cards, each with the case's own vessel drawing, its title,
 * its synopsis, difficulty, mode and stars, and where the trainee left off this session. Filters by difficulty and
 * arch type sit over the grid; "Add a case" opens a dialog holding the import panel, with a name and a synopsis.
 *
 * The suggested next case (V6 nextCase) is marked on its card and is the shell's "Open case" action. Every card's
 * title links to the case brief (the tutorial anchors on that link). The grid redraws in place, so the add-case
 * dialog stays open while a package is checked and fixed.
 */
import type { ArchType, CaseDifficulty, LoadedCase } from '../contracts';
import { drawCase } from '../render/case-svg';
import { difficultyPill, modeBadge, stars } from './badges';
import { caseZip, saveAs } from './case-zip';
import { h, replace } from './dom';
import { art } from './icons';
import { importPanel, type ImportPanel } from './import-panel';
import { probePhysicsCases } from './physics-probe';
import { href, parseRoute } from './router';
import { honestyLine, renderShell } from './shell';
import type { CatalogEntry } from './store';
import { addPhysicsCase, caseMeta, catalog, entry, loadBundled, nextCase, saveCaseMeta, stageFor, starsFor } from './store';

const CRUMBS = [{ label: 'Library' }];

type DifficultyFilter = 'all' | CaseDifficulty;
type ArchFilter = 'all' | ArchType | 'bovine';

const DIFFICULTIES: readonly [DifficultyFilter, string][] = [
  ['all', 'All'],
  ['beginner', 'Beginner'],
  ['intermediate', 'Intermediate'],
  ['expert', 'Expert'],
];
const ARCHES: readonly [ArchFilter, string][] = [
  ['all', 'Any arch'],
  ['I', 'Type I arch'],
  ['II', 'Type II arch'],
  ['III', 'Type III arch'],
  ['bovine', 'Bovine arch'],
];

/** Filters last for the visit. */
const filter: { difficulty: DifficultyFilter; arch: ArchFilter } = { difficulty: 'all', arch: 'all' };

const matches = (c: LoadedCase): boolean =>
  (filter.difficulty === 'all' || c.difficulty === filter.difficulty) &&
  (filter.arch === 'all' || (filter.arch === 'bovine' ? c.anatomy?.bovine === true : c.anatomy?.arch_type === filter.arch));

const STAGE_WORDS = { plan: { words: 'Left off at Plan', link: 'Resume planning', to: href.plan }, results: { words: 'Left off at Results', link: 'See results', to: href.results } } as const;

/** The case's own vessels, flat, as the card's picture. Decorative: the title says which case it is. */
function picture(e: CatalogEntry, c: LoadedCase): HTMLElement {
  const box = h('div', { class: 'case-card-picture', 'aria-hidden': 'true' });
  try {
    const d = drawCase(c, c.title, `thumb-hatch-${e.key.replace(/[^a-z0-9-]/gi, '-')}`);
    d.svg.removeAttribute('role');
    d.svg.removeAttribute('aria-label');
    d.svg.setAttribute('class', 'case-card-svg');
    box.append(d.svg);
  } catch {
    // a case with no drawable geometry keeps the plain tile
  }
  return box;
}

/** "…" menu: download the case package. */
function cardMenu(e: CatalogEntry, title: string): HTMLElement {
  const id = `case-menu-${e.key.replace(/[^a-z0-9-]/gi, '-')}`;
  const button = h('button', { type: 'button', class: 'btn-icon case-card-more', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-controls': id, 'aria-label': `More for ${title}` }, '…');
  const download = h('button', { type: 'button', class: 'case-menu-item', role: 'menuitem' }, 'Download case (.zip)');
  const note = h('p', { class: 'case-menu-note', role: 'status' });
  const menu = h('div', { class: 'case-menu', id, role: 'menu', hidden: true }, download, note);
  const open = (on: boolean): void => {
    menu.hidden = !on;
    button.setAttribute('aria-expanded', String(on));
    if (on) download.focus();
  };
  button.addEventListener('click', () => open(button.getAttribute('aria-expanded') !== 'true'));
  menu.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      open(false);
      button.focus();
    }
  });
  menu.addEventListener('focusout', (ev) => {
    if (!menu.contains(ev.relatedTarget as Node | null) && ev.relatedTarget !== button) open(false);
  });
  const physics = e.source.kind === 'url' && e.source.origin === 'physics';
  if (physics) download.setAttribute('disabled', '');
  note.textContent = physics ? 'Served by the physics process: no package to download.' : '';
  download.addEventListener('click', () => {
    note.textContent = 'Preparing the zip…';
    void caseZip(e)
      .then((blob) => {
        if (!blob) {
          note.textContent = 'No package to download for this case.';
          return;
        }
        saveAs(blob, `${e.result.ok ? e.result.case.id : e.key}.zip`);
        note.textContent = '';
        open(false);
      })
      .catch(() => (note.textContent = 'The package could not be read.'));
  });
  return h('div', { class: 'case-card-menu' }, button, menu);
}

function card(e: CatalogEntry, isNext: boolean): HTMLLIElement {
  if (!e.result.ok) {
    const first = e.result.results[0];
    return h(
      'li',
      { class: 'case-card case-card-failed' },
      h('div', { class: 'case-card-picture', 'aria-hidden': 'true' }),
      h('div', { class: 'case-card-body' }, h('h3', { class: 'case-card-title' }, e.key), h('p', { class: 'case-card-synopsis' }, first?.message ?? 'This case could not be loaded.'), h('div', { class: 'meta-row' }, h('span', { class: 'pill pill-negative' }, 'Could not load'))),
    );
  }
  const c = e.result.case;
  const meta = caseMeta(e.key);
  const title = meta.name ?? c.title;
  const synopsis = meta.synopsis ?? c.scenario;
  const stage = stageFor(e.key);
  return h(
    'li',
    { class: `case-card${isNext ? ' case-card-next' : ''}`, 'data-case': e.key, ...(isNext ? { 'data-testid': 'next-case' } : {}) },
    picture(e, c),
    h(
      'div',
      { class: 'case-card-body' },
      h('h3', { class: 'case-card-title' }, h('a', { class: 'case-card-link', href: href.brief(e.key) }, title)),
      synopsis ? h('p', { class: 'case-card-synopsis' }, synopsis) : h('p', { class: 'case-card-synopsis muted' }, 'No synopsis for this case.'),
      h(
        'div',
        { class: 'meta-row' },
        difficultyPill(c),
        modeBadge(c),
        isNext ? h('span', { class: 'pill pill-brand' }, 'Suggested next') : null,
        e.origin === 'imported' ? h('span', { class: 'pill pill-neutral' }, 'Imported this session') : null,
      ),
      h(
        'div',
        { class: 'case-card-foot' },
        stars(starsFor(e.key)),
        stage ? h('p', { class: 'case-card-stage', 'data-testid': 'case-stage' }, `${STAGE_WORDS[stage].words}. `, h('a', { class: 'case-card-resume', href: STAGE_WORDS[stage].to(e.key) }, STAGE_WORDS[stage].link)) : null,
      ),
    ),
    cardMenu(e, title),
  );
}

function filters(onChange: () => void): HTMLElement {
  const group = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Difficulty' });
  for (const [value, label] of DIFFICULTIES) {
    const b = h('button', { type: 'button', class: 'segment', 'aria-pressed': String(filter.difficulty === value), 'data-difficulty': value }, label);
    b.addEventListener('click', () => {
      filter.difficulty = value;
      for (const o of group.querySelectorAll('button')) o.setAttribute('aria-pressed', String(o === b));
      onChange();
    });
    group.append(b);
  }
  const arch = h('select', { class: 'select', id: 'arch-filter', 'data-testid': 'arch-filter' }, ...ARCHES.map(([v, l]) => h('option', { value: v, ...(filter.arch === v ? { selected: true } : {}) }, l)));
  arch.addEventListener('change', () => {
    filter.arch = (arch as HTMLSelectElement).value as ArchFilter;
    onChange();
  });
  return h('div', { class: 'library-filters' }, group, h('label', { class: 'visually-hidden', for: 'arch-filter' }, 'Arch type'), arch);
}

/** The add-case dialog: a name, a synopsis and the import panel (drop zone, checks and fixes). */
function addDialog(imp: ImportPanel, nameInput: HTMLInputElement, synopsisInput: HTMLTextAreaElement): HTMLDialogElement {
  const close = h('button', { type: 'button', class: 'btn btn-secondary' }, 'Done');
  const dialog = h(
    'dialog',
    { class: 'add-case', 'aria-labelledby': 'add-case-heading', 'data-testid': 'add-case-dialog' },
    h('div', { class: 'add-case-head' }, h('h2', { id: 'add-case-heading' }, 'Add a case'), close),
    h('p', { class: 'subline' }, 'Give it a name and a synopsis for your Library card, then drop its case.zip. Leave either blank to use the package’s own.'),
    h('div', { class: 'add-case-fields' }, h('label', { class: 'field-label', for: 'add-case-name' }, 'Name'), nameInput, h('label', { class: 'field-label', for: 'add-case-synopsis' }, 'Synopsis'), synopsisInput),
    imp.element,
  ) as HTMLDialogElement;
  close.addEventListener('click', () => dialog.close());
  return dialog;
}

export async function renderLibrary(root: HTMLElement): Promise<void> {
  const loading = h('div', { class: 'screen' }, h('div', { class: 'title-row' }, h('h1', {}, 'Library'), h('p', { class: 'subline' }, 'Loading cases…')), honestyLine());
  renderShell(root, { crumbs: CRUMBS, body: loading }, 'library');

  try {
    await loadBundled();
  } catch (err) {
    const retry = h('button', { type: 'button', class: 'btn btn-secondary' }, 'Try again');
    retry.addEventListener('click', () => void renderLibrary(root));
    replace(
      loading,
      h('div', { class: 'title-row' }, h('h1', {}, 'Library')),
      h('section', { class: 'block' }, h('h2', {}, 'The case list could not be loaded'), h('p', { class: 'muted' }, err instanceof Error ? err.message : String(err)), retry),
      honestyLine(),
    );
    return;
  }
  // The trainee may have left while the cases loaded (Settings, a case): don't draw the Library over that screen.
  if (parseRoute(location.hash).name !== 'library') return;

  const nameInput = h('input', { type: 'text', id: 'add-case-name', class: 'input', autocomplete: 'off', 'data-testid': 'add-case-name' }) as HTMLInputElement;
  const synopsisInput = h('textarea', { id: 'add-case-synopsis', class: 'input', rows: '3', 'data-testid': 'add-case-synopsis' }) as HTMLTextAreaElement;

  const subline = h('p', { class: 'subline' });
  const grid = h('section', { class: 'library-grid-section', 'aria-labelledby': 'cases-heading' });

  const drawGrid = (): void => {
    const list = catalog();
    const next = nextCase(list);
    const loadable = list.filter((e) => e.result.ok).length;
    subline.textContent = loadable === 1 ? '1 case ready to plan.' : `${loadable} cases ready to plan.`;
    if (loadable === 0) {
      const action = h('button', { type: 'button', class: 'btn btn-primary' }, 'Add a case');
      action.addEventListener('click', openAdd);
      replace(grid, h('div', { class: 'empty' }, art('no-cases'), h('div', { class: 'empty-words' }, h('h2', { id: 'cases-heading' }, 'No cases yet'), h('p', { class: 'muted' }, 'Add a case.zip to start.'), action)));
      return;
    }
    // The suggested case first, then the rest in catalogue order; failed packages last.
    const ordered = [...(next ? [next] : []), ...list.filter((e) => e !== next && e.result.ok), ...list.filter((e) => !e.result.ok)];
    const shown = ordered.filter((e) => !e.result.ok || matches(e.result.case));
    replace(
      grid,
      h('h2', { id: 'cases-heading', class: 'visually-hidden' }, 'Cases'),
      shown.length
        ? h('ul', { class: 'case-grid' }, shown.map((e) => card(e, e === next)))
        : h('p', { class: 'library-none muted', role: 'status' }, 'No case matches these filters.'),
    );
    renderAction(next);
  };

  // The import panel tells us when the catalogue changed: save the typed name and synopsis for the new case.
  const known = new Set(catalog().map((e) => e.key));
  const onCatalogChange = (): void => {
    for (const e of catalog()) {
      if (known.has(e.key)) continue;
      known.add(e.key);
      if (e.origin === 'imported' && (nameInput.value.trim() || synopsisInput.value.trim())) saveCaseMeta(e.key, { name: nameInput.value, synopsis: synopsisInput.value });
    }
    drawGrid();
  };
  const imp: ImportPanel = importPanel(onCatalogChange);
  const dialog = addDialog(imp, nameInput, synopsisInput);
  function openAdd(): void {
    nameInput.value = '';
    synopsisInput.value = '';
    dialog.showModal();
    nameInput.focus();
  }

  const add = h('button', { type: 'button', class: 'btn btn-secondary library-add', 'data-testid': 'add-case' }, h('span', { 'aria-hidden': 'true', class: 'library-add-plus' }, '+'), 'Add a case');
  add.addEventListener('click', openAdd);

  const body = h(
    'div',
    { class: 'screen library' },
    h('div', { class: 'title-row library-title' }, h('div', {}, h('h1', {}, 'Library'), subline), add),
    filters(drawGrid),
    grid,
    honestyLine(),
    dialog,
  );

  let actionFor: string | null = null;
  function renderAction(next: CatalogEntry | undefined): void {
    const key = next?.key ?? null;
    if (key === actionFor && root.contains(body)) return;
    actionFor = key;
    renderShell(root, { crumbs: CRUMBS, body, ...(next ? { action: { label: 'Open case', href: href.brief(next.key) } } : {}) }, 'library');
  }
  drawGrid();

  // Phantom cases only while the physics process answers; the probe fails closed (see physics-probe.ts).
  const phantoms = await probePhysicsCases();
  const fresh = phantoms.filter((p) => !entry(p.id));
  if (fresh.length) {
    await Promise.all(fresh.map((p) => addPhysicsCase(p.id, p.baseUrl)));
    fresh.forEach((p) => known.add(p.id));
    if (location.hash === '' || location.hash.startsWith('#/library')) drawGrid();
  }
}
