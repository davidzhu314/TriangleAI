# Handoff — Vaibhav V2-prep: TypeScript measures and route-level turning

What landed: `client/src/optimize/measures/`, a TypeScript port of the NumPy §4.2 measures on plain arrays in mm (no contract types yet). It covers L, 5 mm-window Θmax/ΘΣ, r_min, zone overlap, proximity clearance, and the new route-level `joinRoute` / `routeTurningMeasures` / `routeLengthMm`. The same route functions were added to `tests/crosscheck/numpy_measures.py`. There is a new fixture `tests/fixtures/synthetic/junction/` (a parent edge plus children at 120° and 45° takeoff), and `tests/crosscheck/numpy-synthetic.json`, which holds NumPy's outputs for the 1e-6 agreement test.
How to use: `import { turningMeasures, routeTurningMeasures, lengthMm } from '../optimize/measures';` (points `[x, y, z]` in mm) · Python: `numpy_measures.route_turning_measures(polylines, reversed_flags)`
Who switches: David — for D6-min, see "Route-level turning for the Type III seed" below. Aroovee — nothing yet; measures reach the Plan screen in V2 through `measureRoute`.
Mock replaced: none
Contracts version after this handoff: unchanged (1, from D0b). V2-prep uses no contract types.
Tests: `pnpm test`, where `measures.test.ts` has 51 green tests: closed form within 0.1 mm / 0.5°, NumPy agreement within 1e-6 on every edge and route, reversal invariance, the corner peak stays exact at grid steps 0.25/0.3/0.37/0.5, a one-edge route equals the per-edge result, gaps, noise, short and degenerate edges, and segment distance against dense sampling. `python -m pytest tests/crosscheck -q` gives 90 green.
New dependencies: none
Decisions logged: "Route-level turning" in `DECISIONS.md`.
Known gaps: the measures don't read `LoadedCase` yet, and there is no Worker or `measureRoute` (V2 proper). There's no TS-vs-NumPy cross-check on fixture-y yet; that's next, in V2. Preset maximum-turn values aren't set; they come in V3.

## Route-level turning for the Type III seed (David, D6-min)

- **Definition.** Θmax and ΘΣ of a route are computed on the joined route polyline, so the 5 mm window spans branch points. The turn into a branch therefore counts, even though each edge on its own may be nearly straight.
- **Reading a takeoff.** A sharp corner of deflection δ, meaning the angle between the travel direction leaving the parent and the direction entering the branch, reads Θmax = δ. A rounded bend of radius R mm whose arc is at least 10 mm long reads about w/R rad, which is 286.5°/R. Rounding a corner lowers its Θmax. Check that the generated route's actual Θmax clears the threshold, because these figures are approximations.
- **Checking it.** Run `routeTurningMeasures` (TS) or `route_turning_measures` (NumPy) on the seed's entry→target edge list. Don't compute it by hand.
- **Threshold.** The flagged turn must exceed the preset's maximum-turn value. Those values are mine and come in V3; I have not picked them yet. The spec's 45°/60°/0° are tip angles, not maximum turns, so don't tune to them as limits. I'll post the numbers in my V3 handoff.
