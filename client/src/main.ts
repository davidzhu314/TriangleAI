// ThreadSim app entry (Aroovee). Tokens, then the theme, then the screens' styles; the router picks a screen.
import './styles/tokens.css';
import './styles/theme.css';
import './ui/ui.css';
import { renderBrief } from './ui/brief';
import { renderLibrary } from './ui/library';
import { disposePlanView, renderComparePlaceholder, renderPlan } from './ui/plan';
import { parseRoute } from './ui/router';

const root = document.querySelector<HTMLDivElement>('#app');

function route(): void {
  if (!root) return;
  disposePlanView(); // free the Plan view when leaving it; the Plan screen makes a new one on entry
  const r = parseRoute(location.hash);
  const done =
    r.name === 'library'
      ? renderLibrary(root)
      : r.name === 'brief'
        ? renderBrief(root, r.key)
        : r.name === 'plan'
          ? renderPlan(root, r.key)
          : renderComparePlaceholder(root, r.key);
  void done.then(() => window.scrollTo(0, 0));
}

window.addEventListener('hashchange', route);
route();
