/**
 * How close the tip must point to a branch to enter it (spec §5.3), per case difficulty. DECISIONS.md,
 * "Branch entry 35° on beginner cases": a real soft tip flexes and finds an opening it is roughly aimed at, and at 25°
 * low-tort's brachiocephalic trunk took about 21° of 360° of twist with Soft angled (testers called it impossible).
 * Beginner cases forgive more; intermediate and expert keep the spec's 25°. Illustrative (rail.branch_entry).
 */

import type { CaseDifficulty } from '../contracts';

/** Spec §5.3: a branch is entered when the tip points within this of it (intermediate and expert cases). */
export const BRANCH_ENTRY_DEG = 25;
/** The same on beginner cases. */
export const BRANCH_ENTRY_BEGINNER_DEG = 35;

export function branchEntryDeg(difficulty: CaseDifficulty | undefined): number {
  return difficulty === 'beginner' ? BRANCH_ENTRY_BEGINNER_DEG : BRANCH_ENTRY_DEG;
}
