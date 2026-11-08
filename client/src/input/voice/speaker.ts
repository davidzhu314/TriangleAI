/**
 * Cathy's voice: reads her answers aloud through speech synthesis (the browser's `speechSynthesis`, handed in by
 * `createBrowserSpeaker` in ./speech). Never throws, and does nothing without a synthesis.
 *
 * - One line at a time: a new line cuts off the one still playing, so she never talks over herself.
 * - Privacy: an on-device voice (`localService`) is preferred. Only when the browser has none does it fall back to its
 *   default voice, which in Chrome can be a Google network voice (the text then goes to Google, like recognition).
 * - Text only: the same line the caption shows, so what she says and what is on screen never differ.
 */

/** The part of the Web Speech synthesis API used here. */
export interface SynthVoice {
  name: string;
  lang: string;
  localService: boolean;
  default?: boolean;
}
export interface SynthUtterance {
  voice: SynthVoice | null;
  lang: string;
  rate: number;
  pitch: number;
  text: string;
}
export interface Synth {
  speak(u: SynthUtterance): void;
  cancel(): void;
  getVoices(): SynthVoice[];
}

export interface Speaker {
  readonly isSupported: boolean;
  /** Say this line, cutting off any line still playing. Empty text only stops. */
  say(text: string): void;
  stop(): void;
}

/** Speech reads punctuation and symbols differently from the eye: tidy the line for the ear. */
export function spokenText(text: string): string {
  return text
    .replace(/[“”"]/g, '')
    .replace(/\s*→\s*/g, ', then ')
    .replace(/\s*·\s*/g, ', ')
    .replace(/(\d)\s*mm\b/g, '$1 millimetres')
    .replace(/(\d)\s*cm\b/g, '$1 centimetres')
    .replace(/(\d)\s*°/g, '$1 degrees')
    .replace(/(\d)\s*%/g, '$1 percent')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The voice to use: an on-device voice in the language, then any on-device English one, then the browser's choice. */
export function pickVoice(voices: readonly SynthVoice[], lang = 'en-US'): SynthVoice | null {
  const base = lang.split('-')[0]!.toLowerCase();
  const local = voices.filter((v) => v.localService);
  return (
    local.find((v) => v.lang.toLowerCase() === lang.toLowerCase()) ??
    local.find((v) => v.lang.toLowerCase().startsWith(base)) ??
    null
  );
}

const silent = (): Speaker => ({ isSupported: false, say() {}, stop() {} });

/** A speaker over a given synthesis (the browser's comes from `createBrowserSpeaker` in ./speech). */
export function createSpeaker(opts: { synth: Synth | null; makeUtterance: ((text: string) => SynthUtterance) | null; lang?: string }): Speaker {
  const { synth, makeUtterance: make } = opts;
  if (!synth || !make) return silent();
  const lang = opts.lang ?? 'en-US';
  const stop = (): void => {
    try {
      synth.cancel();
    } catch {
      // nothing playing: ignore
    }
  };
  return {
    isSupported: true,
    say(text) {
      stop();
      const words = spokenText(text);
      if (!words) return;
      try {
        const u = make(words);
        u.lang = lang;
        u.voice = pickVoice(synth.getVoices(), lang);
        u.rate = 1.05;
        u.pitch = 1;
        synth.speak(u);
      } catch {
        // blocked by the browser: the caption still shows the line
      }
    },
    stop,
  };
}
