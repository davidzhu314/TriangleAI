# Handoff — David D6-min: two generated cases

What landed:
- **Generator:** a seeded arch generator in `tools/generator/`:
  - `arch.ts`: parameters → splines → centerlines → tubes → GLB.
  - `cases.ts`: the two committed parameter sets.
  - `analyze.ts`: real `loadCase`, then V2 `buildGraph` and `measureRoute`.
  - `tune.test.ts`: the seed search, skipped unless `TUNE=1`.
- **New shared tools:** `tools/lib/spline.ts` (centripetal Catmull–Rom, arc-length resampling) and `tools/lib/rng.ts` (mulberry32).
- **Two bundled cases** in `client/public/cases/`, with `index.json` now owned by `tools/catalog.ts`.

| Case id | Seed | Arch | Tortuosity | Entries | Targets | Difficulty | Fluoro budget | Triangles |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `low-tort` | 1 | I | 0.05 | `fem_r` | `rcca`, `lcca` | beginner | 180 s | 37,024 |
| `type-iii` | 251 | III | 0.6 (right iliac ×1.6, left ×0.4) | `fem_r`, `fem_l`, `rad_r`, `rad_l` | `rcca`, `lcca` | expert | 240 s | 60,704 |

Both cases share these properties:
- `source.kind` is `parametric`, `physics.available` is false and `bovine` is false.
- Every optional field (`scenario`, `anatomy`, `source.seed`, `difficulty`, `fluoro_budget_s`) is filled.
- Vessels: aorta, BCA, RCCA, LCCA, both subclavians and both iliacs. Arms and iliacs without an entry are short stubs.
- Type III has one proximity zone, `r_vertebral_origin` (`critical_branch`, on `e_r_arm`).

The 120° evidence (V2 `measureRoute`, 5 mm window across junctions), `type-iii` → `rcca`:

| Route | Θmax | Where | Length | Narrowest radius | Proximity |
| --- | --- | --- | --- | --- | --- |
| `fem_r` | **120.1°** | `e_r_iliac` (tortuous right iliac) | 82.5 cm | 3.5 mm | 0 |
| `fem_l` | 97.5° | `e_bca` (Type III takeoff) | 75.8 cm | 3.5 mm | 0 |
| `rad_r` | 84.1° | `e_rcca` (subclavian → carotid) | 43.5 cm | 1.3 mm | 1.0 |
| `rad_l` | 97.5° | `e_bca` | 51.7 cm | 1.3 mm | 0 |

The three-route evidence: `fem_l`, `rad_r` and `rad_l` are geometrically distinct and no route dominates another. Each is under the soft angled limit (110°) and has no heavy crossing.
- I ran Vaibhav's unmerged V3 `optimizeCase` from a throwaway worktree of `lane/vaibhav` (nothing imported into main).
- On `rcca` it returns exactly these three as the frontier:
  - `rad_r`: shortest, gentlest, least radiation;
  - `rad_l`: farthest from risk;
  - `fem_l`: widest, farthest from risk.
- `fem_r` is flagged `turn_too_sharp` at 120.1° on `e_r_iliac` for every preset.

`low-tort`: Θmax is 68.4° to `rcca` and 76.8° to `lcca`, so the standard J wire (80°) works and the tutorial needs no special wire.

How to use: nothing new to call. The cases are in `index.json`, so `listBundledCases()` returns `low-tort`, `type-iii` and `fixture-y` in ladder order, and `loadCase` loads them with no validation results.
- Regenerate with `pnpm fixtures`.
- Re-run the seed search with `TUNE=1 pnpm exec vitest run tools/generator/tune.test.ts --disableConsoleIntercept`.

Who switches:
- **Aroovee:**
  - The Library can show the two real cases.
  - The demo plan beat runs on `type-iii`: build a right femoral route to the right carotid, and the 120° turn is flagged in the right iliac, not at the arch. Say "a 120° turn" on stage, not "at the arch takeoff". The arch takeoff is 97.5°, too sharp for the standard J wire.
  - The tutorial runs on `low-tort`.
  - `team/DEMO.md` is yours if you want to note where the turn sits.
- **Vaibhav:** NumPy cross-checks can add `low-tort` and `type-iii` (`tests/crosscheck/numpy-cases.json` today holds only fixture-y).

Mock replaced: none (fixture-y stays as the test fixture).
Contracts version after this handoff: unchanged (1).
Tests: `pnpm test` gives 222 green (2 tuning tests skipped). New:
- **Byte tests:** the committed files equal the generator's output, and the same seed builds twice identically.
- **Semantic tests,** per case:
  - schema;
  - topology, points within 1e-6 mm and metadata;
  - parametric metadata;
  - radii per point and > 0, about 1 mm spacing, edges ending on their nodes;
  - aorta radius in 7–20 mm;
  - one GLB node per vessel named by id, under 100k triangles;
  - real `loadCase` with no results and every target reachable.
- **Route tests:**
  - Type III `fem_r` → `rcca` Θmax within 117–123° on `e_r_iliac`;
  - ≥ 3 distinct, non-dominated safe routes;
  - low-tort every route under 90°.
- **Catalog test:** `index.json` matches.
- `pnpm fixtures` from a clean state writes the same bytes.
- Both GLBs pass the Khronos glTF validator with 0 errors and 0 warnings (run from the scratchpad; not a dependency).

New dependencies: none.
Decisions logged: bovine not yet implemented; Type III's 120° turn sits in the right iliac (and why); the generator method and the catalog owner.
Known gaps:
- No Type I or II, bovine, or other ladder packages; those come in D6.
- The safe-frontier check in the tests copies V3's preset limits (110°, 1.89 mm) as constants. When V3 merges, switch the test to `optimizeCase`.
- Tubes overlap at junctions; they are not merged into one surface, same as fixture-y.
- No zip is emitted (bundled cases are folders).
- Teaching geometry, not measured anatomy.
