// ThreadSim app entry (Aroovee). Tokens, then the theme, then the screens' styles; the router picks a screen.
import './styles/tokens.css';
import './styles/theme.css';
import './ui/ui.css';
import { startApp } from './ui/app';

const root = document.querySelector<HTMLDivElement>('#app');
if (root) startApp(root);
