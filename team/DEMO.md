# ThreadSim — 3-minute demo script

Owner: Aroovee. Source: spec §7.4, copied as written; each beat adds one fallback line. The Playwright test in `tests/e2e/` follows this file beat by beat in rail mode. Change the beats only by a request to all, because they decide what gets built.

| Time | Beat (spec §7.4) | Fallback |
| --- | --- | --- |
| 0:00–0:20 | **Problem:** simulators cost tens to hundreds of thousands of dollars and sit idle most of the year. | Narration only; no fallback needed. Keep to the spec's sourced figures (§10.1). |
| 0:20–1:00 | **Plan:** open the Type III arch case, build a route, watch live costs; the optimizer flags a 120° turn. | The Type III case is generated (D6-min), seeded so a route has the turn. If D6-min slipped, use `fixture-y` and say "a simple Y-branch case". |
| 1:00–1:40 | **Compare:** the frontier shows three routes; move the safety slider and the ranking changes. | The D6-min seed is chosen to give at least three frontier routes. If a case gives fewer, say "the frontier shows its best routes" rather than "three". |
| 1:40–2:20 | **Drive:** physics wire in the arch, switch to X-ray view, puff contrast, reach the target. | Demo leads with physics (D1 passed): drive a phantom case served by the physics process. Demo leads with rail, or the server is down: rail on the Type III case. If the fallback notice appears mid-beat, say so aloud; it is the design working. |
| 2:20–2:45 | **Results:** score, the one line of feedback that matters, replay against the best route. | No fallback; scores come from the live event log. |
| 2:45–3:00 | **Scale:** import a case exported from 3D Slicer; close on the access gap. | Drag in the committed Slicer fixture (D3c). If none exists, import a generated `case.zip` and describe Slicer export as next, never as done. |

## Open choice for the rehearsal

Spec §7.4 plans on the Type III case and then drives "physics wire in the arch". Physics runs only on CathSim phantoms, which are not typed arches. If the demo leads with physics, the Drive beat switches to a phantom case. Decide at rehearsal whether that switch fits in 40 seconds or whether the physics drive becomes a short screen recording of a physics run, played from the laptop; record the choice in `DECISIONS.md`.

## Never say

"Realistic catheter simulation", "safer for patients", "clinically validated", or "optimal route" without the trade-offs on screen (spec §9.4).
