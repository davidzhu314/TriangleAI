/**
 * Library — "Which case do I do next?" The largest block is the next case: title, difficulty, the Physics or
 * Planning-only badge, and stars earned. Other cases follow as peer rows; import sits below.
 */
import type { CatalogEntry } from './store';
import { catalog, entry, loadBundled, nextCase, resultFor, addPhysicsCase } from './store';
import { difficultyPill, modeBadge, stars } from './badges';
import { h, replace } from './dom';
import { art } from './icons';
import { importPanel, type ImportPanel } from './import-panel';
import { probePhysicsCases } from './physics-probe';
import { href } from './router';
import { honestyLine, renderShell } from './shell';

const CRUMBS = [{ label: 'Library' }];

function nextBlock(e: CatalogEntry): HTMLElement | null {
  if (!e.result.ok) return null;
  const c = e.result.case;
  return h(
    'section',
    { class: 'next-case', 'aria-labelledby': 'next-heading', 'data-testid': 'next-case' },
    h('p', { class: 'label' }, 'Next case'),
    h('h2', { id: 'next-heading', class: 'next-title' }, c.title),
    h('div', { class: 'meta-row' }, difficultyPill(c), modeBadge(c), stars(resultFor(e.key))),
    c.scenario ? h('p', { class: 'next-scenario' }, c.scenario) : null,
    h('a', { class: 'btn btn-primary', href: href.brief(e.key) }, 'Open case'),
  );
}

function row(e: CatalogEntry): HTMLLIElement {
  if (!e.result.ok) {
    const first = e.result.results[0];
    return h(
      'li',
      { class: 'case-row case-row-failed' },
      h('div', { class: 'case-row-main' }, h('p', { class: 'case-row-title' }, e.key), h('p', { class: 'muted' }, first?.message ?? 'This case could not be loaded.')),
      h('span', { class: 'pill pill-negative' }, 'Could not load'),
    );
  }
  const c = e.result.case;
  return h(
    'li',
    { class: 'case-row' },
    h(
      'div',
      { class: 'case-row-main' },
      h('a', { class: 'case-row-title', href: href.brief(e.key) }, c.title),
      h('div', { class: 'meta-row' }, difficultyPill(c), modeBadge(c), e.origin === 'imported' ? h('span', { class: 'pill pill-neutral' }, 'Imported this session') : null),
    ),
    stars(resultFor(e.key)),
  );
}

function body(imp: ImportPanel): HTMLElement {
  const list = catalog();
  const next = nextCase(list);
  const others = list.filter((e) => e !== next);
  const loadable = list.filter((e) => e.result.ok).length;

  const intro =
    loadable === 0
      ? h(
          'section',
          { class: 'empty', 'aria-labelledby': 'empty-heading' },
          art('no-cases'),
          h('div', { class: 'empty-words' }, h('h2', { id: 'empty-heading' }, 'No cases yet'), h('p', { class: 'muted' }, 'Import a case.zip to start.')),
        )
      : null;

  if (intro) {
    const action = h('button', { type: 'button', class: 'btn btn-primary' }, 'Import a case.zip');
    action.addEventListener('click', imp.focus);
    intro.querySelector('.empty-words')?.append(action);
  }

  return h(
    'div',
    { class: 'screen' },
    h(
      'div',
      { class: 'title-row' },
      h('h1', {}, 'Library'),
      h('p', { class: 'subline' }, loadable === 1 ? '1 case ready to plan.' : `${loadable} cases ready to plan.`),
    ),
    intro,
    next ? nextBlock(next) : null,
    loadable > 0
      ? h(
          'section',
          { class: 'block', 'aria-labelledby': 'others-heading' },
          h('h2', { id: 'others-heading' }, 'Other cases'),
          others.length ? h('ul', { class: 'case-list' }, others.map(row)) : h('p', { class: 'muted' }, 'No other cases yet. Import a case.zip to add one.'),
        )
      : null,
    imp.element,
    honestyLine(),
  );
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

  // One import panel per visit, so a re-render after an import keeps its results on screen.
  let imp: ImportPanel | null = null;
  const draw = (): void => {
    const list = catalog();
    const next = nextCase(list);
    imp ??= importPanel(draw);
    renderShell(root, { crumbs: CRUMBS, body: body(imp), ...(next ? { action: { label: 'Open case', href: href.brief(next.key) } } : {}) }, 'library');
  };
  draw();

  // Phantom cases only while the physics process answers; the probe fails closed (see physics-probe.ts).
  const phantoms = await probePhysicsCases();
  const fresh = phantoms.filter((p) => !entry(p.id));
  if (fresh.length) {
    await Promise.all(fresh.map((p) => addPhysicsCase(p.id, p.baseUrl)));
    if (location.hash === '' || location.hash.startsWith('#/library')) draw();
  }
}
