/**
 * Opt-in "always listen" mode: the microphone stays on, and only speech that starts with the wake
 * word "Hey Cathy" is treated as a command. Everything else is ignored, never matched.
 *
 * - "Hey Cathy, zoom in" runs zoom_in in one go.
 * - "Hey Cathy" alone arms the listener: the next utterance is taken as the command, with or
 *   without the wake word. One utterance only, then it is back to needing the wake word.
 * - Each recognition session is restarted when it ends, until stop(). A fatal error (microphone
 *   blocked or missing, service not allowed) stops the listener for good and reports it; harmless
 *   ones ('no-speech', 'aborted', 'network') just let the next session start.
 *
 * Off until the caller starts it: the UI must show that the microphone is live (in Chrome the audio
 * streams to Google while it is on). Push-to-talk (./ptt) remains the default way to talk.
 */

import { matchCommand, normalize, stripWake, type SpeechAlternative, type VoiceMatch } from './match';
import type { Recognizer } from './ptt';

export type WakeState = 'off' | 'listening' | 'armed' | 'error';

export interface WakeListener {
  start(): void;
  stop(): void;
  readonly state: WakeState;
  /** The error code that stopped it, when state is 'error'. */
  readonly error: string | null;
}

/** Errors that mean listening cannot work; anything else just ends one session. */
export const FATAL_SPEECH_ERRORS: readonly string[] = ['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported'];

/** True when the transcript starts with the wake phrase ("hey cathy", "a kathy", "cathy", …). */
export function startsWithWake(transcript: string): boolean {
  const words = normalize(transcript);
  return words.length > 0 && stripWake(words).length < words.length;
}

/** The transcript with the wake phrase removed, or null when it has none. */
function afterWake(transcript: string): string[] | null {
  const words = normalize(transcript);
  const rest = stripWake(words);
  return rest.length < words.length ? rest : null;
}

export function createWakeListener(
  recognizer: Recognizer,
  onCommand: (match: VoiceMatch) => void,
  onStateChange?: (state: WakeState) => void,
): WakeListener {
  let state: WakeState = 'off';
  let error: string | null = null;
  let active = false;

  const set = (s: WakeState) => {
    if (s === state) return;
    state = s;
    onStateChange?.(s);
  };

  const onResult = (alts: SpeechAlternative[]) => {
    if (!active) return;
    const woke = alts.find((a) => afterWake(a.transcript) !== null);
    if (woke) {
      const rest = afterWake(woke.transcript)!;
      if (rest.length === 0) {
        set('armed'); // "Hey Cathy" alone: the next utterance is the command
        return;
      }
      // match the words after the wake phrase, but report what was actually heard
      const m = matchCommand([{ transcript: rest.join(' '), confidence: woke.confidence }]);
      onCommand(m.action ? { ...m, heard: woke.transcript } : { action: null, heard: woke.transcript });
      set('listening');
      return;
    }
    if (state === 'armed') {
      onCommand(matchCommand(alts));
      set('listening');
    }
    // no wake word and not armed: not addressed to Cathy, ignore
  };

  const bind = () => {
    recognizer.onResult = onResult;
    recognizer.onEnd = () => {
      if (active) recognizer.start(); // keep listening
    };
    recognizer.onError = (code) => {
      if (!FATAL_SPEECH_ERRORS.includes(code)) return;
      active = false;
      error = code;
      set('error');
    };
  };

  return {
    start() {
      if (!recognizer.isSupported || active) return;
      active = true;
      error = null;
      bind();
      set('listening');
      recognizer.start();
    },
    stop() {
      if (!active && state !== 'error') return;
      active = false;
      set('off');
      recognizer.stop();
    },
    get state() {
      return state;
    },
    get error() {
      return error;
    },
  };
}
