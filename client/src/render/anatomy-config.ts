/**
 * Which anatomical GLB the layer loads, and how it sits in the case's frame.
 *
 * - Until David delivers the anatomical GLB, the layer loads the placeholder in client/src/assets/anatomy/. It has
 *   no shared frame with any case, so it is fitted into the case's bounds (`fit: 'case'`) and marked as a
 *   placeholder in the controls.
 * - The real model is set with Vite env variables, no code change:
 *     VITE_ANATOMY_GLB=/anatomy/vascular.glb   the URL the app fetches (for example from client/public/)
 *     VITE_ANATOMY_FRAME=ras-mm | yup-m          its coordinates: RAS millimetres like vessels.glb (default), or
 *                                                already metres Y-up
 *   It is then placed with the same transform the case mesh uses (RAS_MM_TO_YUP_M), not fitted.
 * - A screen may also pass its own config to createDualView, for example a per-case model later.
 */
import { RAS_MM_TO_YUP_M } from '../contracts';
import placeholderUrl from '../assets/anatomy/placeholder-vascular.glb?url';

export interface AnatomyConfig {
  /** URL of the GLB. */
  url: string;
  /** 'case': scale and centre into the case's bounds (the placeholder). 'none': place with toWorld. */
  fit: 'case' | 'none';
  /** Column-major 4×4 from file coordinates to metres Y-up, used when fit is 'none'. Identity when omitted. */
  toWorld?: readonly number[];
  /** Marked in the controls: "Placeholder model". */
  placeholder: boolean;
}

export const PLACEHOLDER_ANATOMY: AnatomyConfig = { url: placeholderUrl, fit: 'case', placeholder: true };

const IDENTITY: readonly number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** The app's anatomy config: the env-configured model when set, else the placeholder. */
export function anatomyConfig(env: Record<string, string | undefined> = import.meta.env): AnatomyConfig {
  const url = env['VITE_ANATOMY_GLB']?.trim();
  if (!url) return PLACEHOLDER_ANATOMY;
  return { url, fit: 'none', toWorld: env['VITE_ANATOMY_FRAME'] === 'yup-m' ? IDENTITY : RAS_MM_TO_YUP_M, placeholder: false };
}
