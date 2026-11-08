/**
 * A thin wrapper over the browser's Web Speech API (`SpeechRecognition`, or `webkitSpeechRecognition`
 * in Chrome). Never throws, never runs at import time, and nothing in the app calls it yet.
 *
 * Privacy: in Chrome, recognition sends the audio to Google's servers while a session is open, so it
 * needs internet. The wake listener (./wake) restarts each session when it ends, so voice stays on until stopped.
 */

import type { SpeechAlternative } from './match';
import type { Recognizer } from './recognizer';

/** The part of the Web Speech API used here (not in TypeScript's DOM lib everywhere). */
interface WebSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }> & { isFinal?: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
}
type Ctor = new () => WebSpeechRecognition;

const unsupported = (): Recognizer => ({ isSupported: false, start() {}, stop() {}, abort() {}, onResult: null, onEnd: null, onError: null });

export function createBrowserRecognizer(lang = 'en-US'): Recognizer {
  const w = (globalThis as { window?: { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor } }).window;
  const Impl = w?.SpeechRecognition ?? w?.webkitSpeechRecognition;
  if (!Impl) return unsupported();
  let rec: WebSpeechRecognition;
  try {
    rec = new Impl();
  } catch {
    return unsupported();
  }
  rec.continuous = false;
  rec.interimResults = false;
  rec.maxAlternatives = 5;
  rec.lang = lang;
  const r: Recognizer = {
    isSupported: true,
    start() {
      try {
        rec.start();
      } catch {
        // already started, or blocked: ignore
      }
    },
    stop() {
      try {
        rec.stop();
      } catch {
        // not started: ignore
      }
    },
    abort() {
      try {
        rec.abort();
      } catch {
        // not started: ignore
      }
    },
    onResult: null,
    onEnd: null,
    onError: null,
  };
  rec.onresult = (e) => {
    const last = e.results[e.results.length - 1];
    if (!last) return;
    const alts: SpeechAlternative[] = [];
    for (let i = 0; i < last.length; i++) alts.push({ transcript: last[i]!.transcript, confidence: last[i]!.confidence });
    r.onResult?.(alts);
  };
  rec.onend = () => r.onEnd?.();
  rec.onerror = (e) => r.onError?.(String((e as { error?: unknown } | null)?.error ?? 'unknown')); // onend follows an error
  return r;
}
