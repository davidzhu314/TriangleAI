/**
 * The speech recogniser the voice code talks to: Web Speech in the browser (./speech), a fake in tests.
 */

import type { SpeechAlternative } from './match';

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
