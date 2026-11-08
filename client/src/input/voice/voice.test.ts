import { afterEach, describe, expect, it } from 'vitest';
import { VOICE_ACTIONS, VOICE_COMMANDS, WAKE_LEADS, WAKE_NAMES } from './commands';
import { matchCommand, normalize, stripWake, type SpeechAlternative, type VoiceMatch } from './match';
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
      abort() {}
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
