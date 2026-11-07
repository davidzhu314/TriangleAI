/**
 * Push-to-talk: the app listens only while the user holds the talk control. A small state machine
 * over any Recognizer (the browser one in ./speech, or a fake in tests).
 *
 * press() starts a recognition session; release() asks it to stop. A recogniser delivers its final
 * result as the session finishes, after stop(), so a result counts while the session that press()
 * started is still open ('listening' or 'stopping'), and is ignored once it has ended ('idle') or
 * if it belongs to an older session.
 */

import { matchCommand, type SpeechAlternative, type VoiceMatch } from './match';

export interface Recognizer {
  readonly isSupported: boolean;
  start(): void;
  stop(): void;
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

export function createPushToTalk(recognizer: Recognizer, onCommand: (match: VoiceMatch) => void): PushToTalk {
  let state: PttState = 'idle';
  let session = 0;

  const listen = (id: number) => {
    recognizer.onResult = (alts) => {
      if (id !== session || state === 'idle') return; // outside the press window
      onCommand(matchCommand(alts));
    };
    recognizer.onEnd = () => {
      if (id === session) state = 'idle';
    };
  };

  return {
    press() {
      if (!recognizer.isSupported || state === 'listening') return;
      session++;
      listen(session);
      state = 'listening';
      recognizer.start();
    },
    release() {
      if (state !== 'listening') return;
      state = 'stopping';
      recognizer.stop();
    },
    get state() {
      return state;
    },
  };
}
