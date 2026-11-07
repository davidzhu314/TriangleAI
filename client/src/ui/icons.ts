/**
 * The A1 icon set, inlined so currentColor and the theme reach inside (DESIGN.md: Iconography).
 * Every icon is decorative and sits beside its text label; never use one alone.
 */
import badgePhysics from '../assets/icons/badge-physics.svg?raw';
import badgePlanningOnly from '../assets/icons/badge-planning-only.svg?raw';
import contrastPuff from '../assets/icons/contrast-puff.svg?raw';
import entryFemoral from '../assets/icons/entry-femoral.svg?raw';
import entryRadial from '../assets/icons/entry-radial.svg?raw';
import fluoro from '../assets/icons/fluoro.svg?raw';
import riskForbidden from '../assets/icons/risk-forbidden.svg?raw';
import riskHeavy from '../assets/icons/risk-heavy.svg?raw';
import riskProximity from '../assets/icons/risk-proximity.svg?raw';
import target from '../assets/icons/target.svg?raw';
import noCases from '../assets/empty/no-cases.svg?raw';
import physicsOffline from '../assets/empty/physics-offline.svg?raw';
import { h } from './dom';

const ICONS = {
  'badge-physics': badgePhysics,
  'badge-planning-only': badgePlanningOnly,
  'contrast-puff': contrastPuff,
  'entry-femoral': entryFemoral,
  'entry-radial': entryRadial,
  fluoro,
  'risk-forbidden': riskForbidden,
  'risk-heavy': riskHeavy,
  'risk-proximity': riskProximity,
  target,
} as const;

export type IconName = keyof typeof ICONS;

/** An icon followed by its label. The label is required: at 16 px several icons only read with it. */
export function labelled(name: IconName, label: string | Node, className = ''): HTMLSpanElement {
  const mark = h('span', { class: 'icon', 'aria-hidden': 'true' });
  mark.innerHTML = ICONS[name]; // a file from client/src/assets, built into the bundle, never user input
  return h('span', { class: `with-icon ${className}`.trim() }, mark, typeof label === 'string' ? h('span', {}, label) : label);
}

/** Entry icon by entry id: "fem_*" femoral, "rad_*" radial (case.ts names entries this way). */
export function entryIcon(entryId: string): IconName | null {
  if (entryId.startsWith('fem')) return 'entry-femoral';
  if (entryId.startsWith('rad')) return 'entry-radial';
  return null;
}

const ART = { 'no-cases': noCases, 'physics-offline': physicsOffline } as const;

/** Empty-state art: decorative, no words; the heading and action beside it say what it means. */
export function art(name: keyof typeof ART): HTMLDivElement {
  const el = h('div', { class: 'empty-art', 'aria-hidden': 'true' });
  el.innerHTML = ART[name];
  return el;
}
