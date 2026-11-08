import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { THEME_EVENT } from '../render/tokens';
import { applyTheme, DEFAULT_SETTINGS, parseSettings, readSettings, SETTINGS_KEY, updateSettings } from './settings-store';

// Node has no DOM: small stand-ins for what the store touches (localStorage, window events, <html>'s dataset).
const store = new Map<string, string>();
const html = { dataset: {} as Record<string, string | undefined> };
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), clear: () => store.clear() },
  window: new EventTarget(),
  document: { documentElement: html },
  CustomEvent: class extends Event {
    detail: unknown;
    constructor(type: string, init?: { detail?: unknown }) {
      super(type);
      this.detail = init?.detail;
    }
  },
});

describe('settings', () => {
  beforeEach(() => {
    store.clear();
    delete html.dataset['theme'];
  });

  it('starts from the defaults: Hands and Voice offered, the system theme, every command list shown', () => {
    expect(readSettings()).toEqual({ hands: true, voice: true, speak: true, cathyAi: false, theme: 'system', showGestures: true, showVoice: true, showKeys: true });
  });

  it('keeps what was saved and ignores anything malformed', () => {
    expect(parseSettings('{"hands":false,"theme":"dark","showKeys":false}')).toEqual({ ...DEFAULT_SETTINGS, hands: false, theme: 'dark', showKeys: false });
    expect(parseSettings('{"hands":"no","theme":"purple"}')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('[1,2]')).toEqual(DEFAULT_SETTINGS);
  });

  it('saves a change, and applies the theme on <html>', () => {
    updateSettings({ voice: false, theme: 'dark' });
    expect(JSON.parse(store.get(SETTINGS_KEY)!)).toMatchObject({ voice: false, theme: 'dark', hands: true });
    expect(html.dataset['theme']).toBe('dark');
    updateSettings({ theme: 'system' });
    expect(html.dataset['theme']).toBeUndefined();
  });

  it('tells the 3D views to recolour when the theme actually changes', () => {
    let fired = 0;
    const count = (): void => void fired++;
    window.addEventListener(THEME_EVENT, count);
    applyTheme('light');
    applyTheme('light');
    applyTheme('system');
    window.removeEventListener(THEME_EVENT, count);
    expect(fired).toBe(2);
  });

  it('draws Dark from exactly the same values as the system dark theme (tokens.css keeps two copies)', () => {
    const css = readFileSync(join(process.cwd(), 'client', 'src', 'styles', 'tokens.css'), 'utf8');
    const lines = (t: string): string[] => t.split('\n').map((l) => l.trim()).filter(Boolean);
    const system = /:root:not\(\[data-theme='light'\]\) \{\n([\s\S]*?)\n {2}\}\n\}/.exec(css)![1]!;
    const chosen = /:root\[data-theme='dark'\] \{\n {2}color-scheme: dark;\n([\s\S]*?)\n\}/.exec(css)![1]!;
    expect(lines(chosen)).toEqual(lines(system));
    expect(lines(system).length).toBeGreaterThan(40);
  });
});
