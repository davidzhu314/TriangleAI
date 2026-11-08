import { describe, expect, it } from 'vitest';
import { createSpeaker, pickVoice, spokenText, type Synth, type SynthUtterance, type SynthVoice } from './speaker';

const voices: SynthVoice[] = [
  { name: 'Google US English', lang: 'en-US', localService: false, default: true },
  { name: 'Daniel', lang: 'en-GB', localService: true },
  { name: 'Samantha', lang: 'en-US', localService: true },
];

function fakeSynth(v: SynthVoice[] = voices): Synth & { said: SynthUtterance[]; cancels: number } {
  const s = {
    said: [] as SynthUtterance[],
    cancels: 0,
    speak: (u: SynthUtterance) => void s.said.push(u),
    cancel: () => void s.cancels++,
    getVoices: () => v,
  };
  return s;
}
const makeUtterance = (text: string): SynthUtterance => ({ text, voice: null, lang: '', rate: 1, pitch: 1 });

describe('pickVoice', () => {
  it('prefers an on-device voice in the language, then any on-device English one, never a network voice', () => {
    expect(pickVoice(voices)?.name).toBe('Samantha');
    expect(pickVoice(voices.filter((v) => v.name !== 'Samantha'))?.name).toBe('Daniel');
    expect(pickVoice(voices.filter((v) => !v.localService))).toBeNull();
    expect(pickVoice([])).toBeNull();
  });
});

describe('spokenText', () => {
  it('tidies the line for the ear', () => {
    expect(spokenText('Take the “Brachiocephalic trunk” → RCCA · 12 mm, 26.5 cm, 40°, 80%')).toBe('Take the Brachiocephalic trunk, then RCCA, 12 millimetres, 26.5 centimetres, 40 degrees, 80 percent');
    expect(spokenText('   ')).toBe('');
  });
});

describe('createSpeaker', () => {
  it('says each line once, cutting off the one before', () => {
    const synth = fakeSynth();
    const sp = createSpeaker({ synth, makeUtterance });
    expect(sp.isSupported).toBe(true);
    sp.say('Rotate right.');
    sp.say('Keep going.');
    expect(synth.said.map((u) => u.text)).toEqual(['Rotate right.', 'Keep going.']);
    expect(synth.cancels).toBe(2);
    expect(synth.said[0]!.voice?.name).toBe('Samantha');
    expect(synth.said[0]!.lang).toBe('en-US');
  });

  it('empty text only stops; stop cancels', () => {
    const synth = fakeSynth();
    const sp = createSpeaker({ synth, makeUtterance });
    sp.say('');
    sp.stop();
    expect(synth.said).toEqual([]);
    expect(synth.cancels).toBe(2);
  });

  it('is silent without synthesis, and never throws when the browser does', () => {
    const none = createSpeaker({ synth: null, makeUtterance });
    expect(none.isSupported).toBe(false);
    expect(() => none.say('Hello.')).not.toThrow();
    const broken: Synth = {
      speak: () => {
        throw new Error('blocked');
      },
      cancel: () => {
        throw new Error('blocked');
      },
      getVoices: () => [],
    };
    expect(() => createSpeaker({ synth: broken, makeUtterance }).say('Hello.')).not.toThrow();
  });
});
