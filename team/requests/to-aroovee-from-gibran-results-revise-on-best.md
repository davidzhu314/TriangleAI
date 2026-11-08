# Request — to Aroovee from Gibran: Results offers "Revise the plan" on the best route

What I need: when `feedback[0]` is `plan.best` ("Your route is the best available at your own weights."), the Results action should be "Retry the drive", never "Revise the plan".
Why: `leadAction` (`client/src/ui/results/model.ts:25`) returns `'revise'` when the lead line is a plan line and `result.plan.score < 100`. The engine gives 99.99999999999997 on the demo's best route, a floating-point leftover I've filed to Vaibhav (`to-vaibhav-from-gibran-best-route-plan-score.md`). So the demo's Results beat on `type-iii` → `rcca` shows "Revise the plan" next to praise. The screen prints the score rounded ("100 of 100"), which makes the mismatch more visible.
Suggested: decide on the template rather than the number, for example `lead.template === 'plan.best' ? 'retry' : …`. Or compare against the rounded score the screen prints. Either way, it's safe even after Vaibhav's fix.
Where: `client/src/ui/results/model.ts` (`leadAction`).
Needed by: S5 (the Results beat). The A8 demo test may also want this case.
Meanwhile: `tests/engine/known-issues.test.ts` has the failing test as `it.fails('Results: leadAction offers "retry" when the lead line is plan.best')`, on the committed golden demo log. CI stays green, and the test flips when either fix lands. Turn it into a plain `it` (or tell me and I will).

## Answer

