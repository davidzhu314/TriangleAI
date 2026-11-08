/**
 * Voice commands: each action with several phrasings, including common mis-hearings. Voice is always
 * listening once the player turns it on, and a command runs only after the wake phrase "Hey Cathy"
 * (./wake). There is no push-to-talk (DECISIONS.md, "Voice: always listening, wake word only").
 * Add new mis-hearings found in the local webcam/mic lab here (team/handoffs explains how).
 *
 * Phrasings are written already normalised: lowercase, no punctuation, digits as words.
 */

export type VoiceAction =
  | 'zoom_in'
  | 'zoom_out'
  | 'reset_view'
  | 'hide_labels'
  | 'show_labels'
  | 'assist_best_next'
  | 'assist_options'
  | 'assist_review'
  | 'undo';

export const VOICE_COMMANDS: Readonly<Record<VoiceAction, readonly string[]>> = {
  zoom_in: ['zoom in', 'closer', 'move closer', 'get closer', 'zoom inn'],
  zoom_out: ['zoom out', 'wider', 'back out', 'zoom further', 'wide view'],
  /** Put the 3D or flat view back where it opened, like the Reset view button (undoes zoom, pan and turns). */
  reset_view: ['reset view', 'reset the view', 'reset camera', 'reset the camera', 'recenter', 'recenter the view', 'center the view', 'reset few', 'recent view'],
  /** Hide the vessel names (the anatomy layer's labels), like unticking Labels. */
  hide_labels: ['hide', 'hide labels', 'hide the labels', 'hide names', 'hide the names', 'hide artery names', 'hide the artery names', 'labels off', 'names off'],
  /** Show them again. */
  show_labels: ['show labels', 'show the labels', 'show names', 'show the names', 'show artery names', 'show the artery names', 'labels on', 'names on', 'unhide'],
  assist_best_next: ['best next artery', 'where next', 'which way', 'best path', 'next best'],
  assist_options: ['what are my options', 'show options', 'options', 'show me the paths'],
  assist_review: ['how am i doing', 'what am i doing wrong', 'analyze', 'check my drive', 'any mistakes'],
  /** Undo the last step: on Plan, remove the last branch added to the route. */
  undo: ['undo', 'undo that', 'undo last step', 'undo the last step', 'go back a step', 'take that back', 'remove the last step', 'undue'],
};

export const VOICE_ACTIONS = Object.keys(VOICE_COMMANDS) as VoiceAction[];

/**
 * The wake phrase ("Hey Cathy"): a command runs only after it, and it is stripped before matching.
 * The names include how speech recognition commonly spells or mis-hears "Cathy". (The app is still named Catherine.)
 */
export const WAKE_LEADS = ['hey', 'a'] as const;
export const WAKE_NAMES = ['cathy', 'kathy', 'cathie', 'kathie', 'cathi', 'kathi', 'katie'] as const;

/** A phrasing must score at least this to match (1 − normalised word edit distance, plus the substring bonus). */
export const MATCH_MIN = 0.75;
/** Added when the phrasing appears as contiguous words in the transcript ("zoom in please"). */
export const SUBSTRING_BONUS = 0.15;
