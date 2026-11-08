/**
 * Plain-language help for the voice commands and hand gestures, for screens to show (the Drive controls card).
 * It lives here, next to the commands and the gesture machine, so the help can't drift from what they do:
 * a test checks that every phrase shown is one the matcher accepts for its action.
 */

import type { VoiceAction } from './voice/commands';

export interface VoiceHelp {
  /** What to say after "Hey Cathy", exactly one of the action's phrasings. */
  say: string;
  /** What it does, in a few words. */
  does: string;
}

/** One entry per voice action; adding an action without help fails to compile. */
export const VOICE_HELP: Readonly<Record<VoiceAction, VoiceHelp>> = {
  zoom_in: { say: 'zoom in', does: 'Zoom the view in' },
  zoom_out: { say: 'zoom out', does: 'Zoom the view out' },
  reset_view: { say: 'reset view', does: 'Put the view back where it opened' },
  hide_labels: { say: 'hide labels', does: 'Hide the vessel names' },
  show_labels: { say: 'show labels', does: 'Show the vessel names again' },
  assist_best_next: { say: 'best next artery', does: 'Where to go next' },
  assist_options: { say: 'what are my options', does: 'The ways on from here' },
  assist_review: { say: 'how am I doing', does: 'How the drive is going' },
  assist_check: { say: 'am I on the right path', does: 'Whether you are on the plan, or about to leave it' },
  undo: { say: 'undo', does: 'Remove the last step of the route' },
};

export interface GestureHelp {
  id: string;
  name: string;
  /** How to make it. */
  how: string;
  /** What it does. */
  does: string;
  /** Where it works. */
  where: 'drive' | 'plan' | 'any';
}

/** The gestures, in the order a trainee learns them (hands/machine.ts, hands/constants.ts). */
export const GESTURE_HELP: readonly GestureHelp[] = [
  { id: 'gun', name: 'Gun', how: 'Index and middle together, thumb up, ring and pinky folded', does: 'Takes hold of the wire', where: 'drive' },
  { id: 'push', name: 'Push', how: 'In the gun, fingers straight', does: 'Pushes the wire in', where: 'drive' },
  { id: 'hold', name: 'Hold', how: 'In the gun, fingers half curled', does: 'Holds the wire still', where: 'drive' },
  { id: 'pull', name: 'Pull', how: 'In the gun, fingers curled', does: 'Pulls the wire back', where: 'drive' },
  { id: 'rotate', name: 'Rotate', how: 'In the gun, twist the hand', does: 'Rolls the wire tip', where: 'drive' },
  { id: 'pan', name: 'Pan', how: 'Thumb out, index and middle straight and spread wide in a V, ring and pinky folded; move the hand', does: 'Moves and turns the view', where: 'any' },
  { id: 'two-hands', name: 'Two hands', how: 'One hand in the gun, the other panning', does: 'Drive and move the view at once', where: 'any' },
  { id: 'point', name: 'Point', how: 'Index out, the other fingers folded', does: 'Moves the pointer', where: 'plan' },
  { id: 'pinch', name: 'Pinch', how: 'While pointing, touch thumb to index tip', does: 'Picks the branch under the pointer', where: 'plan' },
];
