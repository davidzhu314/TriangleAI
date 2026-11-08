/**
 * Optional hands-free and voice input for Catherine. Import from here.
 *
 * Only the screens (client/src/ui/) import this, and nothing here opens the camera or microphone: the
 * caller feeds HandFrames (from MediaPipe) and calls createBrowserRecognizer only after the user turns
 * voice on. See ./README.md for the hookup guide.
 */

export { createGestureMachine, createHandMachine, type GestureMachine, type HandMachine } from './hands/machine';
export { mergeControl } from './hands/to-control';
export { toUserView } from './hands/pose';
export * as HAND_CONSTANTS from './hands/constants';
export type { GestureConfig, GestureOutput, HandFrame, HandObservation, HandOutput, HandStatus, Landmark } from './hands/types';
export { VOICE_ACTIONS, VOICE_COMMANDS, type VoiceAction } from './voice/commands';
export { matchCommand, type SpeechAlternative, type VoiceMatch } from './voice/match';
export type { Recognizer } from './voice/recognizer';
export { createBrowserRecognizer } from './voice/speech';
export { createWakeListener, FATAL_SPEECH_ERRORS, startsWithWake, type WakeListener, type WakeState } from './voice/wake';
