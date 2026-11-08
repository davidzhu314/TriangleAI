/**
 * The app's router: one screen per hash route (Library → Brief → Plan → Compare → Drive → Results). main.ts starts
 * it with the app's wire (select.ts); the end-to-end test harness starts it with an injected wire factory, which is
 * the only way a test reaches the Drive screen with a source. Screens never import a concrete wire source.
 */
import { renderBrief } from './brief';
import { disposeCompareView, renderCompare } from './compare';
import { disposeDrive, renderDrive, selectTsWireSource, type WireFactory } from './drive';
import { renderLibrary } from './library';
import { disposePlanView, renderPlan } from './plan';
import { renderResults } from './results';
import { parseRoute } from './router';
import { startTutorial, tutorialScreen } from './tutorial';

export interface AppOptions {
  getWireSource?: WireFactory;
}

export function startApp(root: HTMLElement, { getWireSource = selectTsWireSource }: AppOptions = {}): void {
  const screens = {
    brief: (k: string) => renderBrief(root, k),
    plan: (k: string) => renderPlan(root, k),
    compare: (k: string) => renderCompare(root, k),
    drive: (k: string) => renderDrive(root, k, getWireSource),
    results: (k: string) => renderResults(root, k),
  };
  const route = (): void => {
    // Free the view of the screen being left; each screen makes a new one on entry.
    disposePlanView();
    disposeCompareView();
    disposeDrive();
    const r = parseRoute(location.hash);
    const done = r.name === 'library' ? renderLibrary(root) : screens[r.name](r.key);
    void done.then(() => {
      window.scrollTo(0, 0);
      tutorialScreen(r);
    });
  };
  startTutorial(root);
  window.addEventListener('hashchange', route);
  route();
}
