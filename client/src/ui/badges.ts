/** Case badges shared by the Library and the Case brief. Every badge carries its words, never colour alone. */
import type { CaseDifficulty, CaseResult, LoadedCase } from '../contracts';
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

/** Stars come only from a real CaseResult. With none, say so in words: never fake stars. */
export function stars(result: CaseResult | undefined): HTMLSpanElement {
  if (!result) return h('span', { class: 'muted' }, 'No stars yet');
  return h('span', { title: 'Stars earned on your best attempt (CaseResult.stars)' }, h('span', { class: 'num' }, String(result.stars)), ' of 3 stars');
}
