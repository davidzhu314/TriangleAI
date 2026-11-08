/**
 * Hands-free input on Plan, Compare and Drive (option A, integration/hands-voice): the camera with a mirrored
 * self-view and Vaibhav's gesture machine (both hands: drive, point, pinch, pan), and voice: a "Voice" switch that
 * listens for "Hey Cathy, …" (the wake listener), with a caption.
 *
 * - Both are off until the trainee turns them on. The camera stays on this device (MediaPipe runs in the page).
 * - While voice is on, a notice says the microphone is live and Chrome sends the audio to Google.
 * - Keyboard and gamepad keep working and win over the hand (mergeControl), so the keyboard-only demo stays the
 *   fallback at every moment.
 */
import { createBrowserRecognizer, createWakeListener, type GestureOutput, type HandFrame, type VoiceAction, type VoiceMatch, type WakeState } from '../../input';
import { h } from '../dom';
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
  onVoice: (action: VoiceAction) => string | null | Promise<string | null>;
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

export function createHandsVoice({ host, onGesture, onPan, onVoice, actions }: HandsVoiceOptions): HandsVoice {
  let tracker: HandTracker | null = null;
  let latest: GestureOutput | null = null;
  let latestAt = 0;
  let starting = false;

  // ---- floating panel: self-view, status, notices, caption
  const video = h('video', { class: 'hv-video', 'aria-hidden': 'true', muted: true, playsinline: true });
  const status = h('p', { class: 'hv-status', 'data-testid': 'hands-status' });
  const cameraNote = h('p', { class: 'hv-note' }, 'Camera on. Frames stay on this device.');
  const selfView = h('div', { class: 'hv-self', hidden: true, 'data-testid': 'hands-self-view' }, video, status, cameraNote);
  const micNotice = h('p', { class: 'pill pill-warning hv-mic', hidden: true, role: 'status', 'data-testid': 'mic-live' }, 'Microphone on: Chrome sends this audio to Google to recognise speech. Say “Hey Cathy, …”.');
  const caption = h('div', { class: 'hv-caption', role: 'status', 'aria-live': 'polite', 'data-testid': 'voice-caption' });
  const panel = h('div', { class: 'hv-panel' }, selfView, micNotice, caption);
  const pointer = h('div', { class: 'hv-pointer', hidden: true, 'aria-hidden': 'true' });
  host.append(panel, pointer);

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

  const controls = h('div', { class: 'hv-controls', role: 'group', 'aria-label': 'Hands-free input' }, handsButton, voiceButton);
  return {
    controls,
    gesture: () => (latest && performance.now() - latestAt <= STALE_MS ? latest : null),
    dispose() {
      tracker?.stop();
      tracker = null;
      wake.stop();
      recognizer.abort?.();
      if (window.__threadsimHands) delete window.__threadsimHands;
      panel.remove();
      pointer.remove();
      controls.remove();
    },
  };
}
