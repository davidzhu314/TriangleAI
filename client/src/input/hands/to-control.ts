/**
 * Gesture → the existing ControlInput (no contract change). Push and rotate come from the gesture
 * while it is engaged, but any non-zero keyboard axis wins on that axis; fluoro and contrast always
 * come from the keyboard (Space and C). With no gesture engaged the keyboard passes through.
 *
 * Twist as a turn ANGLE (David's request, for chain mode): by default the twist sets a rotate RATE
 * (45° of twist is full speed, so holding a 90° twist spins the wire round and round). With
 * `createHubFollow()`, the hub instead follows the hand: when the gun engages it notes the wire's hub
 * roll, and from then on sends the rotate that turns the hub to (that roll + the hand's twist since
 * engaging), slowing to a stop on arrival. Turn the hand 90° right and the wire turns 90° and stops.
 * It needs the hub roll (WireState.tipPose.hubRollRad, chain mode); without it (rail) it stands aside
 * and the rate mapping stays.
 */

import type { ControlInput } from '../../contracts';
import type { GestureOutput, HandOutput } from './types';

/**
 * Merge a gesture into the keyboard's ControlInput. `rotateOverride` (from a HubFollow) replaces the
 * gesture's rotate rate when it isn't null; any keyboard axis still wins.
 */
export function mergeControl(g: GestureOutput, keyboard: ControlInput, rotateOverride: number | null = null): ControlInput {
  if (!g.control) return { ...keyboard };
  return {
    push: keyboard.push !== 0 ? keyboard.push : g.control.push,
    rotate: keyboard.rotate !== 0 ? keyboard.rotate : (rotateOverride ?? g.control.rotate),
    fluoro: keyboard.fluoro,
    contrastPuff: keyboard.contrastPuff,
  };
}

/** Hub error at which rotate is full, rad (~20°). Illustrative (DECISIONS.md, "Hand twist as a turn angle"). */
export const HUB_FOLLOW_FULL_RAD = 0.35;
/** Hub errors at or below this send no rotate, rad (~2°), so the hub settles instead of hunting. Illustrative. */
export const HUB_FOLLOW_DEAD_RAD = 0.035;

const DEG = Math.PI / 180;
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

export interface HubFollow {
  /**
   * The rotate that turns the hub toward (hub at engage + the driving hand's twist), −1..1; 0 inside the
   * dead zone; null when it doesn't apply (no hand in the gun, or no hub roll: rail mode). Call once per
   * frame with the latest WireState's tipPose?.hubRollRad.
   */
  rotate(g: GestureOutput, hubRollRad: number | null | undefined): number | null;
}

/** The hand driving the wire: the one whose control is the merged control (the dominant hand wins ties). */
function drivingHand(g: GestureOutput): HandOutput | null {
  if (!g.control) return null;
  for (const h of [g.hands.Right, g.hands.Left]) if (h.control === g.control) return h;
  return [g.hands.Right, g.hands.Left].find((h) => h.status === 'gun') ?? null;
}

export function createHubFollow(): HubFollow {
  let hubAtEngage: number | null = null;
  let hand: HandOutput['status'] | null = null;
  let side: 'Left' | 'Right' | null = null;
  return {
    rotate(g, hub) {
      const h = drivingHand(g);
      const whichSide = h === g.hands.Right ? 'Right' : h === g.hands.Left ? 'Left' : null;
      if (!h || hub === null || hub === undefined || !Number.isFinite(hub)) {
        hubAtEngage = null;
        hand = null;
        side = null;
        return null;
      }
      // a new engagement (or the other hand took over): the hub's angle now is the zero of the hand's twist
      if (hubAtEngage === null || side !== whichSide || hand !== 'gun') hubAtEngage = hub;
      hand = h.status;
      side = whichSide;
      const target = hubAtEngage + (h.debug.twistDeg ?? 0) * DEG;
      const err = target - hub;
      if (Math.abs(err) <= HUB_FOLLOW_DEAD_RAD) return 0;
      return clamp(err / HUB_FOLLOW_FULL_RAD, -1, 1);
    },
  };
}
