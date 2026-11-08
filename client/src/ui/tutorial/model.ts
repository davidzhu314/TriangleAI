/**
 * The guided tutorial's steps (A8): Plan → Compare → Drive on the lowest-tier case, for a first-time trainee.
 * Pure: each step advances on a real action the screen shows (the screen opened, the route reaching the target,
 * the target reached), never on a timer. The words name only what the screen and the case show; no numbers.
 */
import type { LoadedCase } from '../../contracts';
import { ladderTier } from '../../score';

export type StepId = 'open-case' | 'start-planning' | 'build-route' | 'compare' | 'start-drive' | 'drive' | 'finish';
export type Screen = 'library' | 'brief' | 'plan' | 'compare' | 'drive' | 'results';

export const STEPS: readonly StepId[] = ['open-case', 'start-planning', 'build-route', 'compare', 'start-drive', 'drive', 'finish'];

/** What the tutorial can see: the screen, whether it shows the tutorial case, and two facts the screen shows. */
export interface View {
  screen: Screen;
  onTutorialCase: boolean;
  /** Plan: "Compare routes" is enabled, so the route reaches the target. */
  routeComplete: boolean;
  /** Drive: "Finish drive" is offered, so the wire reached the target. */
  targetReached: boolean;
}

/** Where each step is shown. */
export const STEP_SCREEN: Record<StepId, Screen> = {
  'open-case': 'library',
  'start-planning': 'brief',
  'build-route': 'plan',
  compare: 'plan',
  'start-drive': 'compare',
  drive: 'drive',
  finish: 'drive',
};

/**
 * Advance as far as the view allows. A step never advances on a different case, and a later screen never skips a
 * step that needs the trainee's own action (opening Compare without a complete route goes back to building it).
 */
export function advance(step: StepId | 'done', v: View): StepId | 'done' {
  if (step === 'done' || !v.onTutorialCase) return step;
  let s: StepId | 'done' = step;
  for (let guard = 0; guard < STEPS.length; guard++) {
    const next = once(s, v);
    if (next === s) return s;
    s = next;
  }
  return s;
}

function once(s: StepId | 'done', v: View): StepId | 'done' {
  switch (s) {
    case 'open-case':
      return v.screen === 'brief' || v.screen === 'plan' ? 'start-planning' : s;
    case 'start-planning':
      return v.screen === 'plan' ? 'build-route' : s;
    case 'build-route':
      return v.screen === 'plan' && v.routeComplete ? 'compare' : s;
    case 'compare':
      if (v.screen === 'plan' && !v.routeComplete) return 'build-route';
      return v.screen === 'compare' ? 'start-drive' : s;
    case 'start-drive':
      return v.screen === 'drive' ? 'drive' : s;
    case 'drive':
      return v.screen === 'drive' && v.targetReached ? 'finish' : s;
    case 'finish':
      return v.screen === 'results' ? 'done' : s;
    default:
      return s;
  }
}

/** Whether the note shows now: the step's own screen, on the tutorial case (the Library shows it as a card). */
export function visible(step: StepId | 'done', v: View): step is StepId {
  if (step === 'done') return false;
  if (STEP_SCREEN[step] !== v.screen) return false;
  return step === 'open-case' || v.onTutorialCase;
}

/** The note's words. Only the case title comes in from data; nothing else is a value. */
export function stepText(step: StepId, caseTitle: string): string {
  switch (step) {
    case 'open-case':
      return `New here? Start with “${caseTitle}”. Open it to read the brief.`;
    case 'start-planning':
      return 'The brief shows the target and the fluoro budget. Start planning when you are ready.';
    case 'build-route':
      return 'Choose a target and a wire, then pick branch points from Next step until the route reaches the target.';
    case 'compare':
      return 'The route reaches the target. Compare it with the routes the engine found.';
    case 'start-drive':
      return 'Keep your route or switch to one from the table, then start the drive.';
    case 'drive':
      return 'Hold W to push and S to pull; A and D rotate the tip. Hold Space for fluoro. Drive to the target.';
    case 'finish':
      return 'The wire reached the target. Finish the drive to see your results.';
  }
}

/** The tutorial case: the lowest ladder tier with a case (V6's ladder), lowest id first. Null when none is tiered. */
export function tutorialCase(cases: readonly LoadedCase[]): LoadedCase | null {
  const tiered = cases.map((c) => ({ c, tier: ladderTier(c) })).filter((x): x is { c: LoadedCase; tier: NonNullable<typeof x.tier> } => x.tier !== null);
  tiered.sort((a, b) => a.tier - b.tier || (a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0));
  return tiered[0]?.c ?? null;
}

/** A first-time trainee: no saved attempts and the tutorial never dismissed or finished in this browser. */
export function shouldStart(progressCount: number, dismissed: boolean): boolean {
  return progressCount === 0 && !dismissed;
}
