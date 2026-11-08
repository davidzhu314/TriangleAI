/**
 * Hands-free input on Plan and Drive (option A, integration/hands-voice): the camera with a mirrored self-view and
 * Vaibhav's gesture machine, and push-to-talk voice (hold V) with a caption.
 *
 * - Off until the trainee turns it on. The camera stays on this device (MediaPipe runs in the page).
 * - While the microphone is open, a notice says Chrome sends that audio to Google to recognise speech.
 * - Keyboard and gamepad keep working and win over the hand (mergeControl), so the keyboard-only demo stays the
 *   fallback at every moment.
 */
import { createBrowserRecognizer, createPushToTalk, type GestureOutput, type HandFrame, type PttState, type VoiceAction, type VoiceMatch } from '../../input';
import { h } from '../dom';
import { feedFrames, startHandTracking, type HandTracker, type TrackerError } from './camera';
import './hands-voice.css';

export const ACTION_WORDS: Readonly<Record<VoiceAction, string>> = {
  zoom_in: 'Zoom in',
  zoom_out: 'Zoom out',
  assist_best_next: 'Best next artery',
  assist_options: 'My options',
  assist_review: 'How am I doing',
};

const STATUS_WORDS: Readonly<Record<GestureOutput['status'], string>> = {
  none: 'Show your hand to the camera.',
  lost: 'Hand lost. Show it again.',
  gun: 'Gun pose: aim to push or pull, twist to rotate.',
  point: 'Pointing: pinch to pick the branch under the dot.',
};

const ERROR_WORDS: Readonly<Record<TrackerError, string>> = {
  'no-camera': 'No camera found. The keyboard still drives.',
  denied: 'Camera access was blocked. Allow it in the browser to use hands.',
  model: 'Hand tracking could not start. The keyboard still drives.',
};

export interface HandsVoiceOptions {
  /** The view element: the self-view, caption and pointer dot float inside it. */
  host: HTMLElement;
  /** Every gesture frame while the camera is on (null when it turns off). */
  onGesture?: (g: GestureOutput | null) => void;
  /** A recognised command: return the answer to show under the caption, or null. */
  onVoice: (action: VoiceAction) => string | null | Promise<string | null>;
  /** Which commands this screen answers; others get "not on this screen". */
  actions: readonly VoiceAction[];
}

export interface HandsVoice {
  /** The Hands and Talk buttons, for the screen's toolbar. */
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

export function createHandsVoice({ host, onGesture, onVoice, actions }: HandsVoiceOptions): HandsVoice {
  let tracker: HandTracker | null = null;
  let latest: GestureOutput | null = null;
  let starting = false;

  // ---- floating panel: self-view, status, notices, caption
  const video = h('video', { class: 'hv-video', 'aria-hidden': 'true', muted: true, playsinline: true });
  const status = h('p', { class: 'hv-status', 'data-testid': 'hands-status' });
  const cameraNote = h('p', { class: 'hv-note' }, 'Camera on. Frames stay on this device.');
  const selfView = h('div', { class: 'hv-self', hidden: true, 'data-testid': 'hands-self-view' }, video, status, cameraNote);
  const micNotice = h('p', { class: 'pill pill-warning hv-mic', hidden: true, role: 'status', 'data-testid': 'mic-live' }, 'Microphone on: Chrome sends this audio to Google to recognise speech.');
  const caption = h('div', { class: 'hv-caption', role: 'status', 'aria-live': 'polite', 'data-testid': 'voice-caption' });
  const panel = h('div', { class: 'hv-panel' }, selfView, micNotice, caption);
  const pointer = h('div', { class: 'hv-pointer', hidden: true, 'aria-hidden': 'true' });
  host.append(panel, pointer);

  const show = (g: GestureOutput | null): void => {
    latest = g;
    status.textContent = g ? STATUS_WORDS[g.status] : '';
    host.dataset['hands'] = g ? g.status : 'off';
    if (g?.pointer) {
      pointer.hidden = false;
      pointer.style.setProperty('--hv-x', `${g.pointer.x * 100}%`);
      pointer.style.setProperty('--hv-y', `${g.pointer.y * 100}%`);
    } else pointer.hidden = true;
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

  // ---- push-to-talk: hold V, or hold the Talk button
  const recognizer = createBrowserRecognizer();
  const answer = async (m: VoiceMatch): Promise<void> => {
    const heard = h('p', { class: 'hv-heard' }, m.action ? `Heard: “${m.heard}” → ${ACTION_WORDS[m.action]}` : `Heard: “${m.heard}”. No command matched.`);
    caption.replaceChildren(heard);
    host.dataset['voiceAction'] = m.action ?? 'none';
    if (!m.action) return;
    if (!actions.includes(m.action)) {
      caption.append(h('p', { class: 'hv-answer' }, `“${ACTION_WORDS[m.action]}” isn't available on this screen.`));
      return;
    }
    const text = await onVoice(m.action);
    if (text) caption.append(h('p', { class: 'hv-answer', 'data-testid': 'voice-answer' }, text));
  };
  const onState = (s: PttState): void => {
    micNotice.hidden = s === 'idle';
    talkButton.setAttribute('aria-pressed', String(s === 'listening'));
    host.dataset['mic'] = s;
  };
  const ptt = createPushToTalk(recognizer, (m) => void answer(m), { onStateChange: onState });
  const talkButton = h('button', { type: 'button', class: 'btn btn-secondary hv-talk', 'aria-pressed': 'false', 'aria-keyshortcuts': 'V', 'data-testid': 'talk' }, 'Hold V to talk');
  const press = (): void => {
    if (!recognizer.isSupported) {
      caption.replaceChildren(h('p', { class: 'hv-heard' }, "Voice isn't available in this browser. Chrome supports it."));
      return;
    }
    ptt.press();
  };
  talkButton.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    press();
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel'] as const) talkButton.addEventListener(ev, () => ptt.release());
  const typing = (t: EventTarget | null): boolean => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  const keydown = (e: KeyboardEvent): void => {
    if (e.code !== 'KeyV' || e.repeat || typing(e.target)) return;
    press();
  };
  const keyup = (e: KeyboardEvent): void => {
    if (e.code === 'KeyV') ptt.release();
  };
  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);

  // Under automation only: recorded hand frames through the same gesture pipeline (no camera in CI).
  if (navigator.webdriver) {
    const feed = feedFrames((g) => {
      selfView.hidden = false;
      show(g);
    });
    window.__threadsimHands = { feed };
  }

  const controls = h('div', { class: 'hv-controls', role: 'group', 'aria-label': 'Hands-free input' }, handsButton, talkButton);
  return {
    controls,
    gesture: () => latest,
    dispose() {
      tracker?.stop();
      tracker = null;
      ptt.release();
      recognizer.abort?.();
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      if (window.__threadsimHands) delete window.__threadsimHands;
      panel.remove();
      pointer.remove();
      controls.remove();
    },
  };
}
