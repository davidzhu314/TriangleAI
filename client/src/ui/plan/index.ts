/**
 * Plan screen (UI only; the engine lives in client/src/optimize). A2 routes here; A3 builds the 3D view, the
 * preset picker and the live cost panel. Until then it shows the case name and nothing invented.
 */
import { h } from '../dom';
import { href } from '../router';
import { renderShell } from '../shell';
import { entry, loadBundled, loadedCase } from '../store';
import { notFound } from '../brief';

export async function renderPlan(root: HTMLElement, key: string): Promise<void> {
  await loadBundled().catch(() => undefined);
  const e = entry(key);
  const c = loadedCase(e);
  if (!e || !c) return notFound(root, key);
  renderShell(
    root,
    {
      crumbs: [{ label: 'Library', href: href.library() }, { label: c.title, href: href.brief(key) }, { label: 'Plan' }],
      body: h(
        'div',
        { class: 'screen' },
        h('div', { class: 'title-row' }, h('h1', {}, `Plan: ${c.title}`), h('p', { class: 'subline' }, 'The planning view is not built yet.')),
        h('a', { class: 'btn btn-secondary', href: href.brief(key) }, 'Back to the case brief'),
      ),
    },
    'library',
  );
}
