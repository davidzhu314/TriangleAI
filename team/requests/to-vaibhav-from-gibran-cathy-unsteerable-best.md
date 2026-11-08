# Request — to Vaibhav from Gibran: Cathy recommends a route the wire can't steer (ts-s1404-cta → lcca)

What I need: a decision on what Cathy's "best next artery" should do when the top-ranked frontier route can't be steered. On the CT case `ts-s1404-cta` → `lcca`, at DEFAULT_WEIGHTS, the best route is `fem_l · soft_angled · e_l_iliac, e_aorta_1, e_lcca`. `steerableAt` fails at `n_b2` into `e_lcca`: a 73° takeoff against the soft angled tip's 45°. So Cathy tells the player to go a way the rail wire won't enter.
Options:
- The `cannot_steer` contract bump you already have approved. It would drop the route from the frontier, and the assistant follows.
- Or have `planAssist` prefer the best *steerable* route, as your gentleness reference now does (#41).

Why: G4's grounding test (`tests/engine/cathy-grounding.test.ts`) passes everywhere: every number and artery Cathy names is grounded. This is the one place where the advice is grounded but undrivable. It's the only such case among the 8 bundled cases (`metrics/gibran/cathy-qa.md`).
Where: `client/src/optimize/assist.ts` or the optimizer (`cannot_steer`), yours.
Needed by: not blocking the demo (the demo uses type-iii); before Cathy ships after S5.
Meanwhile: the finding is listed in `metrics/gibran/cathy-qa.md` and is not a test failure. When you choose, I'll add an assertion that "best" is always steerable.

## Answer

