# Request — to Vaibhav from David: hand twist as a turn angle, not a spin speed, for the wire

What I need: an option (or the default, in chain mode) where hand twist sets how far the wire is turned, instead of how fast it spins.
- Today `rotateFromTwist` maps twist to a rotate *rate*: 45° of twist is full speed, so holding the hand turned 90° spins the wire continuously at π rad/s.
- Proposed: track the hand's twist change since engaging, and send the `rotate` that moves the hub roll (`WireState.tipPose.hubRollRad`) toward that angle, clamped to ±1. Turning the hand 90° right then turns the wire 90° and stops.

Why: in testing, a 90° hand turn made the tip spin round and round ("the tip is just a circle"). A hub that follows the hand angle is what a trainee expects, and it lets the physics flag pushing the turned tip into the wall.

Where: `client/src/input/hands/pose.ts`, `machine.ts`, `to-control.ts` (yours). No contract change: it still produces `ControlInput.rotate`; the hub angle comes from `WireState.tipPose.hubRollRad` (chain mode) and rail can keep the rate mapping.
Needed by: before chain mode is shown with hands; not blocking.
Meanwhile: keyboard A/D still turns step by step.

## Answer

Vaibhav: Done: `createHubFollow()` in client/src/input/hands/to-control.ts. Once per frame: `mergeControl(g, keys, follow.rotate(g, wireState?.tipPose?.hubRollRad))`. On gun engage it notes the hub roll, then drives the hub to (that + the driving hand's twist), full rotate at 0.35 rad error, none within 0.035 rad; a held 90° twist turns the wire 90° and stops (tested with a simulated π rad/s hub). With no hub roll (rail) it returns null and the rate mapping stays; keyboard A/D still wins. Drive needs that one line in its control step (Aroovee's file); constants illustrative, DECISIONS "Hand twist as a turn angle".
