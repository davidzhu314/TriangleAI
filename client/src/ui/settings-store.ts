/**
 * The trainee's settings (the Settings screen): which hands-free inputs the screens offer, the colour theme, and which
 * sections of the command list are shown. Per browser, in localStorage; every read and write survives blocked storage
 * (a private window), falling back to the defaults. Nothing here reaches the engine.
 */
import { THEME_EVENT } from '../render/tokens';

export type ThemeChoice = 'system' | 'light' | 'dark';

export interface Settings {
  /** Offer the Hands button (camera gestures) on Plan, Compare and Drive. */
  hands: boolean;
  /** Offer the Voice button ("Hey Cathy, …" dictation). */
  voice: boolean;
  theme: ThemeChoice;
  /** Which sections of the command list on the Settings screen are shown. */
  showGestures: boolean;
  showVoice: boolean;
  showKeys: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = { hands: true, voice: true, theme: 'system', showGestures: true, showVoice: true, showKeys: true };

export const SETTINGS_KEY = 'threadsim.settings.v1';

/** Fired on window when a setting changes, with the new settings as `detail`. */
export const SETTINGS_EVENT = 'threadsim:settings';

const THEMES: readonly ThemeChoice[] = ['system', 'light', 'dark'];

/** The stored settings over the defaults; anything missing or malformed is the default. */
export function parseSettings(raw: string | null): Settings {
  let stored: Record<string, unknown> = {};
  try {
    const v: unknown = raw ? JSON.parse(raw) : {};
    if (v && typeof v === 'object' && !Array.isArray(v)) stored = v as Record<string, unknown>;
  } catch {
    // corrupt: defaults
  }
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const k of ['hands', 'voice', 'showGestures', 'showVoice', 'showKeys'] as const) if (typeof stored[k] === 'boolean') out[k] = stored[k];
  if (THEMES.includes(stored['theme'] as ThemeChoice)) out.theme = stored['theme'] as ThemeChoice;
  return out;
}

export function readSettings(): Settings {
  try {
    return parseSettings(localStorage.getItem(SETTINGS_KEY));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Save a change, apply the theme, and tell the page. Returns the new settings. */
export function updateSettings(change: Partial<Settings>): Settings {
  const next = { ...readSettings(), ...change };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // blocked storage: the change holds for this page only
  }
  applyTheme(next.theme);
  window.dispatchEvent(new CustomEvent<Settings>(SETTINGS_EVENT, { detail: next }));
  return next;
}

/** "system" follows the OS; "light" and "dark" override it (tokens.css: :root[data-theme]). Tells the 3D views to recolour. */
export function applyTheme(theme: ThemeChoice, root: HTMLElement = document.documentElement): void {
  const before = root.dataset['theme'];
  if (theme === 'system') delete root.dataset['theme'];
  else root.dataset['theme'] = theme;
  if (root.dataset['theme'] !== before) window.dispatchEvent(new Event(THEME_EVENT));
}
