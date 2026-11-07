/**
 * Build-guard entry, used only by mock-guard.test.ts. It reaches every engine entry point the app
 * will use, so the test sees what an app build would bundle. It also shows how a wire selector
 * should load the mock wire: a dynamic import behind the flag.
 */

import { scoreAttempt } from '../score/index';
import { engineMode, optimize } from './index';

export async function guardEntry(): Promise<unknown[]> {
  const MockWire = import.meta.env.VITE_ENGINE === 'mock' ? (await import('../wire/mock-source')).MockWireSource : null;
  return [engineMode, optimize, scoreAttempt, MockWire];
}
