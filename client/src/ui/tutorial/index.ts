/**
 * The guided tutorial's note: a small card anchored beside what it points at, with no modal and no dimming. It
 * watches the screen (a MutationObserver on the app root) for the facts the steps advance on, so no screen has to
 * call it. Dismissal is remembered per browser; the current step lasts for the tab's session.
 */
import { h } from '../dom';
import type { Route } from '../router';
import { catalog, loadedCase, progressHistory } from '../store';
import { advance, shouldStart, stepText, tutorialCase, visible, type StepId, type View } from './model';
import './tutorial.css';

const DISMISS_KEY = 'threadsim.tutorial.v1';
const STEP_KEY = 'threadsim.tutorial.step';

function read(store: Storage, k: string): string | null {
  try {
    return store.getItem(k);
  } catch {
    return null;
  }
}

function write(store: Storage, k: string, v: string | null): void {
  try {
    if (v === null) store.removeItem(k);
    else store.setItem(k, v);
  } catch {
    // storage blocked: the tutorial lasts for this page only
  }
}

let step: StepId | 'done' | null = null;
let route: Route = { name: 'library' };
let root: HTMLElement | null = null;
let note: HTMLElement | null = null;
let observer: MutationObserver | null = null;
/** False while a screen is being swapped: the old screen's DOM must not count as the new screen's facts. */
let settled = false;

function caseInfo(): { key: string; title: string } | null {
  const list = catalog();
  const c = tutorialCase(list.map(loadedCase).filter((x): x is NonNullable<typeof x> => !!x));
  if (!c) return null;
  const e = list.find((x) => loadedCase(x)?.id === c.id && x.origin === 'bundled');
  return e ? { key: e.key, title: c.title } : null;
}

function anchorFor(s: StepId, key: string): HTMLElement | null {
  const enc = encodeURIComponent(key);
  const pick = (sel: string): HTMLElement | null => [...document.querySelectorAll<HTMLElement>(sel)].find((el) => el.offsetParent !== null) ?? null;
  switch (s) {
    case 'open-case':
      return pick(`main a[href="#/case/${enc}"]`);
    case 'start-planning':
      return pick(`main a[href="#/case/${enc}/plan"]`);
    case 'build-route':
      return pick('.steps');
    case 'compare':
      return pick('[data-testid=compare]');
    case 'start-drive':
      return pick('[data-testid=start-drive]');
    case 'drive':
      return pick('.hud-controls');
    case 'finish':
      return pick('[data-testid=finish-drive]');
  }
}

function view(key: string): View {
  const finish = document.querySelector<HTMLElement>('[data-testid=finish-drive]');
  const compare = document.querySelector<HTMLButtonElement>('[data-testid=compare]');
  return {
    // Settings is off the case flow: the tutorial treats it like the Library (not on a case). The Access check is a
    // side page of the case: like its brief.
    screen: route.name === 'settings' ? 'library' : route.name === 'access' || route.name === 'apex' ? 'brief' : route.name,
    onTutorialCase: route.name !== 'library' && route.name !== 'settings' && route.key === key,
    routeComplete: !!compare && !compare.disabled,
    targetReached: !!finish && !finish.hidden,
  };
}

function hide(): void {
  note?.remove();
  note = null;
}

function dismiss(how: 'dismissed' | 'done'): void {
  write(localStorage, DISMISS_KEY, how);
  write(sessionStorage, STEP_KEY, null);
  step = 'done';
  hide();
}

/**
 * Beside the anchor when the page has room on its right (so the note covers nothing the step needs), else below it,
 * else above. Positions are measured from the page at run time, not sizes from the design.
 */
function place(anchor: HTMLElement, el: HTMLElement): void {
  const r = anchor.getBoundingClientRect();
  const gap = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--space-3')) || 0;
  const width = document.documentElement.clientWidth;
  const side = r.right + gap + el.offsetWidth <= width ? 'beside' : r.bottom + el.offsetHeight < window.innerHeight || r.top < el.offsetHeight ? 'below' : 'above';
  const top = side === 'beside' ? r.top - gap : side === 'below' ? r.bottom : r.top - el.offsetHeight;
  const left = side === 'beside' ? r.right + gap : Math.max(0, Math.min(r.left, width - el.offsetWidth));
  el.style.setProperty('--note-top', `${top + window.scrollY}px`);
  el.style.setProperty('--note-left', `${left + window.scrollX}px`);
  el.dataset.side = side;
}

function refresh(): void {
  if (!settled) return;
  if (step === null || step === 'done') return hide();
  const info = caseInfo();
  if (!info) return hide();
  const v = view(info.key);
  const next = advance(step, v);
  if (next !== step) {
    step = next;
    if (step === 'done') return dismiss('done');
    write(sessionStorage, STEP_KEY, step);
  }
  if (!visible(step, v)) return hide();
  const anchor = anchorFor(step, info.key);
  if (!anchor) return hide();
  const text = stepText(step, info.title);
  if (!note || note.dataset.step !== step) {
    hide();
    const skip = h('button', { type: 'button', class: 'btn btn-secondary tutorial-skip' }, 'Skip tutorial');
    skip.addEventListener('click', () => dismiss('dismissed'));
    note = h('aside', { class: 'tutorial-note', role: 'note', 'aria-label': 'Guided tutorial', 'data-step': step, 'data-testid': 'tutorial-note' }, h('p', { class: 'tutorial-label' }, 'Guided tutorial'), h('p', { class: 'tutorial-text' }, text), skip);
    document.body.append(note);
  }
  place(anchor, note);
}

/** Start watching the app. Called once by startApp; every route change calls tutorialScreen. */
export function startTutorial(appRoot: HTMLElement): void {
  root = appRoot;
  const saved = read(sessionStorage, STEP_KEY);
  step = saved ? (saved as StepId) : null;
  observer?.disconnect();
  observer = new MutationObserver(() => refresh());
  observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'class'] });
  window.addEventListener('resize', () => refresh());
  // Registered before the router's listener, so it runs first on every route change.
  window.addEventListener('hashchange', () => {
    settled = false;
    hide();
  });
}

/** The router tells the tutorial which screen is up, once that screen has drawn. */
export function tutorialScreen(r: Route): void {
  route = r;
  settled = true;
  if (step === null && r.name === 'library' && shouldStart(progressHistory().length, read(localStorage, DISMISS_KEY) !== null) && caseInfo()) {
    step = 'open-case';
    write(sessionStorage, STEP_KEY, step);
  }
  refresh();
}

/** Reopen from the Case brief: clear the dismissal and start at the brief step. */
export function reopenTutorial(): void {
  write(localStorage, DISMISS_KEY, null);
  step = 'start-planning';
  write(sessionStorage, STEP_KEY, step);
  refresh();
}

/** Whether a case is the tutorial's case, for the brief's reopen link. */
export function isTutorialKey(key: string): boolean {
  return caseInfo()?.key === key;
}
