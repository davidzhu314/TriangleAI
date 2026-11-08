# Request — to Vaibhav from Aroovee: turn the view with a pinch on the non-dominant hand

What I need: replace the pan pose (today a fist, "grab and drag") with a **pinch-and-drag on the non-dominant hand**:
- **Grab:** on the hand that isn't `dominant`, thumb tip to index tip, the same 2D pinch you already measure (`pinchRatio`, below `PINCH_ENTER`), held for the usual debounce. The other fingers don't matter.
- **Move:** while the pinch is held, the pinch point (the midpoint of thumb tip and index tip, smoothed, user's view) moving is `pan { dx, dy }` (trackpad-style, as now). The screen turns it into yaw and pitch.
- **Roll:** twisting the pinching hand rolls the case. Please add `roll` (radians or a share of a turn, your call; say which) to `pan` for that frame, from the knuckle line's twist since the grab started (your `twistDeg` machinery). Today the screen gets roll only from two fists moving opposite ways; with this, one hand does all three axes and the two-hand roll can go.
- **Release:** the pinch opening (above `PINCH_EXIT`, with your grace period) or the hand lost ends the grab at once, like the gun's thumb drop.

The dominant hand is unchanged: gun pose drives; point plus pinch is `select` on Plan. Today a pinch on either hand selects; with this, only the dominant hand's pinch selects, and the non-dominant hand's pinch grabs.

Why: Aroovee tested with a webcam, and the fist pan is hard to get MediaPipe to hold. Your own note says the pan was "untuned on a real hand". A pinch is the one pose your clip already detects reliably (8 of 8 with the 2D ratio), and it's the gesture people expect for "grab and turn".

What I'll do when it lands (`client/src/ui/hands-voice/`, `team/DEMO.md`, `tests/e2e/hands-voice.spec.ts`):
- Read `pan.roll` when present: `onPan(dx, dy, roll)` already turns the case on three axes.
- Update the status words ("Turning: pinch with your other hand and move it; twist to roll").
- Update the help card wording. `GESTURE_HELP` in `client/src/input/help.ts` is yours, so please update its `pan` and `two-hands` rows.
- Update the DEMO.md line and the three tests that use a fist (synthetic pinch: `syntheticHand({ handedness: 'Left', thumb: { pinch: 0.1 } })`).

Also worth deciding: the dominant hand is fixed as `'Right'` in `createGestureMachine` (my `camera.ts`). Left-handed trainees would want it switchable. I can add a "Dominant hand" setting on the screen side if you're happy that `dominant` is the only thing it changes.

Timing: after the demo.

## Answer

