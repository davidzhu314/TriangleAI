/**
 * Hands-free input on Plan, Compare and Drive (option A, integration/hands-voice): the camera with a mirrored
 * self-view and Vaibhav's gesture machine (both hands: drive, point, pinch, pan), and voice: a "Voice" switch that
 * listens for "Hey Cathy, …" (the wake listener), with a caption.
 *
 * - Both are off until the trainee turns them on. The camera stays on this device (MediaPipe runs in the page).
 * - While voice is on, a notice says the microphone is live and Chrome sends the audio to Google.
 * - Keyboard and gamepad keep working and win over the hand (mergeControl), so the keyboard-only demo stays the
 *   fallback at every moment.
 * - Cathy's box (bottom right, on screens that answer questions): her questions as buttons, a field that matches a
 *   typed question with the same matcher as voice, and her latest answer, from voice too. Every answer is the screen's
 *   engine template (`onVoice`): deterministic, no AI model and no network.
 * - Cathy speaks each answer aloud (speech synthesis, Settings → "Cathy speaks", and a Sound button in her box), the
 *   same words the box or caption shows.
 */
import type { LoadedCase } from '../../contracts';
import { createBrowserRecognizer, createBrowserSpeaker, createWakeListener, matchCommand, resolveVesselTarget, type GestureOutput, type HandFrame, type VoiceAction, type VoiceMatch, type WakeState } from '../../input';
import { h } from '../dom';
import { readSettings, SETTINGS_EVENT, updateSettings, type Settings } from '../settings-store';
import { feedFrames, startHandTracking, type HandTracker, type TrackerError } from './camera';
import './hands-voice.css';

export const ACTION_WORDS: Readonly<Record<VoiceAction, string>> = {
  zoom_in: 'Zoom in',
  zoom_out: 'Zoom out',
  assist_best_next: 'Best next artery',
  assist_options: 'My options',
  assist_review: 'How am I doing',
  assist_check: 'Am I on the right path',
  undo: 'Undo last step',
  reset_view: 'Reset view',
  hide_labels: 'Hide names',
  show_labels: 'Show names',
  toggle_fluoro: 'Toggle fluoro',
  zoom_to: 'Zoom to an artery',
};

/** "Hey Cathy, zoom into <artery>": find it on this case and frame it. */
export function zoomToAnswer(c: LoadedCase, match: VoiceMatch | undefined, zoomTo: (edges: readonly string[]) => boolean): string | null {
  const said = match && match.action === 'zoom_to' ? match.target : undefined;
  if (!said) return 'Say which artery, for example “zoom into the aortic arch”.';
  const t = resolveVesselTarget(said, c);
  if (!t) return `I can't find “${said}” on this case.`;
  return zoomTo(t.edges) ? `Zoomed to the ${t.label}.` : 'Zoom works in the 3D view.';
}

/** Cathy's questions, in the order her buttons show them; a screen gets the ones it answers. */
const QUESTIONS: readonly VoiceAction[] = ['assist_check', 'assist_best_next', 'assist_options', 'assist_review'];

/**
 * A typed question that the voice matcher missed (typing is wordier than speaking): the first question whose
 * keywords appear in it. Deterministic, like the matcher; null when none does.
 */
const TYPED_KEYWORDS: readonly [VoiceAction, RegExp][] = [
  ['assist_check', /\b(right (path|way|track)|on (track|the plan)|am i lost|is this (right|correct)|correct (path|way))\b/],
  ['assist_review', /\b(how am i doing|doing wrong|mistakes?|feedback|review|how did i do|going so far)\b/],
  ['assist_options', /\b(options?|choices?|alternatives?|other (routes?|paths?|ways?))\b/],
  ['assist_best_next', /\b(next|where|which (way|branch|artery|vessel)|best (path|route|way|artery))\b/],
];
export function typedQuestion(text: string, available: readonly VoiceAction[]): VoiceAction | null {
  const t = text.toLowerCase();
  for (const [action, re] of TYPED_KEYWORDS) if (available.includes(action) && re.test(t)) return action;
  return null;
}

/** Whether Cathy's box is open, remembered per browser (a convenience: it opens if storage is unavailable). */
const CATHY_OPEN_KEY = 'threadsim.cathy.open';
const readOpen = (): boolean => {
  try {
    return localStorage.getItem(CATHY_OPEN_KEY) !== 'false';
  } catch {
    return true;
  }
};
const writeOpen = (open: boolean): void => {
  try {
    localStorage.setItem(CATHY_OPEN_KEY, String(open));
  } catch {
    // private window or blocked storage: the box still works, it just won't remember
  }
};

const STATUS_WORDS: Readonly<Record<GestureOutput['status'], string>> = {
  none: 'Show your hand to the camera.',
  lost: 'Hand lost. Show it again.',
  gun: 'Gun pose: barrel straight pushes, half-curled holds, curled pulls; twist to rotate.',
  point: 'Pointing: pinch to pick the branch under the dot.',
  pan: 'Turning: move your hand to turn the case; two hands moving opposite ways roll it.',
};

/** What the gun pose is doing to the wire this frame, shown after the pose's words. */
const pushWords = (push: number): string => (push > 0 ? 'Pushing.' : push < 0 ? 'Pulling.' : 'Holding.');

/**
 * A gesture older than this, with no newer camera frame, counts as no hand: if the camera or the tracker stalls
 * mid-push, the wire stops instead of pushing on. A webcam runs at about 20 fps (50 ms a frame).
 */
const STALE_MS = 400;

/** Words for the wake listener's errors (Web Speech codes); anything else is said generically. */
const VOICE_ERROR_WORDS: Readonly<Record<string, string>> = {
  'not-allowed': 'Voice stopped: microphone access was blocked.',
  'service-not-allowed': 'Voice stopped: the speech service is not allowed here.',
  'audio-capture': 'Voice stopped: no microphone found.',
  'language-not-supported': 'Voice stopped: this language is not supported.',
};

const ERROR_WORDS: Readonly<Record<TrackerError, string>> = {
  'no-camera': 'No camera found. The keyboard still drives.',
  denied: 'Camera access was blocked. Allow it in the browser to use hands.',
  model: 'Hand tracking could not start. The keyboard still drives.',
};

export interface HandsVoiceOptions {
  /** Where Cathy's box goes; the view (`host`) by default. Drive puts it under the 3D / Flat switch. */
  cathyHost?: HTMLElement;
  /** The view element: the self-view, caption and pointer dot float inside it. */
  host: HTMLElement;
  /** Every gesture frame while the camera is on (null when it turns off). */
  onGesture?: (g: GestureOutput | null) => void;
  /**
   * A pan this frame, in screen widths in the user's view (either hand, averaged), and a roll: with both hands
   * panning, half the difference of their vertical moves (left down and right up is counter-clockwise).
   */
  onPan?: (dx: number, dy: number, roll: number) => void;
  /** A recognised command: return the answer to show under the caption, or null. */
  /** `match` carries what was said; for zoom_to, `match.target` is the artery ("aortic arch"). */
  onVoice: (action: VoiceAction, match?: VoiceMatch) => string | null | Promise<string | null>;
  /** Which commands this screen answers; others get "not on this screen". */
  actions: readonly VoiceAction[];
}

export interface HandsVoice {
  /** The Hands and Voice buttons, for the screen's toolbar. */
  readonly controls: HTMLElement;
  /** The latest gesture while the camera is on, else null. */
  gesture(): GestureOutput | null;
  dispose(): void;
}

declare global {
  interface Window {
    __threadsimHands?: { feed(frame: HandFrame): void };
  }
}

export function createHandsVoice({ host, cathyHost, onGesture, onPan, onVoice, actions }: HandsVoiceOptions): HandsVoice {
  let tracker: HandTracker | null = null;
  let latest: GestureOutput | null = null;
  let latestAt = 0;
  let starting = false;

  // ---- floating panel: self-view, status, notices, caption
  const video = h('video', { class: 'hv-video', 'aria-hidden': 'true', muted: true, playsinline: true });
  const status = h('p', { class: 'hv-status', 'data-testid': 'hands-status' });
  const cameraNote = h('p', { class: 'hv-note' }, 'Camera on. Frames stay on this device.');
  const selfView = h('div', { class: 'hv-self', hidden: true, 'data-testid': 'hands-self-view' }, video, status, cameraNote);
  const micNotice = h('p', { class: 'hv-mic', hidden: true, role: 'status', 'data-testid': 'mic-live' }, 'Microphone on: Chrome sends this audio to Google to recognise speech. Say “Hey Cathy, …”.');
  const caption = h('div', { class: 'hv-caption', role: 'status', 'aria-live': 'polite', 'data-testid': 'voice-caption' });
  // Cathy's text stays in the view box (bottom-left, clear of the arteries at the default framing); the webcam
  // self-view sits in the page's bottom-right corner instead, so it never covers the arteries. On Drive it rises
  // above the Restart / Exit / Finish buttons.
  const panel = h('div', { class: 'hv-panel' }, micNotice, caption);
  const pointer = h('div', { class: 'hv-pointer', hidden: true, 'aria-hidden': 'true' });
  host.append(panel, pointer);
  document.body.append(selfView);

  // ---- Cathy's box: ask by button, by typing, or by voice; the answer shows here
  const questions = QUESTIONS.filter((a) => actions.includes(a));
  // Settings: the Hands and Voice buttons are offered only when the trainee keeps them on (read once per screen).
  const prefs = readSettings();
  // ---- Cathy's voice: every answer shown is also said, unless muted (Settings or the Sound button)
  const speaker = createBrowserSpeaker();
  let speakOn = prefs.speak;
  const say = (text: string): void => {
    if (speakOn) speaker.say(text);
  };
  const sound = h('button', { type: 'button', class: 'btn btn-secondary btn-small cathy-sound', 'aria-pressed': String(speakOn), 'data-testid': 'cathy-sound', hidden: !speaker.isSupported }, speakOn ? 'Sound on' : 'Sound off');
  const showSound = (on: boolean): void => {
    speakOn = on;
    sound.setAttribute('aria-pressed', String(on));
    sound.textContent = on ? 'Sound on' : 'Sound off';
    if (!on) speaker.stop();
  };
  sound.addEventListener('click', () => updateSettings({ speak: !speakOn }));
  const onSettings = (e: Event): void => showSound((e as CustomEvent<Settings>).detail.speak);
  window.addEventListener(SETTINGS_EVENT, onSettings);
  const cathyOut = h('div', { class: 'cathy-out', role: 'status', 'aria-live': 'polite', 'data-testid': 'cathy-output' });
  cathyOut.append(h('p', { class: 'cathy-hint' }, prefs.voice ? 'Pick a question, type one, or turn Voice on and say “Hey Cathy, …”.' : 'Pick a question or type one.'));
  /**
   * Run an action through the screen and show the exchange in the box. With `quiet`, an action that succeeds without
   * words (a zoom by voice) leaves the box as it was.
   */
  const respond = async (action: VoiceAction, asked: string, into: HTMLElement, quiet = false, match?: VoiceMatch): Promise<void> => {
    const youAsked = h('p', { class: 'cathy-asked' }, asked);
    if (!actions.includes(action)) {
      const line = `${ACTION_WORDS[action]} isn't available on this screen.`;
      into.replaceChildren(youAsked, h('p', { class: 'hv-answer', 'data-testid': 'voice-answer' }, `“${ACTION_WORDS[action]}” isn't available on this screen.`));
      say(line);
      return;
    }
    const text = await onVoice(action, match);
    if (!text && quiet) return;
    into.replaceChildren(youAsked, h('p', { class: 'hv-answer', 'data-testid': 'voice-answer' }, text ?? 'Done.'));
    say(text ?? 'Done.');
  };
  let cathyBox: HTMLElement | null = null;
  if (questions.length) {
    const buttons = h(
      'div',
      { class: 'cathy-questions', role: 'group', 'aria-label': 'Ask Cathy' },
      ...questions.map((a) => {
        const b = h('button', { type: 'button', class: 'btn btn-secondary btn-small', 'data-ask': a }, ACTION_WORDS[a]);
        b.addEventListener('click', () => void respond(a, `${ACTION_WORDS[a]}?`, cathyOut));
        return b;
      }),
    );
    const field = h('input', { type: 'text', class: 'cathy-field', placeholder: 'Ask Cathy…', 'aria-label': 'Ask Cathy a question', autocomplete: 'off', 'data-testid': 'cathy-field' }) as HTMLInputElement;
    const form = h('form', { class: 'cathy-form' }, field, h('button', { type: 'submit', class: 'btn btn-secondary btn-small' }, 'Ask'));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const typed = field.value.trim();
      if (!typed) return;
      field.value = '';
      const m = matchCommand([{ transcript: typed, confidence: 1 }]);
      const action = m.action ?? typedQuestion(typed, questions);
      if (action) void respond(action, typed, cathyOut, false, m.action ? m : undefined);
      else {
        const line = `I can answer: ${questions.map((a) => `“${ACTION_WORDS[a]}”`).join(', ')}.`;
        cathyOut.replaceChildren(h('p', { class: 'cathy-asked' }, typed), h('p', { class: 'hv-answer', 'data-testid': 'voice-answer' }, line));
        say(line);
      }
    });
    // Typing in the box must not drive the wire or trigger the screen's other shortcuts.
    field.addEventListener('keydown', (e) => e.stopPropagation());
    field.addEventListener('keyup', (e) => e.stopPropagation());
    const body = h('div', { class: 'cathy-body' }, buttons, form, cathyOut, h('div', { class: 'cathy-foot' }, h('p', { class: 'cathy-note' }, 'Answers come from the route engine, not an AI model.'), sound));
    const toggle = h('button', { type: 'button', class: 'cathy-toggle', 'aria-expanded': 'true', 'data-testid': 'cathy-toggle' }, 'Cathy');
    const setOpen = (open: boolean): void => {
      body.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      writeOpen(open);
    };
    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    cathyBox = h('aside', { class: 'cathy-box', 'aria-label': 'Cathy, the assistant', 'data-testid': 'cathy-box' }, toggle, body);
    (cathyHost ?? host).append(cathyBox);
    setOpen(readOpen());
  }

  const show = (g: GestureOutput | null): void => {
    latest = g;
    latestAt = performance.now();
    status.textContent = g ? (g.control ? `${pushWords(g.control.push)} ${STATUS_WORDS[g.status]}` : STATUS_WORDS[g.status]) : '';
    host.dataset['hands'] = g ? g.status : 'off';
    host.dataset['handsPush'] = g?.control ? (g.control.push > 0 ? 'push' : g.control.push < 0 ? 'pull' : 'hold') : 'none';
    if (g?.pointer) {
      pointer.hidden = false;
      pointer.style.setProperty('--hv-x', `${g.pointer.x * 100}%`);
      pointer.style.setProperty('--hv-y', `${g.pointer.y * 100}%`);
    } else pointer.hidden = true;
    if (g?.pan) {
      const l = g.hands.Left.pan;
      const r = g.hands.Right.pan;
      onPan?.(g.pan.dx, g.pan.dy, l && r ? (l.dy - r.dy) / 2 : 0);
    }
    onGesture?.(g);
  };

  // ---- Hands toggle
  const handsButton = h('button', { type: 'button', class: 'btn btn-secondary hv-hands', 'aria-pressed': 'false', 'data-testid': 'hands-toggle' }, 'Hands');
  const setHands = async (on: boolean): Promise<void> => {
    if (starting) return;
    handsButton.setAttribute('aria-pressed', String(on));
    selfView.hidden = !on;
    if (!on) {
      tracker?.stop();
      tracker = null;
      show(null);
      return;
    }
    starting = true;
    status.textContent = 'Starting the camera…';
    host.dataset['hands'] = 'starting';
    try {
      tracker = await startHandTracking(video, show);
      host.dataset['hands'] = 'none';
    } catch (e) {
      status.textContent = ERROR_WORDS[(e as TrackerError) in ERROR_WORDS ? (e as TrackerError) : 'model'];
      host.dataset['hands'] = 'error';
      handsButton.setAttribute('aria-pressed', 'false');
    } finally {
      starting = false;
    }
  };
  handsButton.addEventListener('click', () => void setHands(handsButton.getAttribute('aria-pressed') !== 'true'));

  // ---- voice: a switch that listens for "Hey Cathy, …" (Vaibhav's wake listener), off by default
  const recognizer = createBrowserRecognizer();
  const answer = async (m: VoiceMatch): Promise<void> => {
    const words = m.action === 'zoom_to' && m.target ? `Zoom to the ${m.target}` : m.action ? ACTION_WORDS[m.action] : '';
    const heard = h('p', { class: 'hv-heard' }, m.action ? `Heard: “${m.heard}” → ${words}` : `Heard: “${m.heard}”. No command matched.`);
    caption.replaceChildren(heard);
    host.dataset['voiceAction'] = m.action ?? 'none';
    if (!m.action) return;
    // With Cathy's box on this screen, every answer goes there; the caption keeps what was heard.
    if (cathyBox) {
      await respond(m.action, `“${m.heard}”`, cathyOut, true, m);
      return;
    }
    if (!actions.includes(m.action)) {
      caption.append(h('p', { class: 'hv-answer' }, `“${ACTION_WORDS[m.action]}” isn't available on this screen.`));
      say(`${ACTION_WORDS[m.action]} isn't available on this screen.`);
      return;
    }
    const text = await onVoice(m.action, m);
    if (text) {
      caption.append(h('p', { class: 'hv-answer', 'data-testid': 'voice-answer' }, text));
      say(text);
    }
  };
  const onState = (state: WakeState): void => {
    host.dataset['mic'] = state;
    micNotice.hidden = state === 'off' || state === 'error';
    voiceButton.setAttribute('aria-pressed', String(state === 'listening' || state === 'armed'));
    if (state === 'armed') caption.replaceChildren(h('p', { class: 'hv-heard' }, 'Heard “Hey Cathy”… say the command.'));
    else if (state === 'listening' && !caption.querySelector('.hv-answer, .hv-heard')) caption.replaceChildren(h('p', { class: 'hv-heard' }, 'Listening for “Hey Cathy”.'));
    else if (state === 'off') caption.replaceChildren();
    else if (state === 'error') caption.replaceChildren(h('p', { class: 'hv-heard' }, VOICE_ERROR_WORDS[wake.error ?? ''] ?? 'Voice stopped.'));
  };
  const wake = createWakeListener(recognizer, (m) => void answer(m), onState);
  const voiceButton = h('button', { type: 'button', class: 'btn btn-secondary hv-voice', 'aria-pressed': 'false', 'data-testid': 'voice-toggle' }, 'Voice');
  voiceButton.addEventListener('click', () => {
    if (!recognizer.isSupported) {
      caption.replaceChildren(h('p', { class: 'hv-heard' }, "Voice isn't available in this browser. Chrome supports it."));
      return;
    }
    if (wake.state === 'listening' || wake.state === 'armed') wake.stop();
    else wake.start();
  });

  // Under automation only: recorded hand frames through the same gesture pipeline (no camera in CI).
  if (navigator.webdriver) {
    const feed = feedFrames((g) => {
      selfView.hidden = false;
      show(g);
    });
    window.__threadsimHands = { feed };
  }

  handsButton.hidden = !prefs.hands;
  voiceButton.hidden = !prefs.voice;
  const controls = h('div', { class: 'hv-controls', role: 'group', 'aria-label': 'Hands-free input', hidden: !prefs.hands && !prefs.voice }, handsButton, voiceButton);
  return {
    controls,
    gesture: () => (latest && performance.now() - latestAt <= STALE_MS ? latest : null),
    dispose() {
      tracker?.stop();
      tracker = null;
      wake.stop();
      recognizer.abort?.();
      speaker.stop();
      window.removeEventListener(SETTINGS_EVENT, onSettings);
      if (window.__threadsimHands) delete window.__threadsimHands;
      panel.remove();
      selfView.remove();
      pointer.remove();
      cathyBox?.remove();
      controls.remove();
    },
  };
}
