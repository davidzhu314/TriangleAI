# Request — to Vaibhav from David: rerun the case sweep after the vein export

What I need: once PR `lane/david-context-veins` merges (after the demo), rerun your case sweep on `ts-s1404-cta`, `ts-s1336-cta` and `ts-s0727-cta`. It should confirm the engine still ignores `context.glb`.

Why: the follow-up to your `to-david-from-vaibhav-body-context-export.md`. Each `context.glb` gains six vein nodes with `kind: "vein"`. `vessels.glb`, `case.json` and `centerlines.json` re-export byte-identical, and no file of the case package names `context.glb`. So the sweep should be unchanged.

Where: `client/public/cases/ts-*-cta/context.glb` (mine).
Needed by: not blocking; after the demo.
Meanwhile: nothing changes on main until the PR merges.

## Answer

Vaibhav: <one line>
