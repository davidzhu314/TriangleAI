/**
 * Settings (#/settings): general settings (the Hands and Voice inputs, light or dark theme) and the command list,
 * every hand gesture, voice command and key, each section shown or hidden by its own switch. The lists come from
 * the input module's help (input/help.ts) and the Drive key bindings, so they can't drift from what the app does.
 */
import { GESTURE_HELP, VOICE_HELP, type VoiceAction } from '../input';
import { h } from './dom';
import { KEY_BINDINGS } from './drive/input';
import { href } from './router';
import { honestyLine, renderShell } from './shell';
import { readSettings, updateSettings, type Settings, type ThemeChoice } from './settings-store';
import './settings.css';

/** What each Drive key does, by its binding. */
const KEY_DOES: Readonly<Record<(typeof KEY_BINDINGS)[string], string>> = {
  push: 'Push the wire in (hold)',
  pull: 'Pull the wire back (hold)',
  left: 'Rotate the wire one way (hold)',
  right: 'Rotate the wire the other way (hold)',
  fluoro: 'Fluoro on while held',
  puff: 'Contrast puff',
};

const keyName = (code: string): string => (code.startsWith('Key') ? code.slice(3) : code);

const WHERE: Readonly<Record<'drive' | 'plan' | 'any', string>> = { drive: 'Drive', plan: 'Plan', any: 'Plan, Compare and Drive' };

/** A labelled on/off switch row: a native checkbox with the switch role. */
function switchRow(id: string, name: string, description: string, on: boolean, onChange: (on: boolean) => void): HTMLElement {
  const input = h('input', { type: 'checkbox', role: 'switch', id, class: 'setting-switch', checked: on, 'data-setting': id }) as HTMLInputElement;
  input.addEventListener('change', () => onChange(input.checked));
  return h('div', { class: 'setting-row' }, h('label', { for: id, class: 'setting-text' }, h('span', { class: 'setting-name' }, name), h('span', { class: 'muted setting-desc' }, description)), input);
}

function themeRow(current: ThemeChoice): HTMLElement {
  const choices: [ThemeChoice, string][] = [
    ['system', 'System'],
    ['light', 'Light'],
    ['dark', 'Dark'],
  ];
  const group = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Theme' });
  for (const [value, label] of choices) {
    const b = h('button', { type: 'button', class: 'segment', 'aria-pressed': String(value === current), 'data-theme-choice': value }, label);
    b.addEventListener('click', () => {
      updateSettings({ theme: value });
      for (const other of group.querySelectorAll('.segment')) other.setAttribute('aria-pressed', String(other === b));
    });
    group.append(b);
  }
  return h('div', { class: 'setting-row' }, h('div', { class: 'setting-text' }, h('span', { class: 'setting-name' }, 'Theme'), h('span', { class: 'muted setting-desc' }, 'Light, dark, or the same as your system.')), group);
}

/** One section of the command list: a title, a Show switch, and its table, hidden when the switch is off. */
function commandSection(key: 'showGestures' | 'showVoice' | 'showKeys', title: string, note: string, head: string[], rows: string[][], s: Settings): HTMLElement {
  const table = h(
    'table',
    { class: 'command-table' },
    h('thead', {}, h('tr', {}, head.map((t) => h('th', { scope: 'col' }, t)))),
    h('tbody', {}, rows.map((r) => h('tr', {}, r.map((cell, i) => (i === 0 ? h('th', { scope: 'row' }, cell) : h('td', {}, cell)))))),
  );
  const body = h('div', { class: 'command-body', hidden: !s[key] }, h('p', { class: 'muted' }, note), table);
  const id = `show-${key}`;
  const toggle = switchRow(id, title, `${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}. Turn off to hide this list.`, s[key], (on) => {
    updateSettings({ [key]: on });
    body.hidden = !on;
  });
  return h('section', { class: 'command-section', 'data-section': key }, toggle, body);
}

export function renderSettings(root: HTMLElement): Promise<void> {
  const s = readSettings();
  const voiceRows = (Object.entries(VOICE_HELP) as [VoiceAction, (typeof VOICE_HELP)[VoiceAction]][]).map(([, v]) => [`“Hey Cathy, ${v.say}”`, v.does]);
  const keyRows = Object.entries(KEY_BINDINGS).map(([code, action]) => [keyName(code), KEY_DOES[action]]);
  const gestureRows = GESTURE_HELP.map((g) => [g.name, g.how, g.does, WHERE[g.where]]);

  const body = h(
    'div',
    { class: 'screen settings' },
    h('div', { class: 'title-row' }, h('h1', {}, 'Settings'), h('p', { class: 'subline' }, 'Saved in this browser.')),
    h(
      'section',
      { class: 'block settings-card', 'aria-labelledby': 'settings-general' },
      h('h2', { id: 'settings-general' }, 'General'),
      switchRow('hands', 'Hand gestures', 'Show the Hands button on Plan, Compare and Drive, to drive and move the view with the camera.', s.hands, (on) => updateSettings({ hands: on })),
      switchRow('voice', 'Voice dictation', 'Show the Voice button, to give “Hey Cathy, …” commands by speaking. Chrome sends the audio to Google.', s.voice, (on) => updateSettings({ voice: on })),
      switchRow('speak', 'Cathy speaks', 'Cathy reads her answers aloud. Her answers are always shown as text too. An on-device voice is used when the browser has one.', s.speak, (on) => updateSettings({ speak: on })),
      themeRow(s.theme),
    ),
    h(
      'section',
      { class: 'block settings-card', 'aria-labelledby': 'settings-commands' },
      h('h2', { id: 'settings-commands' }, 'Commands'),
      h('p', { class: 'muted' }, 'Every hand gesture, voice command and key. Turning a list off only hides it here; the input keeps working.'),
      commandSection('showGestures', 'Hand gestures', 'With Hands on, in front of the camera.', ['Gesture', 'How', 'What it does', 'Where'], gestureRows, s),
      commandSection('showVoice', 'Voice commands', 'With Voice on: say “Hey Cathy”, then the command. Cathy’s questions also work from her box, by button or typed.', ['Say', 'What it does'], voiceRows, s),
      commandSection('showKeys', 'Keyboard', 'On Drive. A gamepad works too: sticks push and rotate, right trigger for fluoro, A for contrast.', ['Key', 'What it does'], keyRows, s),
    ),
    honestyLine(),
  );
  renderShell(root, { crumbs: [{ label: 'Library', href: href.library() }, { label: 'Settings' }], body }, 'settings');
  return Promise.resolve();
}
