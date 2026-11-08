/**
 * Push-to-talk: the app listens only while the user holds the talk control. A small state machine
 * over any Recognizer (the browser one in ./speech, or a fake in tests).
 *
 * press() starts a recognition session. release() asks it to stop and opens a short tail
 * (RELEASE_TAIL_MS) for the final result of what was said while the key was held, because a
 * recogniser delivers it after stop(). When the tail ends, the session is aborted (the microphone is
 * cut off) and anything still arriving is ignored, so speech after release never runs a command.
 * Results from an older session are always ignored.
 */

import { matchCommand, type SpeechAlternative, type VoiceMatch } from './match';

export interface Recognizer {
  readonly isSupported: boolean;
  start(): void;
  stop(): void;
  /** Stop at once and discard any pending result. */
  abort?(): void;
  /** Alternatives of one final result, best first. */
  onResult: ((alternatives: SpeechAlternative[]) => void) | null;
  /** The session ended (after stop(), silence, or an error). */
  onEnd: (() => void) | null;
  /** A recognition error, by Web Speech error code ('not-allowed', 'no-speech', …). An onEnd follows. */
  onError?: ((code: string) => void) | null;
}

export type PttState = 'idle' | 'listening' | 'stopping';

export interface PushToTalk {
  press(): void;
  release(): void;
  readonly state: PttState;
}

/** How long after release a final result still counts, ms (it was spoken while the key was held). */
export const RELEASE_TAIL_MS = 700;

export interface PushToTalkOptions {
  releaseTailMs?: number;
  /** Runs `fn` after `ms`; returns a cancel function. Default: setTimeout. Injected in tests. */
  schedule?: (fn: () => void, ms: number) => () => void;
  /** Called whenever the state changes (for a "mic open" indicator). */
  onStateChange?: (state: PttState) => void;
}

const defaultSchedule = (fn: () => void, ms: number) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

export function createPushToTalk(recognizer: Recognizer, onCommand: (match: VoiceMatch) => void, options: PushToTalkOptions = {}): PushToTalk {
  const tail = options.releaseTailMs ?? RELEASE_TAIL_MS;
  const schedule = options.schedule ?? defaultSchedule;
  let state: PttState = 'idle';
  let session = 0;
  let cancelTail: (() => void) | null = null;

  const set = (s: PttState) => {
    if (s === state) return;
    state = s;
    options.onStateChange?.(s);
  };
  const endTail = () => {
    cancelTail?.();
    cancelTail = null;
  };

  const listen = (id: number) => {
    recognizer.onResult = (alts: SpeechAlternative[]) => {
      if (id !== session || state === 'idle') return; // outside the press window
      onCommand(matchCommand(alts));
    };
    recognizer.onEnd = () => {
      if (id !== session) return;
      endTail();
      set('idle');
    };
  };

  return {
    press() {
      if (!recognizer.isSupported || state === 'listening') return;
      endTail();
      session++;
      listen(session);
      set('listening');
      recognizer.start();
    },
    release() {
      if (state !== 'listening') return;
      set('stopping');
      recognizer.stop();
      const id = session;
      cancelTail = schedule(() => {
        cancelTail = null;
        if (id !== session || state !== 'stopping') return;
        set('idle'); // the window is closed: later results are ignored
        recognizer.abort?.();
      }, tail);
    },
    get state() {
      return state;
    },
  };
}
