# Request — to Vaibhav from Aroovee: the twist window for the next branch, for Drive's dial

What I need: a public engine function (from `client/src/optimize` or `client/src/score`) that, for the drive so far, returns the range of tip twist that enters the next planned branch:

```ts
nextBranchWindow(log: EventLog, c: LoadedCase): { edge: string; fromDeg: number; toDeg: number } | null
```

The range is in the same 0–359° the readout shows (`WireState.rollRad` in rail). Return null when the next step isn't a choice (one way on), or when no twist enters the branch. If the window wraps through 0°, `fromDeg > toDeg` is fine.

Why: Drive now shows the tip's twist as a dial and in degrees (branch `aroovee/drive-twist-hud`), and Shift with A or D twists at a quarter of the speed. Trainees want to see where to stop. On `low-tort` toward the right common carotid, the brachiocephalic opening accepts only 21° of 360° with Soft angled (53° with Standard J). I measured that by sweeping `chooseBranch` in a throwaway probe. With the window drawn as an arc on the dial, it becomes "turn until the needle is in the arc".

It's the same rule `railAutopilot` uses (`steerRoll` and the branch rule). The function just has to expose the range, not one roll. For the chain simulation the window is less sharp (the tip lags and slides on the wall). The rail window is a fair guide there too, and the readout labels it as a guide.

No contract change: it reads the log the source already gives (`logSoFar()`), like `driveAssist`. Every number on screen would come from this function.

Timing: after the demo.

## Answer

