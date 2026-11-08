import { describe, expect, it } from 'vitest';
import type { SpeechAlternative, VoiceMatch } from './match';
import type { Recognizer } from './ptt';
import { createWakeListener, startsWithWake, type WakeState } from './wake';

const say = (...transcripts: string[]): SpeechAlternative[] => transcripts.map((transcript, i) => ({ transcript, confidence: 0.9 - i * 0.1 }));

function fakeRecognizer(supported = true) {
  const r: Recognizer & { started: number; stopped: number } = {
    isSupported: supported,
    started: 0,
    stopped: 0,
    start() {
      this.started++;
    },
    stop() {
      this.stopped++;
    },
    onResult: null,
    onEnd: null,
    onError: null,
  };
  return r;
}

function setup() {
  const rec = fakeRecognizer();
  const heard: VoiceMatch[] = [];
  const states: WakeState[] = [];
  const wake = createWakeListener(rec, (m) => heard.push(m), (s) => states.push(s));
  return { rec, heard, states, wake };
}

describe('always-listen mode, woken by "Hey Cathy"', () => {
  it('recognises the wake phrase in its spellings, and nothing else', () => {
    for (const t of ['Hey Cathy zoom in', 'hey kathy', 'a Cathy, options', 'Cathy where next']) expect(startsWithWake(t), t).toBe(true);
    for (const t of ['zoom in', 'hey zoom in', 'hey catherine zoom in', 'I said cathy']) expect(startsWithWake(t), t).toBe(false);
  });

  it('runs a command said after the wake word, and reports what was heard', () => {
    const { rec, heard, wake } = setup();
    wake.start();
    expect([wake.state, rec.started]).toEqual(['listening', 1]);
    rec.onResult?.(say('Hey Cathy, zoom in'));
    expect(heard).toEqual([{ action: 'zoom_in', heard: 'Hey Cathy, zoom in', score: 1 }]);
  });

  it('ignores speech without the wake word', () => {
    const { rec, heard, wake } = setup();
    wake.start();
    rec.onResult?.(say('zoom in'));
    rec.onResult?.(say('how am i doing'));
    expect(heard).toEqual([]);
  });

  it('"Hey Cathy" alone arms it for the next utterance only', () => {
    const { rec, heard, wake } = setup();
    wake.start();
    rec.onResult?.(say('Hey Cathy'));
    expect(wake.state).toBe('armed');
    rec.onResult?.(say('zoom out'));
    expect(heard.map((m) => m.action)).toEqual(['zoom_out']);
    expect(wake.state).toBe('listening');
    rec.onResult?.(say('zoom in')); // no wake word, no longer armed
    expect(heard).toHaveLength(1);
  });

  it('reports a wake-word phrase it cannot match, so the UI can say "didn’t catch that"', () => {
    const { rec, heard, wake } = setup();
    wake.start();
    rec.onResult?.(say('Hey Cathy banana bread'));
    expect(heard).toEqual([{ action: null, heard: 'Hey Cathy banana bread' }]);
  });

  it('uses a lower-ranked alternative when only it carries the wake word', () => {
    const { rec, heard, wake } = setup();
    wake.start();
    rec.onResult?.(say('hey cabbie zoom in', 'hey cathy zoom in'));
    expect(heard.map((m) => m.action)).toEqual(['zoom_in']);
  });

  it('keeps listening: each session that ends is restarted, until stop()', () => {
    const { rec, wake } = setup();
    wake.start();
    rec.onEnd?.();
    rec.onEnd?.();
    expect(rec.started).toBe(3);
    wake.stop();
    expect([wake.state, rec.stopped]).toEqual(['off', 1]);
    rec.onEnd?.();
    expect(rec.started).toBe(3);
  });

  it('ignores results that arrive after stop()', () => {
    const { rec, heard, wake } = setup();
    wake.start();
    wake.stop();
    rec.onResult?.(say('hey cathy zoom in'));
    expect(heard).toEqual([]);
  });

  it('a harmless error just lets the next session start; a blocked microphone stops it for good', () => {
    const { rec, wake, states } = setup();
    wake.start();
    rec.onError?.('no-speech');
    rec.onEnd?.();
    expect([wake.state, rec.started]).toEqual(['listening', 2]);
    rec.onError?.('not-allowed');
    rec.onEnd?.();
    expect([wake.state, wake.error, rec.started]).toEqual(['error', 'not-allowed', 2]);
    expect(states).toEqual(['listening', 'error']);
    wake.start(); // can be retried once the user allows the microphone
    expect([wake.state, wake.error, rec.started]).toEqual(['listening', null, 3]);
  });

  it('does nothing without speech support', () => {
    const rec = fakeRecognizer(false);
    const wake = createWakeListener(rec, () => undefined);
    wake.start();
    expect([wake.state, rec.started]).toEqual(['off', 0]);
  });
});
