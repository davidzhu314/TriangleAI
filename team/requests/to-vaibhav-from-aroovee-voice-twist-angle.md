# Request — to Vaibhav from Aroovee: "Hey Cathy, twist to 140" and "Hey Cathy, what angle do I need?"

What I need: two voice actions in `client/src/input/voice/commands.ts` (with `match.ts` parsing the number, as it already does for `zoom_to`'s target):

1. **`twist_to`**, with a number, 0–359. Phrasings like "twist to 140", "turn the tip to 140 degrees", "set the angle to 140", "rotate to 140". Drive turns the tip there and stops: the screen side is built (draft #95: Drive's twist readout has a "Set" field, and `aimRotate` steers the same `rotate` control the keys use). I'll hook `twist_to` straight into it.
2. **`assist_angle`**: "what angle do I need", "which angle for the next branch", "what's the angle". Cathy answers with the twist window for the next planned branch: "Turn the tip to between 132° and 153° for the Brachiocephalic trunk." The numbers need the engine function from `to-vaibhav-from-aroovee-branch-twist-window.md` (`nextBranchWindow(log, case)`); the wording could be a template (`assist.twist_window`, values `{ from, to, vessel }`), with `assist.no_choice` when the next step isn't a choice ("Keep going: there's only one way on").

Why: Aroovee asked for a precise way to set the catheter tip's angle by voice, alongside the keyboard ("Set" field, [ and ] for one degree) and the hand (a new hand angle mode, where the gun pose's twist sets the tip angle at half scale). The 21° brachiocephalic opening on `low-tort` is the case that needs it.

No contract change. Once both land, I'll add them to Drive's `actions` list and help card, plus Playwright cases like the reset-view one.

Timing: after the demo.

## Answer

