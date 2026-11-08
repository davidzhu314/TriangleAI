/**
 * Cathy's wrong-branch warning (G5): the branch AHEAD the tip would take with its current roll, when it
 * isn't the planned one. Computed by the engine only (CLAUDE.md, spec §11): the same §5.3 branch-entry
 * rule the rail wire uses (`chooseBranch`), and the same roll a careful driver would set (`steerRoll`,
 * the autopilot's), so the warning says exactly what pushing on would do.
 *
 * It looks only at the next branch point on the plan, and only while the tip is on the plan and within
 * WARN_AHEAD_M of it. Off the plan, driveAssist's "pull back" line applies instead. A branch whose turn the
 * wire can't take prolapses rather than entering it (rail `step`), so that is not a wrong-branch warning.
 * While the player is already rotating the right way (`rotateControl`, the current rotate input), there is
 * nothing to tell them, so it stays quiet: that is also what keeps a careful drive (the autopilot, which
 * rolls the tip into place as it approaches) free of warnings.
 *
 * Pure: no clock, no randomness, never mutates the model or state (the model's memo cache aside, which
 * never changes a result).
 */

import type { FeedbackLine, LoadedCase } from '../contracts';
import { steerRoll } from '../optimize/steerability';
import { chooseBranch, railEdgeDirection, railEndNode, railHeading, railPathLength, type RailModel, type RailState } from '../wire/rail';
import { Names } from './feedback';
import { feedbackLine } from './templates';

/** How far before a branch point the warning starts, m. Illustrative (DECISIONS.md, "Cathy: warning distance"). */
export const WARN_AHEAD_M = 0.02;

export interface DriveWarning {
  /** The branch point ahead (the node at the end of the tip's current edge). */
  atNode: string;
  /** The edge the plan takes there. */
  plannedEdge: string;
  /** The edge the tip would enter with its current roll. */
  wouldEnter: string;
  /** Arc length from the tip to the branch point, m. */
  distanceM: number;
  /** Which way to roll to enter the planned edge (A = left, D = right); null when no roll enters it. */
  rotate: 'left' | 'right' | null;
}

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** Roll errors smaller than this count as already set (the autopilot's alignment tolerance). */
const ROLL_SET_RAD = 1e-3;

export function driveWarning(model: RailModel, state: RailState, rotateControl = 0): DriveWarning | null {
  if (state.atTarget || state.prolapsed) return null;
  const walked = state.walked;
  if (!walked.every((w, i) => w.edge === model.plan[i])) return null; // off plan: "pull back" instead
  const plannedEdge = model.plan[walked.length];
  if (plannedEdge === undefined) return null; // on the last planned edge: no branch ahead
  const atNode = railEndNode(model, walked);
  if (atNode === model.targetNode) return null;

  const L = railPathLength(model, walked);
  const distanceM = L - state.s;
  if (distanceM > WARN_AHEAD_M) return null;

  const choice = chooseBranch(model, walked, state.rollRad);
  if (!choice || choice.edge === plannedEdge) return null;
  if (choice.turnDeg > model.preset.maxTurnDeg) return null; // it would prolapse, not take the branch

  const last = walked[walked.length - 1]!.edge;
  const cands = (model.adjacency.get(atNode) ?? []).filter((id) => id !== last);
  const want = cands.indexOf(plannedEdge);
  const roll = want < 0 ? null : steerRoll(railHeading(model, walked, L), model.preset.tipAngleDeg, cands.map((id) => railEdgeDirection(model, id, atNode)), want, model.branchEntryDeg);
  let rotate: DriveWarning['rotate'] = null;
  if (roll !== null && model.preset.tipAngleDeg !== 0) {
    const err = wrap(roll - state.rollRad);
    if (Math.abs(err) >= ROLL_SET_RAD) rotate = err > 0 ? 'right' : 'left'; // rotate +1 (D) raises the roll
  }
  if (rotate && Math.sign(rotateControl) === (rotate === 'right' ? 1 : -1)) return null; // already rotating the right way
  return { atNode, plannedEdge, wouldEnter: choice.edge, distanceM, rotate };
}

/** The spoken line for a warning (assist.wrong_branch_ahead, or the no-direction form). */
export function warningLine(w: DriveWarning, c: LoadedCase): FeedbackLine {
  const n = new Names(c);
  const values = { wrong_vessel: n.vesselOfEdge(w.wouldEnter), vessel: n.vesselOfEdge(w.plannedEdge) };
  return w.rotate
    ? feedbackLine('assist.wrong_branch_ahead', { ...values, direction: w.rotate }, 'drive.errors')
    : feedbackLine('assist.wrong_branch_ahead_no_roll', values, 'drive.errors');
}
