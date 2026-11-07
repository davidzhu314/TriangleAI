# Handoff — Vaibhav V1: mocks in contract shape (contracts v1)

What landed:
- `client/src/optimize/mock.ts`: `mockOptimize(req)` (async) and `mockOptimizeSync(req)`, which return an `OptimizeResult` for fixture-y. For `left_branch` it's a three-route `Frontier`: standard_j "shortest", soft_angled "gentlest" and stiff_straight "least_radiation", with `candidates` and `recordedRunsUsed: false`. For `right_branch` it's `NoSafeRoute`: the only path crosses the heavy `plaque_r` on `e_right`, and `suggestion` is null.
- `client/src/score/mock.ts`: `mockCaseResult()` returns a `CaseResult` for the standard_j left route: plan 80 (decided by regret), drive 92, 2 stars, and three `FeedbackLine`s, each with its `values` and `formulaRef`.
- `client/src/wire/mock-source.ts`: `MockWireSource implements WireSource`. The tip moves along the planned path at push × 0.02 m/s, with push clamped to −1..1: a half push walks at half speed and a negative push pulls back. Rotate turns `rollRad`. It writes a 30 Hz `EventLog` in simulation time, with fluoro, `contrast_puff`, `back_out` and `target_reached`. It never falls back.
- `client/src/optimize/mock-case.ts`: a temporary stand-in for the D2 loader. `buildMockLoadedCase(caseJson, centerlines, { glb })` and `fetchMockLoadedCase('/cases/fixture-y/')` build a `LoadedCase`, using `rasMmToYupM` for points and radii / 1000. Delete it when `loadCase` lands.
- `tests/fixtures/synthetic/recorded-runs.mock.ts`: a recorded-runs test fixture. A test fails if anything under `client/` imports it.

How to use: run or build with `VITE_ENGINE=mock` (bash: `VITE_ENGINE=mock pnpm dev`; PowerShell: `$env:VITE_ENGINE='mock'; pnpm dev`). Import the engine only through its entry points:
```ts
import { fetchMockLoadedCase } from '../optimize/mock-case';
import { engineMode, optimize } from '../optimize';      // never '../optimize/mock'
import { scoreAttempt } from '../score';                  // never '../score/mock'

const c = await fetchMockLoadedCase();                    // fixture-y, metres Y-up
const result = await optimize({ caseId: c.id, targetId: 'left_branch' });
const caseResult = await scoreAttempt({ log, optimized: result, weights });
```
The wire: `MockWireSource` (`{ autoWalk: true }` for demos) is reached only through David's `select.ts`; see below.

## Mock build guard (read this, Aroovee and David)

- **The mocks exist only in a `VITE_ENGINE=mock` build.** Without the flag, or with any other value, `engineMode` is `'real'`, the mocks are not bundled, and `optimize()` / `scoreAttempt()` reject with "lands in V3" / "lands in V5" until the real engine replaces them. `optimize/mock-guard.test.ts` (in `pnpm test`) runs a real Vite build without the flag and fails if any mock marker string is in it (`THREADSIM_MOCK_OPTIMIZER`, `_SCORE`, `_WIRE`). It also runs a mock build that must contain all three.
- **Aroovee:** show a visible "mock data" badge on every screen that displays engine numbers whenever `engineMode === 'mock'` (exported from `client/src/optimize` and `client/src/score`). Import only those entry points, never `optimize/mock`, `score/mock` or `wire/mock-source`; a static import of a mock that gets called fails the guard.
- **David:** the demo build runs **without** `VITE_ENGINE`, and `pnpm build` / CI already does. In `select.ts`, load the mock wire only behind the flag, with a dynamic import, as `client/src/optimize/mock-guard.entry.ts` shows:
  `if (import.meta.env.VITE_ENGINE === 'mock') { const { MockWireSource } = await import('./mock-source'); ... }`.
  A `dev:mock` script in `package.json` would save typing the env var; that's your call as release manager, and nothing here depends on it.

Who switches: Aroovee builds Plan, Compare, Drive and Results on these, and maps each `FormulaRef` to its tooltip. David's `select.ts` can return `MockWireSource` until V4 lands.
Mock replaced: none (these are the first mocks)
Contracts version after this handoff: unchanged (1)
Tests: `pnpm test` gives 108 green (typecheck included). The new tests cover:
- the mock LoadedCase: unit conversion, zones in metres, reachability, budget, mesh bytes;
- the mock frontier: valid routes on fixture-y, no route dominated, labels match the best measure, no simulated measures, NoSafeRoute consistent with the real zone overlap;
- the mock CaseResult: internally consistent with §6.1–6.5 (plan from regret, drive as weighted sum, error penalties, fidelity, stars, budget), every number in the feedback text appears in its values;
- the mock wire: speed scaled by push (forward, back, held, never past the entry), target reached on time, 30 Hz simulation-time samples, active edge, tip on the centerline, fluoro, puff, one back-out per retreat, roll, clamping, identical logs for identical inputs, the interval clock, a bad path rejected;
- the recorded-runs fixture: consistent, and never imported by the app.
`python -m pytest tests/crosscheck -q` gives 90 green.
New dependencies: none
Decisions logged: "One `back_out` per retreat"; "Mock build guard".
Known gaps:
- **The cost numbers in the mock frontier are placeholders, not measurements.** fixture-y has a single path to the left branch, so the three preset routes share their edges and can't really differ. Their values only exist to give the Compare screen three distinct routes. The NoSafeRoute for `right_branch` does match the geometry. V3 replaces this mock.
- **The mock CaseResult numbers are placeholders, not computed scores**, kept consistent with the spec's rules. V5 replaces it.
- **The mock wire models no contact force** (always 0, so no `force_spike`), no wrong branches and no prolapse. V4's rail wire adds those. It reports `mode: 'rail'` because `WireMode` has no mock value.
- There is no weighted ranking (§4.8) and no `measureRoute` yet; they come in V2/V3.
- `mesh.triangles` is 0 in the mock case, because the GLB is not parsed.
