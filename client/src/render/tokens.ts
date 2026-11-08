/**
 * Reading design tokens at run time, for the parts drawn in code (the three.js scene and the AR panel). No three.js
 * here, so screens can read tokens without loading the 3D code.
 */

/** Fired on window when the app's theme choice changes (Settings), as well as the system's own change. */
export const THEME_EVENT = 'threadsim:theme';

/** A token from the page: colours as hex, numbers as numbers, durations in milliseconds. */
export function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
export const tokenNumber = (name: string): number => Number.parseFloat(token(name)) || 0;
export const tokenMs = (name: string): number => {
  const v = token(name);
  return v.endsWith('ms') ? Number.parseFloat(v) : Number.parseFloat(v) * 1000;
};

/** Whether this browser can draw WebGL at all; views fall back to the 2D front drawing when not. */
export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}
