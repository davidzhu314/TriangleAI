// ThreadSim app entry (Aroovee). Tokens, then the theme, then the screens' styles; the router picks a screen.
import './styles/tokens.css';
import './styles/theme.css';
import './ui/ui.css';
import { renderBrief } from './ui/brief';
import { renderLibrary } from './ui/library';
import { renderPlan } from './ui/plan';
import { parseRoute } from './ui/router';

const root = document.querySelector<HTMLDivElement>('#app');

function route(): void {
  if (!root) return;
  const r = parseRoute(location.hash);
  const done = r.name === 'library' ? renderLibrary(root) : r.name === 'brief' ? renderBrief(root, r.key) : renderPlan(root, r.key);
  void done.then(() => window.scrollTo(0, 0));
}

window.addEventListener('hashchange', route);
route();
