# Request — to Aroovee from Vaibhav: voice review of the feedback templates

What I need: a voice pass over the 23 feedback sentences the Results screen shows (spec §6.4). Change the words, never the numbers. Put your wording in the Answer section, or in a table under it; I'll apply it, since `client/src/score/templates.ts` is my file.
Why: these sentences are the product's voice on the Results screen, and the demo's Results step shows the top one. Lane file V7: "she may change words, never numbers".
Where: `client/src/score/templates.ts` (`FEEDBACK_TEMPLATES`). The guard tests are in `client/src/score/templates.test.ts`.
Needed by: S5 (demo ready). Not blocking: the current wording ships until yours lands.
Meanwhile: the wording below is live. Every number in it comes from computed results.

## Rules (the guard tests enforce them)

- **Words only.** Every template keeps exactly its current `{placeholders}`. You can reorder them, but not add, drop or rename any.
- **No digits** in template text, so every number on screen comes from a computed value. Write "zero", "a star" and so on in words.
- **Never say** (spec §9.4, `team/DEMO.md`): "realistic catheter simulation", "safer for patients", "clinically validated", "optimal route".
- **Placeholders carry their own units, already rounded.** `{fluoro_s}` is a number of seconds, so the "s" stays in the template text.

## Open question from V5

`plan.top_contributor` names the measure that cost the player the most, in display units. For closeness to risk zones the unit reads "penalty points", so the line ends "…from closeness to risk zones: {value} penalty points." No golden result produces this line yet. Is there a better word? The unit words are in `MEASURE_DISPLAY` in `client/src/score/feedback.ts`; tell me the word and I'll change it.

## Every template

The examples are copied from the committed golden results in `tests/fixtures/logs/`, not made up. A template that no golden produces says so.

| Id | Current text | Placeholders | Example from a golden result |
| --- | --- | --- | --- |
| `plan.too_narrow` | Route blocked: the {vessel} narrows to {diameter_mm} mm; the {preset} wire needs {required_mm} mm. | `diameter_mm`: vessel diameter, mm, 2 dp<br>`preset`: wire preset name (text)<br>`required_mm`: diameter the wire needs, mm, 2 dp<br>`vessel`: vessel name (text) | No committed golden produces this line; its unit test is in `score.test.ts`. |
| `plan.turn_too_sharp` | Route blocked: the {turn_deg}° turn into the {vessel} is sharper than the {preset} wire can take ({max_turn_deg}°). | `max_turn_deg`: preset's max turn, degrees, whole<br>`preset`: wire preset name (text)<br>`turn_deg`: turn angle, degrees, whole<br>`vessel`: vessel name (text) | Route blocked: the 90° turn into the wide_back is sharper than the Standard J wire can take (80°). <br>*(rail-golden-diamond-j.result.json)* |
| `plan.forbidden_zone` | Route blocked: it passes through {zone}, a no-go zone. | `zone`: risk zone, e.g. "the plaque in the Right branch" (text) | No committed golden produces this line; its unit test is in `score.test.ts`. |
| `plan.arch_never_reached` | Route blocked: the {preset} wire never reached the arch in the recorded runs. | `preset`: wire preset name (text) | No committed golden produces this line; its unit test is in `score.test.ts`. |
| `plan.no_safe_route` | No safe route to the {target} with this entry and wire; every route is blocked or crosses a heavy risk zone. | `target`: target name (text) | No committed golden produces this line; its unit test is in `score.test.ts`. |
| `plan.heavy_crossing_shorter` | Your route was {dl_cm} cm shorter but crossed {zone}. The {route} avoids it. | `dl_cm`: how much shorter, cm, 1 dp<br>`route`: route, e.g. "Soft angled wire through Aorta → Left branch" (text)<br>`zone`: risk zone, e.g. "the plaque in the Right branch" (text) | No committed golden produces this line; its unit test is in `score.test.ts`. |
| `plan.heavy_crossing` | Your route crossed {zone}. The {route} avoids it. | `route`: route, e.g. "Soft angled wire through Aorta → Left branch" (text)<br>`zone`: risk zone, e.g. "the plaque in the Right branch" (text) | No committed golden produces this line; its unit test is in `score.test.ts`. |
| `plan.heavy_crossing_no_alt` | Your route crossed {zone}. No route to the {target} with these entries and wires avoids a heavy risk zone. | `target`: target name (text)<br>`zone`: risk zone, e.g. "the plaque in the Right branch" (text) | No committed golden produces this line; its unit test is in `score.test.ts`. |
| `plan.dominated` | The {route} is at least as good as your route on every measure and better on some. | `route`: route, e.g. "Soft angled wire through Aorta → Left branch" (text) | No committed golden produces this line; its unit test is in `score.test.ts`. |
| `plan.top_contributor_turn` | Most of your penalty came from the {turn_deg}° turn into the {vessel}. | `turn_deg`: turn angle, degrees, whole<br>`vessel`: vessel name (text) | No committed golden produces this line; its unit test is in `score.test.ts`. |
| `plan.top_contributor` | Most of your penalty came from {measure}: {value} {unit}. | `measure`: measure name, e.g. "route length" (text)<br>`unit`: unit word: cm, mm, degrees, s, N, %, penalty points, zones (text)<br>`value`: that measure's value, in `unit` | No committed golden produces this line; its unit test is in `score.test.ts`. |
| `plan.best` | Your route is the best available at your own weights. | none | Your route is the best available at your own weights. <br>*(score-clean-fixture-y.json)* |
| `drive.not_reached` | The wire did not reach the {target}. | `target`: target name (text) | No committed golden produces this line; its unit test is in `score.test.ts`. |
| `drive.fidelity_drift` | The tip ran {mean_mm} mm from the planned centerline on average; {zero_mm} mm or more scores zero. | `mean_mm`: mean tip distance, mm, 1 dp<br>`zero_mm`: distance that scores zero, mm (10) | The tip ran 16 mm from the planned centerline on average; 10 mm or more scores zero. <br>*(score-prolapse-fixture-y.json)* |
| `drive.gentleness` | Peak force was {peak_n} N against {ref_peak_n} N on the reference drive, and total force {cum_ns} N·s against {ref_cum_ns} N·s. | `cum_ns`: cumulative force, N·s, 3 dp<br>`peak_n`: peak force, N, 3 dp<br>`ref_cum_ns`: reference cumulative force, N·s, 3 dp<br>`ref_peak_n`: reference peak force, N, 3 dp | Peak force was 0.6 N against 0.094 N on the reference drive, and total force 0.924 N·s against 0.004 N·s. <br>*(score-prolapse-fixture-y.json)* |
| `drive.force_spike` | Force spikes above {threshold_n} N: {n}. Ease off the push at sharp turns. | `n`: count<br>`threshold_n`: spike threshold, N | Force spikes above 0.5 N: 1. Ease off the push at sharp turns. <br>*(score-prolapse-fixture-y.json)* |
| `drive.radiation_within` | Fluoro ran {fluoro_s} s, within the {est_fluoro_s} s estimate for this route. | `est_fluoro_s`: route's estimated fluoro time, s, 1 dp<br>`fluoro_s`: fluoro time, s, 1 dp | Fluoro ran 7.5 s, within the 16.5 s estimate for this route. <br>*(score-clean-fixture-y.json)* |
| `drive.radiation_over` | Fluoro ran {fluoro_s} s, {over_s} s over the {est_fluoro_s} s estimate for this route. | `est_fluoro_s`: route's estimated fluoro time, s, 1 dp<br>`fluoro_s`: fluoro time, s, 1 dp<br>`over_s`: seconds over, s, 1 dp | Fluoro ran 77.5 s, 61 s over the 16.5 s estimate for this route. <br>*(score-over-budget-fixture-y.json)* |
| `drive.wrong_branch` | Wrong branches: {n}, first into the {wrong_vessel}. Rotate the tip toward the {target_vessel} before pushing at the branch. | `n`: count<br>`target_vessel`: vessel the plan expected (text)<br>`wrong_vessel`: vessel entered by mistake (text) | Wrong branches: 1, first into the Right branch. Rotate the tip toward the Left branch before pushing at the branch. <br>*(score-prolapse-fixture-y.json)* |
| `drive.prolapse` | Prolapses: {n}, first in the {vessel}. Pull back and re-aim instead of pushing harder. | `n`: count<br>`vessel`: vessel name (text) | Prolapses: 1, first in the Right branch. Pull back and re-aim instead of pushing harder. <br>*(score-prolapse-fixture-y.json)* |
| `drive.back_out` | Back-outs: {n}, at {penalty} points each. Aim the tip before you push. | `n`: count<br>`penalty`: points per back-out (5) | Back-outs: 1, at 5 points each. Aim the tip before you push. <br>*(score-prolapse-fixture-y.json)* |
| `result.over_budget` | Fluoro went {over_s} s over this case's {budget_s} s allowance, which cost a star. | `budget_s`: case's fluoro allowance, s<br>`over_s`: seconds over, s, 1 dp | Fluoro went 17.5 s over this case's 60 s allowance, which cost a star. <br>*(score-over-budget-fixture-y.json)* |
| `result.over_budget_kept` | Fluoro went {over_s} s over this case's {budget_s} s allowance. | `budget_s`: case's fluoro allowance, s<br>`over_s`: seconds over, s, 1 dp | No committed golden produces this line; its unit test is in `score.test.ts`. |

## How to answer

Under "Answer", write one line ("approved as is", or "new wording below"), then a table of `id | new text` for any template you change. Leave the others out. I'll apply it in its own commit and run the guard tests. Then move this file to `team/requests/done/`.

## Answer

<Aroovee writes one line here>
