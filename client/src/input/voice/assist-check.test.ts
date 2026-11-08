/**
 * Voice corpus for assist_check (G5), through the real wake listener: with "Hey Cathy" (and its spellings
 * and mis-hearings) each phrasing runs assist_check; without the wake word nothing runs at all. The other
 * assist commands keep their own phrasings (no collision with "how am I doing" or "where next").
 */

import { describe, expect, it } from 'vitest';
import type { SpeechAlternative, VoiceMatch } from './match';
import { matchCommand } from './match';
import type { Recognizer } from './recognizer';
import { createWakeListener } from './wake';

const CHECK_PHRASES = [
  'am I on the right path',
  'am I on the right path?',
  'am I on the right track',
  'is this right',
  'is this the right way',
  'am I going the right way',
  'am I lost',
  'am I on track',
  // mis-hearings and fillers
  'am I on the rite path',
  'um am I on the right path',
  'am I on the right path please',
  'is this right Cathy',
];
const WAKES = ['Hey Cathy', 'hey Kathy', 'Hey Katie', 'a Cathy', 'Cathy'];
const NOT_CHECK: [string, string][] = [
  ['how am I doing', 'assist_review'],
  ['check my drive', 'assist_review'],
  ['where next', 'assist_best_next'],
  ['what are my options', 'assist_options'],
  ['undo that', 'undo'],
];

function listener() {
  const rec: Recognizer = { isSupported: true, start() {}, stop() {}, onResult: null, onEnd: null, onError: null };
  const heard: VoiceMatch[] = [];
  const wake = createWakeListener(rec, (m) => heard.push(m));
  wake.start();
  const say = (t: string) => rec.onResult!([{ transcript: t, confidence: 0.9 } satisfies SpeechAlternative]);
  return { heard, say };
}

describe('assist_check voice corpus', () => {
  const corpus = WAKES.flatMap((w) => CHECK_PHRASES.map((p) => `${w} ${p}`));

  it(`with the wake word: all ${corpus.length} utterances run assist_check`, () => {
    const { heard, say } = listener();
    const missed: string[] = [];
    for (const u of corpus) {
      const before = heard.length;
      say(u);
      if (heard[before]?.action !== 'assist_check') missed.push(`${u} → ${heard[before]?.action ?? 'nothing'}`);
    }
    expect(missed).toEqual([]);
  });

  it('"Hey Cathy" alone, then the phrase, runs it once', () => {
    const { heard, say } = listener();
    say('Hey Cathy');
    say('am I on the right path');
    say('am I on the right path'); // back to needing the wake word
    expect(heard.map((m) => m.action)).toEqual(['assist_check']);
  });

  it('without the wake word nothing runs', () => {
    const { heard, say } = listener();
    for (const p of CHECK_PHRASES) say(p);
    for (const p of ['hey am I on the right path', 'I asked Cathy am I on the right path', 'hey catherine is this right']) say(p);
    expect(heard).toEqual([]);
  });

  it.each(NOT_CHECK)('"%s" stays %s', (phrase, action) => {
    expect(matchCommand([{ transcript: `hey cathy ${phrase}`, confidence: 0.9 }]).action).toBe(action);
  });
});
