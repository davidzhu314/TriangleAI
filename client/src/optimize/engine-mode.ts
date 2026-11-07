/**
 * Which engine this build runs. 'mock' only when the build sets VITE_ENGINE=mock; otherwise 'real'.
 * Vite replaces `import.meta.env.VITE_ENGINE` at build time, so code behind `isMockEngine()` is
 * dropped from a real build, along with the dynamic imports of the mock modules.
 *
 * The UI shows a "mock data" badge whenever engineMode is 'mock'.
 */
export type EngineMode = 'mock' | 'real';

export const engineMode: EngineMode = import.meta.env.VITE_ENGINE === 'mock' ? 'mock' : 'real';

// Each mock module holds its own marker literal in a string the bundle keeps (see
// mock-guard.test.ts). They are deliberately not defined here, because this file ships in real builds.
