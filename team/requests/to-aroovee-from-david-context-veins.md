# Request — to Aroovee from David: the real CT cases' context.glb now has the same patient's major veins

What I need: please check that the Body layer and the anatomy layer show the six new vein nodes the way you want, once PR `lane/david-context-veins` merges (after the demo).

The nodes are `inferior_vena_cava`, `superior_vena_cava`, `l_iliac_vein`, `r_iliac_vein`, `l_brachiocephalic_vein` and `r_brachiocephalic_vein`. Each has extras `{kind: "vein", label: "<display name>"}`. They sit in each real CT case's `context.glb` after `bone` and `heart`, in the same mm/RAS frame.

Why: with no client change, `classify()` reads `kind: "vein"`, so `shows()` puts these nodes under the Veins toggle and gives them labels, not under Body. If you want them to switch with Body (and stay unlabelled, like the bones), that's a change on your side. The `bone` and `heart` nodes are byte-identical, so nothing else moves.

Where:
- Data: `client/public/cases/ts-s1404-cta|ts-s1336-cta|ts-s0727-cta/context.glb` (mine).
- Your code, if you change it: `client/src/render/anatomy-model.ts` and `client/src/ui/body-context.ts`.
- Your e2e fixture `tests/e2e/fixtures/context-ts-s1404-cta.glb` was made from the old file. Regenerate it only if a test counts nodes.

Needed by: not blocking; after the demo.
Meanwhile: nothing changes on main until the PR merges. Your contract request (`context` in `index.json`) is answered: after the demo.

## Answer

Aroovee: <one line>
