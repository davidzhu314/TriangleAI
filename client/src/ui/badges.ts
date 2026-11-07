/** Case badges shared by the Library and the Case brief. Every badge carries its words, never colour alone. */
import type { CaseDifficulty, LoadedCase, Stars } from '../contracts';
import { h } from './dom';
import { labelled } from './icons';

const DIFFICULTY: Record<CaseDifficulty, string> = { beginner: 'Beginner', intermediate: 'Intermediate', expert: 'Expert' };

export function difficultyPill(c: LoadedCase): HTMLSpanElement {
  return c.difficulty
    ? h('span', { class: 'pill pill-neutral' }, DIFFICULTY[c.difficulty])
    : h('span', { class: 'pill pill-neutral', title: 'This case does not set a difficulty' }, 'Difficulty —');
}

/** "Physics" only for a case physics can run; otherwise "Planning only" (LoadedCase.planningOnly). */
export function modeBadge(c: LoadedCase): HTMLSpanElement {
  return c.planningOnly
    ? labelled('badge-planning-only', 'Planning only', 'badge')
    : labelled('badge-physics', 'Physics', 'badge');
}

/** Best stars from saved attempts (V6 bestStars). Never attempted: say so in words, never fake stars. */
export function stars(best: Stars | undefined): HTMLSpanElement {
  if (best === undefined) return h('span', { class: 'muted' }, 'No stars yet');
  return h('span', { title: 'Best stars over your attempts' }, h('span', { class: 'num' }, String(best)), ' of 3 stars');
}
