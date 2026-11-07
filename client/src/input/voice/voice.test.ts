import { afterEach, describe, expect, it } from 'vitest';
import { VOICE_ACTIONS, VOICE_COMMANDS, WAKE_LEADS, WAKE_NAMES } from './commands';
import { matchCommand, normalize, stripWake, type SpeechAlternative, type VoiceMatch } from './match';
import { createPushToTalk, type Recognizer } from './ptt';
import { createBrowserRecognizer } from './speech';

const say = (...transcripts: string[]): SpeechAlternative[] => transcripts.map((transcript, i) => ({ transcript, confidence: 0.9 - i * 0.1 }));

describe('matchCommand', () => {
  it('matches every phrasing, with and without each wake variant', () => {
    const wakes = ['', ...WAKE_NAMES.map((n) => `${n} `), ...WAKE_LEADS.flatMap((l) => WAKE_NAMES.map((n) => `${l} ${n} `))];
    for (const action of VOICE_ACTIONS) {
      for (const p of VOICE_COMMANDS[action]) {
        for (const w of wakes) expect(matchCommand(say(`${w}${p}`)).action, `"${w}${p}"`).toBe(action);
      }
    }
  });

  it('handles mis-hearings, extra words and punctuation', () => {
    expect(matchCommand(say('zoom inn')).action).toBe('zoom_in');
    expect(matchCommand(say('Zoom in, please!')).action).toBe('zoom_in');
    expect(matchCommand(say('Hey Cathy, how am I doing?')).action).toBe('assist_review');
    expect(matchCommand(say('Hey Kathy zoom in')).action).toBe('zoom_in'); // the recogniser may spell it with a K
    expect(matchCommand(say("What's the best next artery")).action).toBe('assist_best_next');
  });

  it('"zoom out" never matches zoom_in', () => {
    for (const t of ['zoom out', 'hey cathy zoom out', 'zoom out please']) expect(matchCommand(say(t)).action).toBe('zoom_out');
  });

  it('nonsense returns null, and reports what was heard', () => {
    expect(matchCommand(say('banana bread recipe'))).toEqual({ action: null, heard: 'banana bread recipe' });
    expect(matchCommand([])).toEqual({ action: null, heard: '' });
  });

  it('falls back to a lower-ranked alternative when the top one fails', () => {
    const m = matchCommand(say('zoo min the', 'zoom in'));
    expect(m).toMatchObject({ action: 'zoom_in', heard: 'zoom in' });
  });

  it('normalises digits and strips the wake phrase', () => {
    expect(normalize('Show 2 options!')).toEqual(['show', 'two', 'options']);
    expect(stripWake(['hey', 'cathy', 'zoom', 'in'])).toEqual(['zoom', 'in']);
    expect(stripWake(['hey', 'catherine', 'zoom', 'in'])).toEqual(['hey', 'catherine', 'zoom', 'in']); // the old wake word is no longer stripped
    expect(stripWake(['hey', 'zoom', 'in'])).toEqual(['hey', 'zoom', 'in']);
  });
});

/** A fake recogniser: the test decides when results and the session end arrive. */
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
  };
  return r;
}

describe('push-to-talk', () => {
  it('listens only between press and the end of that session', () => {
    const rec = fakeRecognizer();
    const heard: VoiceMatch[] = [];
    const ptt = createPushToTalk(rec, (m) => heard.push(m));
    rec.onResult?.(say('zoom in')); // before any press: no handler bound yet
    expect(heard).toHaveLength(0);
    ptt.press();
    expect(ptt.state).toBe('listening');
    expect(rec.started).toBe(1);
    ptt.release();
    expect(ptt.state).toBe('stopping');
    rec.onResult?.(say('zoom in')); // the final result arrives after stop(): still this press
    rec.onEnd?.();
    expect(ptt.state).toBe('idle');
    rec.onResult?.(say('zoom out')); // after the session ended: ignored
    expect(heard.map((m) => m.action)).toEqual(['zoom_in']);
  });

  it('ignores a late result from an older session', () => {
    const rec = fakeRecognizer();
    const heard: VoiceMatch[] = [];
    const ptt = createPushToTalk(rec, (m) => heard.push(m));
    ptt.press();
    const old = rec.onResult;
    ptt.release();
    rec.onEnd?.();
    ptt.press();
    old?.(say('zoom out'));
    rec.onResult?.(say('how am i doing'));
    expect(heard.map((m) => m.action)).toEqual(['assist_review']);
  });

  it('does nothing without speech support, and a second press while listening is ignored', () => {
    const none = fakeRecognizer(false);
    const p1 = createPushToTalk(none, () => undefined);
    p1.press();
    expect([p1.state, none.started]).toEqual(['idle', 0]);
    const rec = fakeRecognizer();
    const p2 = createPushToTalk(rec, () => undefined);
    p2.press();
    p2.press();
    expect(rec.started).toBe(1);
    p2.release();
    p2.release();
    expect(rec.stopped).toBe(1);
  });
});

describe('createBrowserRecognizer', () => {
  const g = globalThis as { window?: unknown };
  const saved = g.window;
  afterEach(() => {
    g.window = saved;
  });

  it('is unsupported, and never throws, without the Web Speech API', () => {
    g.window = undefined;
    const r = createBrowserRecognizer();
    expect(r.isSupported).toBe(false);
    expect(() => {
      r.start();
      r.stop();
    }).not.toThrow();
  });

  it('configures one-shot, final-only, five alternatives, en-US, and forwards results', () => {
    const made: Record<string, unknown>[] = [];
    class FakeSR {
      continuous = true;
      interimResults = true;
      maxAlternatives = 1;
      lang = '';
      onresult: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      constructor() {
        made.push(this as unknown as Record<string, unknown>);
      }
      start() {
        throw new Error('already started');
      }
      stop() {}
    }
    g.window = { webkitSpeechRecognition: FakeSR };
    const r = createBrowserRecognizer();
    expect(r.isSupported).toBe(true);
    expect(made[0]).toMatchObject({ continuous: false, interimResults: false, maxAlternatives: 5, lang: 'en-US' });
    expect(() => r.start()).not.toThrow();
    const got: SpeechAlternative[][] = [];
    r.onResult = (a) => got.push(a);
    (made[0]!['onresult'] as (e: unknown) => void)({ results: [[{ transcript: 'zoom in', confidence: 0.8 }, { transcript: 'zoom inn', confidence: 0.1 }]] });
    expect(got).toEqual([[{ transcript: 'zoom in', confidence: 0.8 }, { transcript: 'zoom inn', confidence: 0.1 }]]);
    const errors: string[] = [];
    r.onError = (code) => errors.push(code);
    (made[0]!['onerror'] as (e: unknown) => void)({ error: 'not-allowed' });
    expect(errors).toEqual(['not-allowed']);
  });
});
