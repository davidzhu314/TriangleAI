# Handoff — David D6-min follow-up: drivability retune

What landed:
- **New takeoff angles** in `tools/generator/arch.ts`, set per arch type (`ARCH[type].dirs`), so every Type III and low-tort frontier route can be steered under the §5.3 branch-entry rule.
- **Same seeds:** `type-iii` stays seed 251 and `low-tort` seed 1. The random draws come in the same order, so the right iliac and its 120° turn are unchanged.
- **Regenerated cases:** `client/public/cases/type-iii/` and `client/public/cases/low-tort/` were rebuilt; fixture-y is unchanged.
- **`tools/generator/analyze.ts`:** `frontierWithSteering()` runs V3 `optimizeCase` and then `steerableAt` (imported from `client/src/optimize/steerability.ts`, not copied) on every frontier route with its own preset.
- **Seed search and tests:** both now require every frontier route to pass `steerableAt`.

New angles. Takeoffs are the deflection into each branch the tip is rolled into; branches a route simply continues into are not listed.

| Case | Branch point → edge | Before | After | Frontier routes through it (all steerable) |
| --- | --- | --- | --- | --- |
| type-iii | `n_bca_o` → `e_bca` | 98° | **61.0°** | rcca: `fem_l`, `rad_l` (soft angled and standard J) |
| type-iii | `n_lcca_o` → `e_lcca` | 96° | **47.2°** | lcca: `fem_l`, `rad_l` (soft angled and standard J) |
| type-iii | `n_bca_bif` → `e_rcca` (from the right arm) | 84° | continues straight | rcca: `rad_r` (soft angled and standard J) |
| type-iii | `n_lsca_o` → `e_arch_distal` (from the left arm) | 93° | continues straight | `rad_l` to rcca and lcca |
| low-tort | `n_lcca_o` → `e_lcca` | 77° | **58.2°** | lcca: `fem_r` (soft angled and standard J) |
| low-tort | `n_bca_o` → `e_bca` | 68.4° | 68.4° (unchanged) | rcca: `fem_r` (soft angled and standard J) |

steerableAt evidence:
- **Type III:** the V3 frontier has 6 routes to rcca (`rad_r`, `rad_l` and `fem_l`, each with soft angled and standard J) and 4 to lcca (`rad_l` and `fem_l`, each with both presets). All 10 pass `steerableAt` with their own preset.
- **Low-tort:** the frontier has 2 routes to each carotid, and all 4 pass.
- **Rail drive:** with Vaibhav's `demo-path.test.ts` switched from `it.fails` to `it` (in a throwaway copy, deleted afterwards), all 9 tests pass. That includes the Type III rail drive of the best safety-weighted route to rcca: target reached, with no wrong branch and no prolapse.

Kept:
- The right femoral route to rcca is still **120.1° on `e_r_iliac`**, flagged `turn_too_sharp` for all three presets.
- The rcca frontier keeps three distinct paths: `rad_r`, `rad_l` and `fem_l`. Each now appears with two presets, because standard J is feasible too since the takeoffs dropped under 80°.
- The Type III origins still sit below the top of the arch:
  - brachiocephalic 10.7 mm, left carotid 4.9 mm, left subclavian 10.6 mm;
  - low-tort's brachiocephalic and left carotid sit about 2 mm below.

Requests answered:
- `to-david-from-vaibhav-type-iii-drivability.md`: yes; this retune. Moved to `done/`.
- `to-all-from-vaibhav-contract-steerability.md`: yes, after this retune is on main; then I add `cannot_steer` and bump `CONTRACTS_VERSION`. Left in place for Aroovee.
- `to-all-from-vaibhav-mediapipe-hand-input.md`: after the demo, not before S5. Left in place for Aroovee.
- New: `to-vaibhav-from-david-demo-path-expected-fail.md`. The retune makes his `it.fails` test pass, so `pnpm test` reports one failure. That is the only red test, in his folder, and I haven't edited it.

Who switches:
- **Vaibhav:** flip `demo-path.test.ts` line 77 to `it(`, in this PR or with the human's go-ahead. Then the `cannot_steer` contract can follow once this is on main.
- **Aroovee:** the Plan screen will see standard J routes on the Type III frontier as well as soft angled. The demo story is unchanged: the right femoral route's 120° iliac turn is flagged, and the frontier shows radial and left femoral routes.

Mock replaced: none.
Contracts version after this handoff: unchanged (1).
Tests: `pnpm test` gives 575 passed, 3 skipped and 1 failed. The failure is Vaibhav's `it.fails`, which now passes as noted above. New and changed generator tests:
- the 120° iliac turn, flagged for every preset;
- at least 3 distinct rcca frontier paths;
- every frontier route steerable, for type-iii and low-tort on both carotids;
- low-tort's soft angled route to lcca on the frontier and steerable;
- Type III origins below the top of the arch, and lower than low-tort's.

The old fixed-entry frontier check is gone. `pnpm fixtures` regenerates the same bytes.
New dependencies: none.
Decisions logged: "D6-min drivability retune" (supersedes the 97.5° takeoff line).
Known gaps:
- Low-tort's brachiocephalic takeoff (68.4°) is inside the soft angled window by under 2°. It passes, but a small geometry change could tip it.
- The Type III left carotid sits only 4.9 mm below the top of the arch.
