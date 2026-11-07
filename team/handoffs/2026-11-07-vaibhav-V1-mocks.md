# Handoff — Vaibhav V1: mocks in contract shape (contracts v1)

What landed:
- `client/src/optimize/mock.ts`: `mockOptimize(req)` (async) and `mockOptimizeSync(req)`, which return an `OptimizeResult` for fixture-y. For `left_branch` it's a three-route `Frontier`: standard_j "shortest", soft_angled "gentlest" and stiff_straight "least_radiation", with `candidates` and `recordedRunsUsed: false`. For `right_branch` it's `NoSafeRoute`: the only path crosses the heavy `plaque_r` on `e_right`, and `suggestion` is null.
- `client/src/score/mock.ts`: `mockCaseResult()` returns a `CaseResult` for the standard_j left route: plan 80 (decided by regret), drive 92, 2 stars, and three `FeedbackLine`s, each with its `values` and `formulaRef`.
- `client/src/wire/mock-source.ts`: `MockWireSource implements WireSource`. The tip walks the planned path at a constant 0.02 m/s while push is held (forward for push > 0, back for push < 0). Rotate turns `rollRad`. It writes a 30 Hz `EventLog` in simulation time, with fluoro, `contrast_puff`, `back_out` and `target_reached`. It never falls back.
- `client/src/optimize/mock-case.ts`: a temporary stand-in for the D2 loader. `buildMockLoadedCase(caseJson, centerlines, { glb })` and `fetchMockLoadedCase('/cases/fixture-y/')` build a `LoadedCase`, using `rasMmToYupM` for points and radii / 1000. Delete it when `loadCase` lands.
- `tests/fixtures/synthetic/recorded-runs.mock.ts`: a recorded-runs test fixture. A test fails if anything under `client/` imports it.

How to use:
```ts
import { fetchMockLoadedCase } from '../optimize/mock-case';
import { mockOptimize } from '../optimize/mock';
import { mockCaseResult } from '../score/mock';
import { MockWireSource } from '../wire/mock-source';

const c = await fetchMockLoadedCase();                                   // fixture-y, metres Y-up
const result = await mockOptimize({ caseId: c.id, targetId: 'left_branch' });
const wire = new MockWireSource();                                       // { autoWalk: true } for demos
await wire.start({ case: c, entryId: 'fem_r', targetId: 'left_branch', presetId: 'standard_j', path: ['e_aorta', 'e_left'] });
```

Who switches: Aroovee builds Plan, Compare, Drive and Results on these, and maps each `FormulaRef` to its tooltip. David's `select.ts` can return `MockWireSource` until V4 lands.
Mock replaced: none (these are the first mocks)
Contracts version after this handoff: unchanged (1)
Tests: `pnpm test` gives 108 green (typecheck included). The new tests cover:
- the mock LoadedCase: unit conversion, zones in metres, reachability, budget, mesh bytes;
- the mock frontier: valid routes on fixture-y, no route dominated, labels match the best measure, no simulated measures, NoSafeRoute consistent with the real zone overlap;
- the mock CaseResult: internally consistent with §6.1–6.5 (plan from regret, drive as weighted sum, error penalties, fidelity, stars, budget), every number in the feedback text appears in its values;
- the mock wire: constant speed, target reached on time, 30 Hz simulation-time samples, active edge, tip on the centerline, fluoro, puff, one back-out per retreat, roll, clamping, identical logs for identical inputs, the interval clock, a bad path rejected;
- the recorded-runs fixture: consistent, and never imported by the app.
`python -m pytest tests/crosscheck -q` gives 90 green.
New dependencies: none
Decisions logged: "One `back_out` per retreat".
Known gaps:
- **The cost numbers in the mock frontier are placeholders, not measurements.** fixture-y has a single path to the left branch, so the three preset routes share their edges and can't really differ. Their values only exist to give the Compare screen three distinct routes. The NoSafeRoute for `right_branch` does match the geometry. V3 replaces this mock.
- **The mock CaseResult numbers are placeholders, not computed scores**, kept consistent with the spec's rules. V5 replaces it.
- **The mock wire models no contact force** (always 0, so no `force_spike`), no wrong branches and no prolapse. V4's rail wire adds those. It reports `mode: 'rail'` because `WireMode` has no mock value.
- There is no weighted ranking (§4.8) and no `measureRoute` yet; they come in V2/V3.
- `mesh.triangles` is 0 in the mock case, because the GLB is not parsed.
