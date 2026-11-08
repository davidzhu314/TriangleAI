import { describe, expect, it } from 'vitest';
import { GESTURE_HELP, VOICE_HELP } from './help';
import { VOICE_ACTIONS, VOICE_COMMANDS } from './voice/commands';
import { matchCommand } from './voice/match';

describe('voice and gesture help', () => {
  it('every voice action has help, and the phrase shown is one its own phrasings list has', () => {
    for (const a of VOICE_ACTIONS) {
      const help = VOICE_HELP[a];
      expect(help, a).toBeDefined();
      expect(VOICE_COMMANDS[a].includes(help.say.toLowerCase()), `${a}: "${help.say}"`).toBe(true);
    }
  });

  it('saying "Hey Cathy, <phrase shown>" runs that very action', () => {
    for (const a of VOICE_ACTIONS) {
      const m = matchCommand([{ transcript: `Hey Cathy, ${VOICE_HELP[a].say}`, confidence: 0.9 }]);
      expect(m.action, VOICE_HELP[a].say).toBe(a);
    }
  });

  it('gestures have unique ids and say how and what', () => {
    expect(new Set(GESTURE_HELP.map((g) => g.id)).size).toBe(GESTURE_HELP.length);
    for (const g of GESTURE_HELP) {
      expect(g.how.length).toBeGreaterThan(0);
      expect(g.does.length).toBeGreaterThan(0);
    }
  });
});
