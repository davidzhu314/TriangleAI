/**
 * Push-to-talk voice commands: each action with several phrasings, including common mis-hearings.
 * Add new mis-hearings found in the local webcam/mic lab here (team/handoffs explains how).
 *
 * Phrasings are written already normalised: lowercase, no punctuation, digits as words.
 */

export type VoiceAction = 'zoom_in' | 'zoom_out' | 'assist_best_next' | 'assist_options' | 'assist_review';

export const VOICE_COMMANDS: Readonly<Record<VoiceAction, readonly string[]>> = {
  zoom_in: ['zoom in', 'closer', 'move closer', 'get closer', 'zoom inn'],
  zoom_out: ['zoom out', 'wider', 'back out', 'zoom further', 'wide view'],
  assist_best_next: ['best next artery', 'where next', 'which way', 'best path', 'next best'],
  assist_options: ['what are my options', 'show options', 'options', 'show me the paths'],
  assist_review: ['how am i doing', 'what am i doing wrong', 'analyze', 'check my drive', 'any mistakes'],
};

export const VOICE_ACTIONS = Object.keys(VOICE_COMMANDS) as VoiceAction[];

/**
 * Optional wake phrase ("Hey Cathy"), stripped from the start; push-to-talk already gates listening.
 * The names include how speech recognition commonly spells or mis-hears "Cathy". (The app is still named Catherine.)
 */
export const WAKE_LEADS = ['hey', 'a'] as const;
export const WAKE_NAMES = ['cathy', 'kathy', 'cathie', 'kathie', 'cathi', 'kathi', 'katie'] as const;

/** A phrasing must score at least this to match (1 − normalised word edit distance, plus the substring bonus). */
export const MATCH_MIN = 0.75;
/** Added when the phrasing appears as contiguous words in the transcript ("zoom in please"). */
export const SUBSTRING_BONUS = 0.15;
