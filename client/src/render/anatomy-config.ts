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
  /**
   * The case's own body context (context.glb, same scan and frame as its vessels.glb): placed exactly with the
   * case's mesh.toWorld, never fitted, and switched by the "Body" toggle. The vascular placeholder is never drawn
   * on such a case.
   */
  context?: boolean;
  /** Shown in the controls under the switches (for an aligned reference model: what it is and how well it fits). */
  note?: string;
  /** Set when the model can't be shown on this case: the reason, shown in the controls; nothing is loaded. */
  unavailable?: string;
}

export const PLACEHOLDER_ANATOMY: AnatomyConfig = { url: placeholderUrl, fit: 'case', placeholder: true };

const IDENTITY: readonly number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/**
 * A reference model's visual alignment to one case (team/requests/to-all-from-gibran-contract-visual-alignment.md):
 * model RAS mm → case RAS mm, p_case = s · R · p_model + t, with R = Rz · Ry · Rx. Render configuration only: never in
 * case.json, LoadedCase or any engine input. The reviewed values are Gibran's (tests/fixtures/engine/vascular-alignment/),
 * copied here so the client bundles them; a test keeps the two identical.
 */
export interface VisualAlignment {
  schema: 'threadsim.visual-alignment/1';
  caseId: string;
  model: string;
  scale: number;
  rotationDeg: [number, number, number];
  translationMm: [number, number, number];
  method: 'landmark-fit' | 'manual';
  landmarks?: Record<string, string[]>;
  /** As recorded by the alignment check: the share of the case's matched centerline points the model covers. */
  recorded?: { inside: number; medianExcessMm: number; rmsMm: number };
}

const ALIGNMENTS: ReadonlyMap<string, VisualAlignment> = new Map(
  Object.values(import.meta.glob<VisualAlignment>('./anatomy-alignment/*.json', { eager: true, import: 'default' })).map((a) => [a.caseId, a]),
);

export function alignmentFor(caseId: string): VisualAlignment | undefined {
  return ALIGNMENTS.get(caseId);
}

/** The alignment as a column-major 4×4 (three.js Matrix4.fromArray), model RAS mm → case RAS mm. */
export function alignmentMatrix(a: Pick<VisualAlignment, 'scale' | 'rotationDeg' | 'translationMm'>): number[] {
  const [x, y, z] = a.rotationDeg.map((d) => (d * Math.PI) / 180) as [number, number, number];
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
  const R = [
    [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
    [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
    [-sy, cy * sx, cy * cx],
  ];
  const s = a.scale;
  const t = a.translationMm;
  return [s * R[0]![0]!, s * R[1]![0]!, s * R[2]![0]!, 0, s * R[0]![1]!, s * R[1]![1]!, s * R[2]![1]!, 0, s * R[0]![2]!, s * R[1]![2]!, s * R[2]![2]!, 0, t[0], t[1], t[2], 1];
}

/** a · b for column-major 4×4 matrices. */
function mul(a: readonly number[], b: readonly number[]): number[] {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r]! += a[k * 4 + r]! * b[c * 4 + k]!;
  return out;
}

/**
 * The app's model on one case. A reference body in RAS mm (`VITE_ANATOMY_FRAME=ras-mm`) is placed with the case's
 * visual alignment, composed under RAS_MM_TO_YUP_M; on a case with none it isn't shown (it would sit far from the case,
 * and fitting it to the case bounds would pass it off as fitted). The placeholder, a case's own body context and a
 * model already in metres Y-up are returned as they are.
 */
export function alignedAnatomy(base: AnatomyConfig, caseId: string): AnatomyConfig {
  if (base.placeholder || base.context || base.fit !== 'none' || base.toWorld !== RAS_MM_TO_YUP_M) return base;
  const a = alignmentFor(caseId);
  if (!a) return { ...base, unavailable: 'No alignment for this case, so the reference body is not shown.' };
  const matched = a.recorded ? ` About ${Math.round(a.recorded.inside * 100)}% of this case's vessels matched.` : '';
  return { ...base, toWorld: mul(RAS_MM_TO_YUP_M, alignmentMatrix(a)), note: `Reference body (BodyParts3D), aligned to this case. Not this patient's anatomy.${matched}` };
}

/** The app's anatomy config: the env-configured model when set, else the placeholder. */
export function anatomyConfig(env: Record<string, string | undefined> = import.meta.env): AnatomyConfig {
  const url = env['VITE_ANATOMY_GLB']?.trim();
  if (!url) return PLACEHOLDER_ANATOMY;
  return { url, fit: 'none', toWorld: env['VITE_ANATOMY_FRAME'] === 'yup-m' ? IDENTITY : RAS_MM_TO_YUP_M, placeholder: false };
}
