import { describe, expect, it } from 'vitest';
import type { VoiceAction } from '../../input';
import { typedQuestion } from './index';

const ALL: VoiceAction[] = ['assist_check', 'assist_best_next', 'assist_options', 'assist_review'];

describe("Cathy's box: typed questions the voice matcher misses", () => {
  it.each([
    ['where should I go next', 'assist_best_next'],
    ['Which branch now?', 'assist_best_next'],
    ['am I on the right path here', 'assist_check'],
    ['is this correct?', 'assist_check'],
    ['what are the other routes', 'assist_options'],
    ['how am I doing so far', 'assist_review'],
    ['any mistakes?', 'assist_review'],
  ] as const)('“%s” → %s', (text, action) => {
    expect(typedQuestion(text, ALL)).toBe(action);
  });

  it('answers only what the screen offers, and nothing for an unrelated question', () => {
    expect(typedQuestion('what are my options', ['assist_check', 'assist_best_next'])).toBeNull();
    expect(typedQuestion('what is the weather', ALL)).toBeNull();
  });
});
