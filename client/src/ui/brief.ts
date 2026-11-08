/**
 * Case brief — "What am I about to face?" The largest block is the scenario card: scenario, target, arch type and
 * fluoro budget, from LoadedCase fields only. A field the case leaves out is a grey dash, never a made-up value.
 */
import type { LoadedCase } from '../contracts';
import { difficultyPill, modeBadge } from './badges';
import { dash, figure, h } from './dom';
import { entryIcon, labelled } from './icons';
import { targetList } from './import-panel';
import { href } from './router';
import { honestyLine, renderShell } from './shell';
import { isTutorialKey, reopenTutorial } from './tutorial';
import { acceptFix, entry, loadBundled, type CatalogEntry } from './store';
import { validationList } from './validation-list';

function field(label: string, value: Node, wide = false): HTMLDivElement {
  return h('div', { class: wide ? 'field field-wide' : 'field' }, h('dt', {}, label), h('dd', {}, value));
}

function scenarioCard(c: LoadedCase): HTMLElement {
  const arch = c.anatomy?.arch_type;
  const entries = h(
    'ul',
    { class: 'target-list' },
    c.entries.map((e) => {
      const icon = entryIcon(e.id);
      return h('li', {}, icon ? labelled(icon, e.name) : e.name);
    }),
  );
  return h(
    'section',
    { class: 'scenario-card', 'aria-labelledby': 'scenario-heading', 'data-testid': 'scenario-card' },
    h('h2', { id: 'scenario-heading' }, 'Case facts'),
    h(
      'dl',
      { class: 'fields' },
      field('Scenario', c.scenario ? h('p', { class: 'scenario-text' }, c.scenario) : dash(), true),
      field(c.targets.length === 1 ? 'Target' : 'Targets', targetList(c)),
      field(c.entries.length === 1 ? 'Entry site' : 'Entry sites', entries),
      field('Arch type', arch ? h('span', {}, `Type ${arch}`) : dash()),
      field('Fluoro budget', c.fluoroBudgetS !== undefined ? labelled('fluoro', figure(c.fluoroBudgetS, 's')) : dash()),
    ),
  );
}

function body(e: CatalogEntry, c: LoadedCase, onFixed: () => void): HTMLElement {
  const card = scenarioCard(c);
  const checks = validationList(c.validation, (fix) => {
    void acceptFix(e.key, fix).then(onFixed);
  });
  return h(
    'div',
    { class: 'screen' },
    h(
      'div',
      { class: 'title-row' },
      h('h1', {}, c.title),
      h('div', { class: 'meta-row' }, difficultyPill(c), modeBadge(c), e.origin === 'imported' ? h('span', { class: 'pill pill-neutral' }, 'Imported this session') : null),
    ),
    card,
    checks ? h('section', { class: 'block', 'aria-labelledby': 'checks-heading' }, h('h2', { id: 'checks-heading' }, 'Checks on this case'), checks) : null,
    h('div', { class: 'actions' }, h('a', { class: 'btn btn-primary', href: href.plan(e.key) }, 'Start planning'), h('a', { class: 'btn btn-secondary', href: href.library() }, 'Back to Library')),
    isTutorialKey(e.key) ? tutorialButton() : null,
    honestyLine(),
  );
}

/** Reopen the guided tutorial from the tutorial case's brief (A8). */
function tutorialButton(): HTMLButtonElement {
  const b = h('button', { type: 'button', class: 'btn btn-secondary tutorial-reopen', 'data-testid': 'tutorial-reopen' }, 'Show the guided tutorial');
  b.addEventListener('click', () => reopenTutorial());
  return b;
}

export function notFound(root: HTMLElement, key: string): void {
  renderShell(
    root,
    {
      crumbs: [{ label: 'Library', href: href.library() }, { label: 'Case not found' }],
      body: h(
        'div',
        { class: 'screen' },
        h('div', { class: 'title-row' }, h('h1', {}, 'Case not found')),
        h('p', { class: 'muted' }, `No case “${key}” is loaded. Imported cases last only for the session they were dropped in.`),
        h('a', { class: 'btn btn-primary', href: href.library() }, 'Back to Library'),
        honestyLine(),
      ),
    },
    'library',
  );
}

export async function renderBrief(root: HTMLElement, key: string): Promise<void> {
  await loadBundled().catch(() => undefined);
  const e = entry(key);
  if (!e) return notFound(root, key);
  if (!e.result.ok) {
    const list = validationList(e.result.results);
    renderShell(
      root,
      {
        crumbs: [{ label: 'Library', href: href.library() }, { label: e.key }],
        body: h('div', { class: 'screen' }, h('div', { class: 'title-row' }, h('h1', {}, 'This case could not be loaded')), list, honestyLine()),
      },
      'library',
    );
    return;
  }
  const c = e.result.case;
  renderShell(
    root,
    {
      crumbs: [{ label: 'Library', href: href.library() }, { label: c.title }],
      action: { label: 'Start planning', href: href.plan(e.key) },
      body: body(e, c, () => void renderBrief(root, key)),
    },
    'library',
  );
}
