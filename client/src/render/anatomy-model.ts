/**
 * The anatomy layer's pure rules (feature/vascular-ui): how a GLB node is sorted into arteries or veins, what its
 * label says, how a model is fitted to the case, and the saved toggle state. No three.js, no DOM, so it is
 * unit-tested and shared with whoever drives the layer (Vaibhav's assistant or voice, after the demo).
 */
import type { Vec3 } from '../contracts';

/**
 * 'context' is the same patient's body around the vessels (context.glb from the case's own scan: nodes "bone" and
 * "heart"). It is background for scale and orientation, not a vessel, and has its own "Body" toggle. The same file
 * may also carry the patient's veins (nodes with extras { kind: "vein", label }): those are 'vein' and, on a context
 * case, follow their own "Veins" toggle (`bodyVeins`).
 */
export type VesselKind = 'artery' | 'vein' | 'context';

/**
 * What the controls set. `visible` is the vascular model as a whole; arteries, veins and labels refine it. `body`
 * is the case's own body context on its own: it shows whatever `visible` says.
 */
export interface AnatomyState {
  visible: boolean;
  arteries: boolean;
  veins: boolean;
  labels: boolean;
  /** The same-patient body context (bone and heart). Off by default. */
  body: boolean;
  /**
   * The same patient's veins from context.glb, on a context case. Off by default. Its own field, not `veins`: that
   * one refines the generic model and defaults on, while the scan's veins start hidden.
   */
  bodyVeins: boolean;
  /** 0..1 */
  opacity: number;
}

export function defaultState(opacity: number): AnatomyState {
  return { visible: false, arteries: true, veins: true, labels: true, body: false, bodyVeins: false, opacity: clamp01(opacity) };
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
    body: bool('body'), // states saved before the Body toggle existed have none: off
    bodyVeins: bool('bodyVeins'), // likewise, before the Veins toggle on context cases
    opacity: typeof o['opacity'] === 'number' ? clamp01(o['opacity']) : fallback.opacity,
  };
}

/**
 * Artery, vein or body context, from the node's `extras.kind` first, then its name: "bone…" and "heart…" are context; "artery…", "a_…", "…_artery" and the usual
 * arterial names; "vein…", "v_…", "…_vein", "vena cava" and "…venous". Null when neither: the node is still drawn
 * with the layer, but no arteries/veins toggle applies to it.
 */
export function classify(name: string, extras?: Record<string, unknown> | null): VesselKind | null {
  const k = extras?.['kind'];
  if (k === 'artery' || k === 'vein' || k === 'context') return k;
  const n = name.toLowerCase().replace(/[\s.-]+/g, '_');
  // The body context's nodes: "bone" (spine, ribs, sternum) and "heart", or names that start with them.
  if (/^(bone|bones|heart)(_|$)/.test(n)) return 'context';
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

/**
 * Whether one classified node shows under a state. On a context case (`context`: the model is the case's own
 * context.glb) only the body follows `body` and the veins follow `bodyVeins`; nothing else in the file is drawn.
 */
export function shows(kind: VesselKind | null, s: AnatomyState, context = false): boolean {
  if (context) return kind === 'context' ? s.body : kind === 'vein' ? s.bodyVeins : false;
  if (kind === 'context') return s.body;
  if (!s.visible) return false;
  if (kind === 'artery') return s.arteries;
  if (kind === 'vein') return s.veins;
  return s.arteries || s.veins;
}

/**
 * The kind of every named node in a GLB, read from its JSON chunk alone (no three.js, no geometry): so the controls
 * can tell whether a case's context.glb has veins before the layer is ever loaded. Empty for anything that isn't a
 * readable GLB.
 */
export function glbNodeKinds(bytes: ArrayBuffer): { name: string; kind: VesselKind | null; label: string | null }[] {
  try {
    if (bytes.byteLength < 20) return [];
    const dv = new DataView(bytes);
    if (dv.getUint32(0, true) !== 0x46546c67 || dv.getUint32(16, true) !== 0x4e4f534a) return []; // "glTF", "JSON"
    const length = dv.getUint32(12, true);
    if (20 + length > bytes.byteLength) return [];
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, length))) as { nodes?: { name?: string; extras?: Record<string, unknown> }[] };
    return (json.nodes ?? []).map((n) => {
      const name = n.name ?? '';
      const label = typeof n.extras?.['label'] === 'string' && n.extras['label'].trim() ? n.extras['label'].trim() : null;
      return { name, kind: classify(name, n.extras ?? null), label };
    });
  } catch {
    return [];
  }
}
