import { describe, expect, it } from 'vitest';
import { matchCommand, type SpeechAlternative, type VoiceMatch } from './match';
import type { Recognizer } from './recognizer';
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

describe('Cathy, undo (the last step)', () => {
  it('"Hey Cathy, undo" and its phrasings run undo; without the wake word nothing runs', () => {
    const { rec, heard, wake } = setup();
    wake.start();
    for (const t of ['Hey Cathy, undo', 'hey kathy undo that', 'Cathy, go back a step', 'hey cathy take that back', 'Hey Cathy, undo the last step']) rec.onResult?.(say(t));
    expect(heard.map((m) => m.action)).toEqual(['undo', 'undo', 'undo', 'undo', 'undo']);
    rec.onResult?.(say('undo'));
    expect(heard).toHaveLength(5);
  });

  it('undo is never confused with zoom out, and "Hey Cathy" then "undo" works as two utterances', () => {
    const { rec, heard, wake } = setup();
    wake.start();
    rec.onResult?.(say('Hey Cathy, zoom out'));
    rec.onResult?.(say('Hey Cathy, back out'));
    rec.onResult?.(say('Hey Cathy'));
    rec.onResult?.(say('undo'));
    expect(heard.map((m) => m.action)).toEqual(['zoom_out', 'zoom_out', 'undo']);
  });

  it('keeps listening across sessions until stopped (always on, no push-to-talk)', () => {
    const { rec, wake } = setup();
    wake.start();
    rec.onEnd?.();
    rec.onEnd?.();
    expect(rec.started).toBe(3);
    wake.stop();
    rec.onEnd?.();
    expect(rec.started).toBe(3);
  });
});

describe('Cathy, reset view', () => {
  it('"Hey Cathy, reset view" and its phrasings run reset_view; without the wake word nothing runs', () => {
    const { rec, heard, wake } = setup();
    wake.start();
    for (const t of ['Hey Cathy, reset view', 'hey kathy reset the view', 'Cathy, reset camera', 'Hey Cathy, recenter', 'hey cathy reset few']) rec.onResult?.(say(t));
    expect(heard.map((m) => m.action)).toEqual(['reset_view', 'reset_view', 'reset_view', 'reset_view', 'reset_view']);
    rec.onResult?.(say('reset view'));
    expect(heard).toHaveLength(5);
  });

  it('"Hey Cathy, reset" on its own resets the view (request from Aroovee)', () => {
    const { rec, heard, wake } = setup();
    wake.start();
    rec.onResult?.(say('Hey Cathy, reset'));
    rec.onResult?.(say('hey kathy reset'));
    expect(heard.map((m) => m.action)).toEqual(['reset_view', 'reset_view']);
    expect(matchCommand([{ transcript: 'hey cathy reset', confidence: 0.9 }]).action).toBe('reset_view');
  });

  it('is never confused with zoom out ("wide view") or undo', () => {
    const { rec, heard, wake } = setup();
    wake.start();
    for (const t of ['Hey Cathy, wide view', 'Hey Cathy, undo', 'Hey Cathy, reset view']) rec.onResult?.(say(t));
    expect(heard.map((m) => m.action)).toEqual(['zoom_out', 'undo', 'reset_view']);
  });
});

describe('Cathy, hide (the vessel names) and show labels', () => {
  it('"Hey Cathy, hide" and its phrasings hide the labels; "show labels" brings them back; nothing runs without the wake word', () => {
    const { rec, heard, wake } = setup();
    wake.start();
    for (const t of ['Hey Cathy, hide', 'hey kathy hide the names', 'Cathy, hide labels', 'Hey Cathy, labels off']) rec.onResult?.(say(t));
    for (const t of ['Hey Cathy, show labels', 'hey cathy show the names', 'Hey Cathy, unhide']) rec.onResult?.(say(t));
    expect(heard.map((m) => m.action)).toEqual(['hide_labels', 'hide_labels', 'hide_labels', 'hide_labels', 'show_labels', 'show_labels', 'show_labels']);
    rec.onResult?.(say('hide'));
    expect(heard).toHaveLength(7);
  });

  it('"Hey Cathy, hide labels" works, including as Chrome mis-hears it ("Hyde", "high", "hi")', () => {
    const { rec, heard, wake } = setup();
    wake.start();
    for (const t of ['Hey Cathy, hide labels', 'hey kathy hyde labels', 'Hey Cathy high labels', 'hey cathy hi labels', 'Hey Kathy Hyde']) rec.onResult?.(say(t));
    expect(heard.map((m) => m.action)).toEqual(['hide_labels', 'hide_labels', 'hide_labels', 'hide_labels', 'hide_labels']);
  });

  it('never confused with show options, wider or reset view', () => {
    const { rec, heard, wake } = setup();
    wake.start();
    for (const t of ['Hey Cathy, show options', 'Hey Cathy, wider', 'Hey Cathy, reset view', 'Hey Cathy, hide']) rec.onResult?.(say(t));
    expect(heard.map((m) => m.action)).toEqual(['assist_options', 'zoom_out', 'reset_view', 'hide_labels']);
  });
});
