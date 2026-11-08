/**
 * The anatomy layer's pure rules (feature/vascular-ui): how a GLB node is sorted into arteries or veins, what its
 * label says, how a model is fitted to the case, and the saved toggle state. No three.js, no DOM, so it is
 * unit-tested and shared with whoever drives the layer (Vaibhav's assistant or voice, after the demo).
 */
import type { Vec3 } from '../contracts';

export type VesselKind = 'artery' | 'vein';

/** What the controls set. `visible` is the layer as a whole; the rest refine it. */
export interface AnatomyState {
  visible: boolean;
  arteries: boolean;
  veins: boolean;
  labels: boolean;
  /** 0..1 */
  opacity: number;
}

export function defaultState(opacity: number): AnatomyState {
  return { visible: false, arteries: true, veins: true, labels: true, opacity: clamp01(opacity) };
}

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** A saved state from storage, with any bad or missing field replaced by the default. */
export function readState(raw: unknown, fallback: AnatomyState): AnatomyState {
  if (!raw || typeof raw !== 'object') return { ...fallback };
  const o = raw as Record<string, unknown>;
  const bool = (k: keyof AnatomyState): boolean => (typeof o[k] === 'boolean' ? (o[k] as boolean) : (fallback[k] as boolean));
  return {
    visible: bool('visible'),
    arteries: bool('arteries'),
    veins: bool('veins'),
    labels: bool('labels'),
    opacity: typeof o['opacity'] === 'number' ? clamp01(o['opacity']) : fallback.opacity,
  };
}

/**
 * Artery or vein, from the node's `extras.kind` first, then its name: "artery…", "a_…", "…_artery" and the usual
 * arterial names; "vein…", "v_…", "…_vein", "vena cava" and "…venous". Null when neither: the node is still drawn
 * with the layer, but no arteries/veins toggle applies to it.
 */
export function classify(name: string, extras?: Record<string, unknown> | null): VesselKind | null {
  const k = extras?.['kind'];
  if (k === 'artery' || k === 'vein') return k;
  const n = name.toLowerCase().replace(/[\s.-]+/g, '_');
  if (/(^|_)(vein|veins|vena|venous|v)(_|$)|^vein|_vein$|vena_cava|svc|ivc/.test(n)) return 'vein';
  if (/(^|_)(artery|arteries|arterial|a)(_|$)|^artery|_artery$|aorta|aortic|carotid|subclavian|brachiocephalic_trunk|iliac|femoral_a/.test(n)) return 'artery';
  return null;
}

/** The label: `extras.label` when the model gives one, else the node name made readable. */
export function labelFor(name: string, extras?: Record<string, unknown> | null): string {
  const given = extras?.['label'];
  if (typeof given === 'string' && given.trim()) return given.trim();
  const words = name
    .replace(/^(artery|vein|a|v)[_\s-]+/i, '')
    .replace(/[_\s-]+/g, ' ')
    .trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : name;
}

/**
 * Fit a model's box into a target (the case): one uniform scale so the largest extents match, then the centres
 * meet. For the placeholder, which has no shared frame with the case; a real anatomical model is placed by its
 * own transform instead.
 */
export function fitToBox(src: { min: Vec3; max: Vec3 }, target: { center: Vec3; size: number }): { scale: number; offset: Vec3 } {
  const ext = Math.max(src.max[0] - src.min[0], src.max[1] - src.min[1], src.max[2] - src.min[2]);
  const scale = ext > 0 ? target.size / ext : 1;
  const c: Vec3 = [(src.min[0] + src.max[0]) / 2, (src.min[1] + src.max[1]) / 2, (src.min[2] + src.max[2]) / 2];
  return { scale, offset: [target.center[0] - c[0] * scale, target.center[1] - c[1] * scale, target.center[2] - c[2] * scale] };
}

/** Whether one classified node shows under a state. */
export function shows(kind: VesselKind | null, s: AnatomyState): boolean {
  if (!s.visible) return false;
  if (kind === 'artery') return s.arteries;
  if (kind === 'vein') return s.veins;
  return s.arteries || s.veins;
}
