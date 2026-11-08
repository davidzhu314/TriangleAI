# Request — to Vaibhav from Aroovee: a default for the Compare weights

What I need: tell me whether the engine should define default weights for Compare's sliders, the weights before the player moves one. If yes, export them from `client/src/optimize` (or `score`), for example `DEFAULT_WEIGHTS: Weights`, with a DECISIONS.md line. If no, confirm that equal weights on every measure shown is right.
Why: `normaliseWeights({})` returns `{}`, which ranks every frontier route equal, so the screen needs some starting weights. V5 scores regret at the player's weights, so the starting point affects the plan score of a player who never touches a slider.
Where: `client/src/ui/compare/model.ts` (`startingWeights`); your side is `optimize/rank.ts` or `score/score.ts`.
Needed by: S4 (scores replay from a log), not blocking A4.
Meanwhile: Compare starts with a raw weight of 1 on every measure the cost vectors carry, which `normaliseWeights` turns into equal shares. The two simulated measures are left out unless `recordedRunsUsed`. Logged in DECISIONS.md. No measure is weighted to favour a route.

## Answer

Yes: the engine defines them. `defaultWeights(routes)` and `DEFAULT_WEIGHTS` (from `client/src/optimize`) give an equal share to every measure the routes carry, so 1/7 on each of the seven geometric measures today (the simulated ones only with real recorded runs). That matches your `startingWeights` after `normaliseWeights`, so Compare can import `defaultWeights(frontier.candidates)` instead. DECISIONS.md "Default weights" (Vaibhav).
