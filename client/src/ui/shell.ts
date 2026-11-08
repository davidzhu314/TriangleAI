/**
 * The Framed sheet shell (DESIGN.md: Layout): one tinted frame holds the sidebar and the 48 px top bar with no
 * rule between them; the screen sits on a white sheet inset from the right and bottom edges. On a phone the
 * frame disappears and the sheet is the screen, under a top bar with the menu, the title and one action.
 */
import { engineMode } from '../optimize';
import { h, replace } from './dom';
import { href } from './router';

export interface Crumb {
  label: string;
  href?: string;
}

export interface ScreenFrame {
  /** Last crumb is the current screen; on a phone it is the top bar's title. */
  crumbs: Crumb[];
  /** The one action carried into the phone top bar, if the screen has one. */
  action?: { label: string; href: string };
  /** Builder screens (Plan, later Drive): no global sidebar, the view gets the width (DESIGN.md: Layout). */
  layout?: 'focus';
  /** The screen's one primary control, kept in the top bar at every width. */
  primary?: HTMLElement;
  body: Node;
}

let menuOpen = false;

export function renderShell(root: HTMLElement, frame: ScreenFrame, active: 'library' | 'settings' | null): void {
  const nav = h(
    'nav',
    { class: 'nav', 'aria-label': 'Main' },
    h('a', { href: href.library(), class: 'nav-item', 'aria-current': active === 'library' ? 'page' : false }, 'Library'),
    h('a', { href: href.settings(), class: 'nav-item', 'aria-current': active === 'settings' ? 'page' : false }, 'Settings'),
  );

  const sidebar = h('aside', { class: 'sidebar' }, h('a', { class: 'mark', href: href.library() }, 'Cathy'), nav);

  const current = frame.crumbs.at(-1);
  const crumbs = h(
    'nav',
    { class: 'crumbs', 'aria-label': 'You are here' },
    h(
      'ol',
      {},
      frame.crumbs.map((c, i) =>
        h(
          'li',
          { class: i < frame.crumbs.length - 1 ? 'crumb crumb-parent' : 'crumb' },
          c.href && i < frame.crumbs.length - 1 ? h('a', { href: c.href }, c.label) : h('span', { 'aria-current': 'page' }, c.label),
        ),
      ),
    ),
  );

  const menuButton = h('button', { type: 'button', class: 'menu-button', 'aria-expanded': String(menuOpen), 'aria-controls': 'menu-sheet' }, 'Menu');
  const badge =
    engineMode === 'mock'
      ? h('span', { class: 'pill pill-warning', title: 'This build runs the engine mocks (VITE_ENGINE=mock): engine numbers are fixed test data.' }, 'Mock data')
      : null;
  const phoneAction = frame.action ? h('a', { class: 'btn btn-secondary phone-action', href: frame.action.href }, frame.action.label) : null;

  const topbar = h('header', { class: 'topbar' }, menuButton, crumbs, h('div', { class: 'topbar-end' }, badge, phoneAction, frame.primary ?? null));

  const menuSheet = h(
    'div',
    { id: 'menu-sheet', class: 'menu-sheet', hidden: !menuOpen, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Menu' },
    h('div', { class: 'menu-head' }, h('span', { class: 'mark' }, 'Cathy'), h('button', { type: 'button', class: 'btn btn-secondary menu-close' }, 'Close')),
    nav.cloneNode(true),
  );

  const setMenu = (open: boolean): void => {
    menuOpen = open;
    menuSheet.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
    if (open) menuSheet.querySelector<HTMLElement>('.menu-close')?.focus();
    else menuButton.focus();
  };
  menuButton.addEventListener('click', () => setMenu(true));
  menuSheet.querySelector('.menu-close')?.addEventListener('click', () => setMenu(false));
  menuSheet.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setMenu(false);
  });
  menuSheet.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a')) setMenu(false);
  });

  const sheet = h('main', { class: 'sheet', id: 'main' }, frame.body);
  replace(root, h('a', { class: 'skip-link', href: '#main' }, 'Skip to content'), frame.layout === 'focus' ? h('div', { class: 'app app-focus' }, topbar, sheet) : h('div', { class: 'app' }, sidebar, topbar, sheet), menuSheet);
  document.title = current && current.label !== 'Library' ? `${current.label} · Cathy` : 'Cathy';
}

/** The honesty line, exact text (DECISIONS.md). On Library, Case brief and Results; never on the Drive HUD. */
export function honestyLine(): HTMLParagraphElement {
  return h('p', { class: 'honesty' }, 'Decision trainer with simplified device mechanics. Not a clinical device; no claim of patient benefit.');
}
