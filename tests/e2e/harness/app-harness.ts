/**
 * TEST-ONLY: the whole app (Library → Brief → Plan → Compare → Drive → Results) with Vaibhav's RailWireSource
 * injected where the app passes select.ts. Never part of the app build: Vite's app root is client/, and this page
 * is served only by the dev server a Playwright test starts (with client/public as its public folder, so the
 * bundled cases load as in the app). It exists because select.ts is not on main yet; once it is, the plain app
 * drives and the click-through can run on the production build.
 *
 * Query: ?wire=autopilot|rail|none (default autopilot). The wire runs on a manual clock; tests advance it with
 * window.__app.tick(n).
 */
import '../../../client/src/styles/tokens.css';
import '../../../client/src/styles/theme.css';
import '../../../client/src/ui/ui.css';
import type { WireSource, WireState } from '../../../client/src/contracts';
import { startApp } from '../../../client/src/ui/app';
import { RailWireSource } from '../../../client/src/wire/rail-source';

interface AppHarness {
  rail: RailWireSource | null;
  last: WireState | null;
  tick(n: number): WireState | null;
}

declare global {
  interface Window {
    __app: AppHarness;
  }
}

const wire = new URLSearchParams(location.search).get('wire') ?? 'autopilot';
const harness: AppHarness = {
  rail: null,
  last: null,
  tick(n) {
    for (let i = 0; i < n; i++) harness.rail?.tick();
    return harness.last;
  },
};
window.__app = harness;

startApp(document.querySelector<HTMLElement>('#app')!, {
  getWireSource: async (): Promise<WireSource | null> => {
    if (wire === 'none') return null;
    const rail = new RailWireSource({ clock: 'manual', autoDrive: wire === 'autopilot' });
    harness.rail = rail;
    harness.last = null;
    rail.onState((s) => (harness.last = s));
    return rail;
  },
});
