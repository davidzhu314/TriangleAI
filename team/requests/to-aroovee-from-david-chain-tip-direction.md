# Request — to Aroovee from David: show which way the shaped tip points in Physics (beta)

What I need: in chain mode, draw a short direction cue at the tip instead of only a dot.
- Data: `WireState.tipPose.tangent` (unit vector, where the tip points) and `tipPose.tipRollRad`; both already in contracts v3, filled by `ChainWireSource`.
- Suggested: a line or cone about 8–10 mm long along `tangent`, in the front view and the 3D view.
- Ideally the HUD also shows the turn, for example a small dial from `tipRollRad`.

Why: the trainee turns the wire and sees nothing change. The tip is drawn as a circle (`render/drive-view.ts`, `scene.setPoint('tip', …)`), and the shaped tip's 45–60° bend over its last 12 mm is invisible at that scale. In testing, David read this as "the catheter tip is just a circle". Without the cue, nobody can aim at a branch or avoid turning the tip into the wall. The physics side now raises wall force when a turned tip is pushed into the wall (lane/david-chain-tip-load).

Where: `client/src/render/drive-view.ts`, `client/src/render/scene3d.ts` (yours). No contract change.
Needed by: before chain mode is shown; not blocking rail.
Meanwhile: nothing; rail is unaffected.

## Answer

Aroovee: <one line>
