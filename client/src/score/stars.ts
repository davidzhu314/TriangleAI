/**
 * Stars (spec §6.3) and the radiation budget (§6.5). Pure, so V6 progression can reuse them.
 * DECISIONS.md, "Stars and radiation budget as implemented".
 */

import type { Stars } from '../contracts';
import { BUDGET_STAR_COST, STARS_THREE, STARS_TWO } from './constants';

/** 0 if the target was not reached; else 3 for both ≥ 85, 2 for plan ≥ 70 and drive ≥ 60, else 1. */
export function starsFor(reachedTarget: boolean, planScore: number, driveScore: number): Stars {
  if (!reachedTarget) return 0;
  if (planScore >= STARS_THREE.plan && driveScore >= STARS_THREE.drive) return 3;
  if (planScore >= STARS_TWO.plan && driveScore >= STARS_TWO.drive) return 2;
  return 1;
}

export interface BudgetResult {
  stars: Stars;
  /** Fluoro seconds over the allowance; 0 within it or with no allowance. */
  overS: number;
}

/** Over the allowance costs BUDGET_STAR_COST stars, never below 1 when the target was reached. */
export function applyFluoroBudget(stars: Stars, reachedTarget: boolean, fluoroS: number, budgetS: number | undefined): BudgetResult {
  const overS = budgetS === undefined ? 0 : Math.max(0, fluoroS - budgetS);
  if (overS <= 0 || !reachedTarget) return { stars, overS };
  return { stars: Math.max(1, stars - BUDGET_STAR_COST) as Stars, overS };
}
