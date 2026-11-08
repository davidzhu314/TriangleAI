/**
 * A scripted driver for the chain simulation (physics-chain.ts), for tests and probes only: it shows that a planned
 * route can be driven with push, pull and roll alone, the controls a player has. It is a fixed rule set, not an AI
 * model, and it computes no route, measure or score: it follows the optimizer's planned path.
 *
 * Rules, each step:
 * - Within JUNCTION_AHEAD_M of a junction on the plan, if the shaped tip (its roll, in the frame square to the shaft)
 *   does not point toward the planned branch, stop and roll toward it (the tip lags the hub, so it waits for the tip);
 *   give up aiming after AIM_GIVE_UP_S and push anyway.
 * - Off the plan counts only once the simulation flags a wrong branch (the tip outside every planned vessel).
 * - If the tip went into a branch off the plan, pull back until it is on the plan again, then try an eighth of a turn more (alternating sides, widening).
 * - If pushing has made no progress for STUCK_S, pull back a little and try an eighth of a turn more.
 * - Otherwise push.
 */
import type { Vec3 } from '../contracts';
import { shapedTipAim, stepChain, type ChainControl, type ChainModel, type ChainState, type ChainStepResult } from './physics-chain';

/** Aim error at which the driver rolls instead of pushing, radians. */
const AIM_RAD = 0.5;
const STUCK_S = 1.5;
/** How far ahead of the tip a planned junction makes the driver aim, metres. */
const JUNCTION_AHEAD_M = 0.01;
/** Longest the driver rolls to aim at one junction before it pushes anyway, seconds. */
const AIM_GIVE_UP_S = 4;
const BACK_M = 0.012;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];

/** The point at arc `s` along the model's planned path. */
export function planPointAt(model: ChainModel, s: number): Vec3 {
  const P = model.planPoints;
  const A = model.planArc;
  if (s <= 0) return P[0]!;
  for (let i = 1; i < P.length; i++) {
    if (A[i]! >= s) {
      const u = (s - A[i - 1]!) / Math.max(1e-12, A[i]! - A[i - 1]!);
      return [P[i - 1]![0] + (P[i]![0] - P[i - 1]![0]) * u, P[i - 1]![1] + (P[i]![1] - P[i - 1]![1]) * u, P[i - 1]![2] + (P[i]![2] - P[i - 1]![2]) * u];
    }
  }
  return P.at(-1)!;
}

type Mode = { kind: 'drive' } | { kind: 'back'; until: number; thenRoll: number } | { kind: 'roll'; to: number };

export class ChainAutopilot {
  private mode: Mode = { kind: 'drive' };
  private bestS = 0;
  private bestAt = 0;
  private tries = 0;
  private rollDir = 0;
  private aimSince = -1;
  /** Arc along the plan of each junction, where the path leaves one edge for the next. */
  private readonly junctions: number[];

  constructor(private readonly model: ChainModel) {
    // Aim only where the plan turns into another vessel. Where it carries on along the same vessel past a side branch
    // (the arch past the LCCA), rolling toward the vessel's own curve points the tip into that branch; a push slides past.
    this.junctions = model.plan
      .slice(1)
      .filter((_, i) => model.planVessels[i + 1] !== model.planVessels[i])
      .map((id) => model.planStart.get(id)!.start);
  }

  /** The control for the next step. */
  control(state: ChainState): ChainControl {
    const m = this.model;
    const wire = state.roll.wire;
    if (state.s > this.bestS + 0.002) {
      this.bestS = state.s;
      this.bestAt = state.t;
    }
    // Off the plan only once the simulation counts it (3 mm into the branch), not while the tip crosses a junction.
    const offPlan = state.offPlanEdge !== null;

    if (this.mode.kind === 'back') {
      if (state.s > this.mode.until || offPlan) return { push: -1, rotate: 0, device: 'wire' };
      this.mode = { kind: 'roll', to: wire.base + this.mode.thenRoll };
    }
    if (this.mode.kind === 'roll') {
      const left = this.mode.to - wire.base;
      if (Math.abs(left) > 0.02) return { push: 0, rotate: Math.max(-1, Math.min(1, left * 4)), device: 'wire' };
      this.mode = { kind: 'drive' };
      this.bestAt = state.t;
    }

    if (offPlan || state.t - this.bestAt > STUCK_S) {
      this.tries++;
      this.mode = { kind: 'back', until: state.s - BACK_M, thenRoll: (Math.PI / 4) * (this.tries % 2 ? 1 : -1) * Math.ceil(this.tries / 2) };
      this.bestS = state.s - BACK_M;
      return { push: -1, rotate: 0, device: 'wire' };
    }

    // Aim near a junction where the path turns: roll until the shaped tip points toward the branch to take, judged
    // in the frame square to the shaft at the start of the shaped tip.
    const next = this.junctions.find((a) => a > state.s - 0.003 && a < state.s + JUNCTION_AHEAD_M);
    if (next === undefined) this.aimSince = -1;
    else if (this.aimSince < 0) this.aimSince = state.t;
    if (next !== undefined && state.t - this.aimSince < AIM_GIVE_UP_S) {
      const aim = shapedTipAim(m, state);
      const T = aim.tangent;
      const branch = sub(planPointAt(m, next + 0.008), planPointAt(m, next));
      const want = sub(branch, scale(T, dot(branch, T)));
      if (norm(want) > 0.25 * norm(branch)) {
        const err = Math.atan2(dot(cross(aim.pointing, want), T), dot(aim.pointing, want));
        if (Math.abs(err) > (this.rollDir ? AIM_RAD / 2 : AIM_RAD)) {
          this.rollDir = Math.sign(err);
          this.bestAt = state.t;
          return { push: 0, rotate: Math.max(-1, Math.min(1, err * 1.5)), device: 'wire' };
        }
      }
    }
    this.rollDir = 0;
    return { push: 1, rotate: 0, device: 'wire' };
  }
}

export interface AutopilotRun {
  state: ChainState;
  reached: boolean;
  steps: ChainStepResult[];
}

/** Drive from `state` with the autopilot until the target is reached or `maxS` of simulated time passes. */
export function autopilot(model: ChainModel, state: ChainState, maxS: number, dt = 1 / 30): AutopilotRun {
  const pilot = new ChainAutopilot(model);
  const steps: ChainStepResult[] = [];
  let s = state;
  for (let i = 0; i < maxS / dt && !s.atTarget; i++) {
    const out = stepChain(model, s, pilot.control(s), dt);
    steps.push(out);
    s = out.state;
  }
  return { state: s, reached: s.atTarget, steps };
}
