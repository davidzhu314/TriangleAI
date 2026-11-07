/**
 * Planned-route autopilot for the rail wire: the control a careful player would give to drive the
 * planned path. Before each branch point it rolls the tip toward the planned edge, then pushes. It
 * waits at the branch until the roll is set, and pulls back if the wire went the wrong way.
 *
 * Used by the tests ("rail reaches every frontier target") and by RailWireSource's `autoDrive`
 * option for demos. It only produces ControlInput; the rail model still decides what happens.
 */

import type { ControlInput } from '../contracts';
import {
  RAIL_ROLL_RAD_PER_S,
  RAIL_SPEED_MPS,
  railEdgeDirection,
  railEndNode,
  railHeading,
  railPathLength,
  rollFrame,
  type RailModel,
  type RailState,
} from './rail';

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp1 = (x: number) => Math.max(-1, Math.min(1, x));

/** The roll that points the preset's tip most nearly along `dir` from heading t. */
export function bestRoll(t: readonly number[], dir: readonly number[]): number {
  const { n0, b0 } = rollFrame([t[0]!, t[1]!, t[2]!]);
  return Math.atan2(dir[0]! * b0[0] + dir[1]! * b0[1] + dir[2]! * b0[2], dir[0]! * n0[0] + dir[1]! * n0[1] + dir[2]! * n0[2]);
}

export function railAutopilot(model: RailModel, state: RailState, dt: number, fluoro = false): ControlInput {
  const idle: ControlInput = { push: 0, rotate: 0, fluoro, contrastPuff: false };
  if (state.atTarget) return idle;
  const walked = state.walked;
  const onPlan = walked.every((w, i) => w.edge === model.plan[i]);
  if (!onPlan || state.prolapsed) return { ...idle, push: -1 };

  const next = model.plan[walked.length];
  const L = railPathLength(model, walked);
  if (next === undefined) return { ...idle, push: 1 };

  const node = railEndNode(model, walked);
  const target = bestRoll(railHeading(model, walked, L), railEdgeDirection(model, next, node));
  const err = model.preset.tipAngleDeg === 0 ? 0 : wrap(target - state.rollRad);
  const rotate = clamp1(err / (RAIL_ROLL_RAD_PER_S * dt));
  const aligned = Math.abs(err) < 1e-3;
  // don't reach the branch point before the roll is set
  const gap = L - state.s;
  const push = aligned ? 1 : Math.max(0, Math.min(1, (gap - 1e-6) / (RAIL_SPEED_MPS * dt)));
  return { push, rotate, fluoro, contrastPuff: false };
}
