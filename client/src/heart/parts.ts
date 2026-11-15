/**
 * The Heart tab's part palette and grouping. The words for each part (name, description, group) come from the GLB's
 * extras, written by tools/heartgen; this file only says which design token colours a mesh and how it is shaded.
 * No three.js here, so the screen can draw the part list's swatches without the 3D code.
 */

export type Tissue = 'muscle' | 'vessel' | 'valve';

export interface PartLook {
  /** A colour token from styles/tokens.css. */
  token: string;
  tissue: Tissue;
}

const LOOKS: Record<string, PartLook> = {
  lv_myocardium: { token: '--color-heart-lv', tissue: 'muscle' },
  rv_wall: { token: '--color-heart-rv', tissue: 'muscle' },
  la: { token: '--color-heart-la', tissue: 'muscle' },
  la_appendage: { token: '--color-heart-la', tissue: 'muscle' },
  ra: { token: '--color-heart-ra', tissue: 'muscle' },
  aorta: { token: '--color-heart-aorta', tissue: 'vessel' },
  aorta_root: { token: '--color-heart-aorta', tissue: 'vessel' },
  pulmonary_trunk: { token: '--color-heart-pulmonary', tissue: 'vessel' },
};

/** Valve tissue is one light colour everywhere, so leaflets stand out against every chamber. */
const VALVE: PartLook = { token: '--color-heart-valve', tissue: 'valve' };
/** A mesh this build does not know keeps the app's neutral scene colour instead of an invented one. */
const UNKNOWN: PartLook = { token: '--color-scene-vessel', tissue: 'muscle' };

export function partLook(meshName: string, group: string): PartLook {
  return LOOKS[meshName] ?? (group === 'valves' ? VALVE : UNKNOWN);
}

/** Group order and headings, as in the GLB's hierarchy. */
export const GROUPS: readonly { id: string; label: string }[] = [
  { id: 'chambers', label: 'Chambers' },
  { id: 'myocardium', label: 'Heart muscle' },
  { id: 'great_vessels', label: 'Great vessels' },
  { id: 'valves', label: 'Valves' },
  { id: 'subvalvular', label: 'Under the valves' },
];

export interface HeartPart {
  /** The mesh's name in the GLB, e.g. lv_myocardium. */
  name: string;
  displayName: string;
  description: string;
  group: string;
  look: PartLook;
}

/** One heart in client/public/hearts/index.json (written by `heartgen publish`). */
export interface HeartEntry {
  id: string;
  title: string;
  source: string;
  license: string;
  triangles: number;
  glb: string;
}

export interface HeartIndex {
  schema: 'heartgen.index/1';
  hearts: HeartEntry[];
}

export const HEARTS_URL = `${import.meta.env.BASE_URL}hearts/`;
