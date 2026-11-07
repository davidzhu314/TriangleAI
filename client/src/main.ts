// ThreadSim app entry (Aroovee). Tokens, then the theme, then the screens' styles; the router picks a screen.
import './styles/tokens.css';
import './styles/theme.css';
import './ui/ui.css';
import { renderBrief } from './ui/brief';
import { disposeCompareView, renderCompare } from './ui/compare';
import { disposeDrive, renderDrive } from './ui/drive';
import { renderLibrary } from './ui/library';
import { disposePlanView, renderPlan } from './ui/plan';
import { parseRoute } from './ui/router';

const root = document.querySelector<HTMLDivElement>('#app');

function route(): void {
  if (!root) return;
  // Free the view of the screen being left; each screen makes a new one on entry.
  disposePlanView();
  disposeCompareView();
  disposeDrive();
  const r = parseRoute(location.hash);
  const done =
    r.name === 'library'
      ? renderLibrary(root)
      : r.name === 'brief'
        ? renderBrief(root, r.key)
        : r.name === 'plan'
          ? renderPlan(root, r.key)
          : r.name === 'compare'
            ? renderCompare(root, r.key)
            : renderDrive(root, r.key);
  void done.then(() => window.scrollTo(0, 0));
}

window.addEventListener('hashchange', route);
route();
