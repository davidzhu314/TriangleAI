# Handoff — Vaibhav V3: optimizer and frontier

What landed (all in `client/src/optimize/`, exported through `index.ts`):
- `presets.ts`: `WIRE_PRESETS`, the three spec presets, all `illustrative: true`. Max turn: soft angled 110°, standard J 80°, stiff straight 40°. Minimum vessel diameter is 1.889 mm (0.035 in + 1 mm).
- `paths.ts`: DFS for simple paths, capped at 50 per entry × target × preset, and Yen's k = 10 shortest for graphs with more than 64 edges.
- `optimizer.ts`: `optimizeCase(graph, request)` returns an `OptimizeResult`:
  - It applies the hard constraints: `too_narrow`, `turn_too_sharp` (route-level 5 mm window, junctions included) and `forbidden_zone`.
  - Safe means feasible with zero heavy crossings. The frontier is taken among safe routes, with labels, and `candidates` lists every enumerated route.
  - Otherwise it returns `NoSafeRoute` with its reasons, the blocking heavy crossings, and a suggestion (another preset, then another entry, then both).
- `frontier.ts`: `dominates`, `paretoFrontier` and `frontierLabels` (shortest, gentlest, least_radiation, widest, farthest_from_risk).
- `rank.ts`: `createRanker(frontier)(weights)` returns the §4.8 `Ranking`; also `measureRanges`, `weightedScore` and `normaliseWeights`, for the V5 regret.
- The Worker gains `optimize(request)`. `optimize(request, loadedCase)` in `index.ts` runs the real optimizer, and still returns the mock under `VITE_ENGINE=mock`.
- Fixture `tests/fixtures/synthetic/diamond/`: a four-path graph with a closed-form frontier. NumPy cross-checks its edges and routes.

How to use:
```ts
import { createMeasureWorker, createRanker, WIRE_PRESETS } from '../optimize';

const engine = createMeasureWorker();
await engine.load(loadedCase);
const result = await engine.optimize({ caseId: loadedCase.id, targetId });   // Frontier | NoSafeRoute
if (result.kind === 'frontier') {
  const rank = createRanker(result);            // build once per frontier
  const ranking = rank(weightsFromSliders);     // on every slider move; < 2 ms for 1000 routes
}
```

Who switches: Aroovee. **The Compare screen can go real**: `engine.optimize(...)` replaces the mock frontier, and `createRanker` drives the weight sliders. Notes for the UI:
- Label the presets and the fluoro estimate as illustrative (`preset.illustrative`).
- Frontier routes with the same edges and different presets can have identical costs. fixture-y's left branch gives soft angled and standard J, with no labels, because nothing distinguishes them. Show them as one path with two devices, or as two rows. A route with an empty `labels` array is still on the frontier.
- Unsafe routes keep a full cost vector. Infeasible and heavy-crossing routes are in `Frontier.candidates` with all seven measures, and they're only kept off `routes`. A route the player builds anywhere, including toward a blocked target where `NoSafeRoute` lists no candidates, gets the same costs from `engine.measureRoute(edges)`. So Compare and Results can always show the player's own route.
- `NoSafeRoute.suggestion` drives "try another wire" or "try another entry". fixture-y's right branch gives `suggestion: null`, because the plaque blocks every option.
- `simPeakForceN` and `simSuccessRate` are absent and `recordedRunsUsed` is false until D4's real `recorded-runs.json`. Hide those columns.

Mock replaced: `optimize/mock.ts` is no longer used in a real build. It stays behind `VITE_ENGINE=mock` for screens that still want fixed data.
Contracts version after this handoff: unchanged (1)
Tests: `pnpm test` gives 286 green across the repo (D2 brought its own). The new tests cover:
- presets;
- the diamond's closed-form frontier, labels and violations;
- fixture-y on both targets, plus preset, entry and entry + preset suggestions;
- a property test over 60 seeded random multi-path graphs. Frontier routes are never dominated by any safe candidate, no non-dominated safe route is missing, a forbidden zone is never routed through, feasibility matches the violations, paths are simple, and the cap holds;
- a property test over random cost vectors with ties;
- Yen against exhaustive enumeration, and the large-graph switch on a 7 × 7 grid;
- the Worker optimize call;
- re-rank p95 under 16 ms on 1000 routes;
- typical optimize p95 under 50 ms;
- review follow-ups (`route-review.test.ts`): nearest-junction attribution on a 3 mm jog, where the closed form is atan(3/2) = 56.31° at both corners; full cost vectors on infeasible, heavy-crossing and player-built routes; and the simulated keys absent, not zero, with no arch rule applied.
`python -m pytest tests/crosscheck -q` gives 157 green. Timings are in `metrics/vaibhav/v3-optimizer-timing.md`: re-rank of 1000 routes takes 1.3 ms at p95, fixture-y and the diamond optimize in under 2 ms, and the 84-edge grid takes about 12 ms.
New dependencies: none
Decisions logged: "Wire preset maximum turns (illustrative)"; "Safe route"; "Turn attribution"; "Turn attribution when junctions are close"; "Enumeration and ranking details".
Known gaps:
- The §4.4 arch-only constraint and the two simulated measures are not implemented. They wait for D4's real recorded runs, as instructed; a follow-up adds them behind `recordedRunsUsed`.
- D2's `loadCase` has landed, so `optimize/mock-case.ts` can be deleted. The tests still use it to build cases, and switching them to `loadCase` is a follow-up.
- `optimize()` in `index.ts` runs on the main thread. The Worker client is the off-thread path.
- **David (D6-min): the Type III seed must give the demo a frontier, not "no safe route".** At least one route from an entry to the demo target needs every turn at or under 110°. That's the route's 5 mm-window sharpest turn with branch points included, as `measureRoute(...).cost.sharpestTurnDeg` reports it. It also needs 2·r_min ≥ 1.889 mm on every edge and no forbidden or heavy zone. Ideally give it routes that pass under different presets, for example one at or under 80° (standard J passes) and one between 80° and 110° (only soft angled passes), so Compare shows a real trade-off. Keep the low-tortuosity arch under 40° if stiff straight should pass there. Check with `optimize(request, loadedCase)`, which should return `kind: 'frontier'` for the demo target.
