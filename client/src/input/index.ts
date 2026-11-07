/**
 * Optional hands-free and voice input for Catherine. Import from here.
 *
 * Nothing in the app imports this yet, and nothing here opens the camera or microphone: the caller
 * feeds HandFrames (from MediaPipe, once David adds it) and calls createBrowserRecognizer only after
 * the user turns voice on. See ./README.md for the hookup guide.
 */

export { createGestureMachine, type GestureMachine } from './hands/machine';
export { mergeControl } from './hands/to-control';
export { toUserView } from './hands/pose';
export * as HAND_CONSTANTS from './hands/constants';
export type { GestureConfig, GestureOutput, HandFrame, HandObservation, HandStatus, Landmark } from './hands/types';
export { VOICE_ACTIONS, VOICE_COMMANDS, type VoiceAction } from './voice/commands';
export { matchCommand, type SpeechAlternative, type VoiceMatch } from './voice/match';
export { createPushToTalk, type PttState, type PushToTalk, type Recognizer } from './voice/ptt';
export { createBrowserRecognizer } from './voice/speech';
