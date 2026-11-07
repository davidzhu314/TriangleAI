# Handoff — Vaibhav V2: vessel graph and measureRoute in a Web Worker

What landed:
- `client/src/optimize/graph.ts`: `buildGraph(loadedCase)` builds the vessel graph (spec §4.1). Per-edge measures (§4.2) are computed once at load: L, Θmax, ΘΣ, r_min, zones on the edge, and clearance to each proximity zone.
- `client/src/optimize/measure-route.ts`: `measureRoute(graph, edgeIds, { startNode? })` returns the contract `RouteMeasures` for a full or partial route.
  - The `CostVector` covers length, sharpest turn, total turning, narrowest radius, heavy crossings, proximity penalty and estimated fluoro.
  - Sharpest turn and total turning run over the joined route, so the 5 mm window spans branch points.
  - `crossings` lists every zone on the route, `violations` lists forbidden zones, and `sharpestTurnEdge` names the edge with the sharpest turn.
  - Orientation is inferred from the edge chain, or from the entry for a one-edge route.
- `client/src/optimize/measure.worker.ts`, `measure-client.ts`, `measure-protocol.ts`: the same calls in a Web Worker. `createMeasureWorker()` gives `load(case)`, `measureRoute(edges)`, `edgeMeasures(edge)` and `terminate()`. The case is posted without its mesh.
- `client/src/optimize/constants.ts`: the proximity scale (10 mm) and the illustrative fluoro coefficients (1 s per cm, 3 s per 90° of turning).
- Fixtures: y-branch now has routes with closed-form costs, and the junction routes carry r_min, heavy crossings and proximity. NumPy has `route_costs` and a cross-check file for bundled cases, `tests/crosscheck/numpy-cases.json`, which today holds fixture-y.

How to use:
```ts
import { createMeasureWorker } from '../optimize';      // through the entry point, as the guard needs

const measurer = createMeasureWorker();
await measurer.load(loadedCase);                          // once per case
const m = await measurer.measureRoute(['e_aorta', 'e_left']);  // on every click; RouteMeasures
// m.cost.lengthM (shown in cm), m.cost.sharpestTurnDeg, m.cost.narrowestRadiusM (shown in mm), ...
```
Synchronous, on the main thread: `measureRoute(buildGraph(loadedCase), edges)`.

Who switches: Aroovee. **measureRoute is real, so the Plan screen's live cost panel can switch over** from mock numbers to `measurer.measureRoute(clickedEdges)`.
- It's real in every build, mock or not. Only `optimize()` (the frontier, V3) and `scoreAttempt()` (V5) are still mock-or-reject.
- Label the estimated fluoro time as illustrative.
- `violations` holds only forbidden zones for now. The preset checks (too narrow, turn too sharp) come with V3, so don't show a "feasible" verdict from `measureRoute` yet.

Mock replaced: none removed; the Plan panel now has a real source instead of the mock frontier's numbers.
Contracts version after this handoff: unchanged (1)
Tests: `pnpm test` gives 178 green. The new tests cover:
- the closed form on every synthetic edge and route, through LoadedCase (metres Y-up) → graph → measureRoute;
- NumPy within 0.1 mm / 0.5° on every synthetic fixture (junction included) and on fixture-y's edges and its trunk, left and right routes;
- crossings, violations, the takeoff edge, the fluoro formula, partial routes, orientation and errors;
- the Worker client through a fake port with structured-clone round trips;
- the mock build guard, which now also covers the Worker bundle;
- timing: p95 under one 60 Hz frame on every run.
`python -m pytest tests/crosscheck -q` gives 100 green.
Timing (`metrics/vaibhav/v2-measure-route-timing.md`): p95 is 0.24 ms for fixture-y entry → left, and 1.4 ms for a 1 m, 10-edge curved route. buildGraph takes about 10 ms per case load on that route.
New dependencies: none
Decisions logged: "Estimated fluoro time (illustrative)"; "Route measures (V2)".
Known gaps:
- No frontier, preset constraints or ranking yet; they come in V3, which will build multi-path synthetic graphs for the property tests.
- The Worker is tested through a fake port in Node, not in a browser.
- `measureRoute` checks that the edges chain together, not that a route starts at an entry or ends at a target.
- Back-out re-arm with a minimum forward move comes in V4.
