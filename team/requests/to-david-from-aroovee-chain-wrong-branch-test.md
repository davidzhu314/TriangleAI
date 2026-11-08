# Request — to David from Aroovee: a test that the chain simulation can take a wrong branch

What I need: unit tests in `client/src/wire/physics-chain.test.ts` showing that the chain simulation really goes off the planned route when it's steered that way, and records it:
1. **Wrong branch on purpose:** on `fixture-y` (and one arch case, for example `type-iii` at the brachiocephalic split), roll the tip toward the branch that isn't planned and push. Expect the tip's `edge` to be the unplanned vessel, and exactly one `wrong_branch` event with the right `expectedEdge`.
2. **Back out and re-aim:** pull back past the split, roll toward the planned branch, push again. Expect a `back_out`, then the tip in the planned vessel, and no second `wrong_branch` for the same entry.
3. **Junction overlap is not a wrong branch:** a tip passing through a junction on the planned route (inside the overlapping tubes) records nothing.
4. **How easy it is:** from a few starting rolls (for example every 30°) with no steering, how often the tip leaves the plan at the first split. This needn't be an assertion; a printed table in the test or a line in your handoff is enough. Aroovee's question is whether the wall-slide rule ("prefer the direction furthest along the vessel") makes wrong turns rarer than they should be.

Why: Aroovee couldn't get the Physics (beta) catheter off the planned path and asked whether it's possible. Reading `physics-chain.ts`: it is, since the branch follows where the shaped tip points, and the `wrong_branch` event exists. But no test in the chain's own suite covers it, so nobody can say how reliably it happens.

Already done on my side (`integration/hands-voice`): `tests/e2e/drive-off-route.spec.ts` checks the Drive banner "Off the planned route" appears live in rail and chain modes on `fixture-y`. It reads `WireState.edge` (the tip's nearest vessel), so it may flicker at a junction where the event's 2 mm rule wouldn't fire. If you'd rather the screen follow the event, a `WireState` field like `offPlan: boolean` would be a contract request. I'm not asking for that now.

Not asking for: perforation, loops back toward the entry, or shaft buckling. Those are listed as not modelled, and stay that way unless the team decides otherwise.

Timing: whenever suits. The chain is the Physics (beta) mode, not in the demo script.

## Answer

