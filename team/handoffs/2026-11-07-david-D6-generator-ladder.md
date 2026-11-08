# Handoff — David D6: generator ladder

What landed:
- Four generated cases in `client/public/cases/`, each listed in `cases/index.json` in ladder order: `low-tort, type-i-plaque, type-ii, type-ii-tortuous, type-iii, bovine, fixture-y`. Neither the CathSim phantoms nor anything from `physics/cases/` is listed.
- Bovine support in `tools/generator/arch.ts` (`ArchParams.bovine: boolean`).
- Retuned Type II takeoff directions.
- The new case specs in `tools/generator/cases.ts`.
- A generic seed-search harness: `tools/generator/tune.test.ts`, `ladderProblem`, with `CASE=` to pick the case.

How to use: `pnpm fixtures` regenerates. `TUNE=1 CASE=bovine pnpm exec vitest run tools/generator/tune.test.ts --disableConsoleIntercept` prints a case's routes and searches seeds.
Who switches: nobody has to. The Library lists the new cases from `index.json`, and `ladderTier` already maps them.
Mock replaced: none
Contracts version after this handoff: unchanged (1)
Tests: `pnpm test` (739 passed) and `pytest physics` (23 passed) are green. The tests cover:
- byte-identical rebuilds;
- schema validity;
- a clean `loadCase`;
- every entry reaching every target;
- every frontier route steerable with its own preset, for every case and target;
- tier order 0, 0, 1, 1, 2, 3;
- plus one check per variation (below).

`pnpm test:e2e`: the Library and other specs pass. The only failures are the two A5 Drive tests already in `to-aroovee-from-david-a5-drive-e2e.md`.
New dependencies: none
Decisions logged: "D6 generator ladder"
Known gaps: tier 4 (whole-body planning) has no case. It waits for D3b/D3c, and D3c is blocked because Slicer isn't installed.

## New cases

| Case | Seed | Tier (`ladderTier`) | Difficulty · fluoro budget | Entries → targets | What it teaches |
| --- | --- | --- | --- | --- | --- |
| `low-tort` (D6-min) | 1 | 0 | beginner · 180 s | fem_r → rcca, lcca | controls |
| `type-i-plaque` | 1 | 0 | beginner · 180 s | fem_r, fem_l, rad_r → rcca, lcca | Pick the safe groin: a **heavy** left iliac plaque (40–75 mm) keeps fem_l off the frontier. A brachiocephalic-origin plaque is a proximity zone. The iliacs are 8 → 6.5 mm. |
| `type-ii` | 1 | 1 | intermediate · 210 s | fem_r, fem_l, rad_r, rad_l → lcca, rcca | Type II arch: the brachiocephalic origin is 7.4 mm below the top. A descending aortic aneurysm (150–200 mm) is a proximity zone on every femoral route. Left carotid takeoff 49.7°. |
| `type-ii-tortuous` | 14 | 1 | intermediate · 210 s | fem_r, fem_l, rad_r → rcca, lcca | Tortuous, narrow iliacs: 96.9° (right) and 94.8° (left), 7 → 5.5 mm. From the groin only the soft angled wire is feasible. The right radial route is about 400 mm shorter to the right carotid. |
| `type-iii` (D6-min) | 251 | 2 | expert · 240 s | 4 entries → rcca, lcca | unchanged. The 120° turn is in the right iliac. |
| `bovine` | 1 | 3 | expert · 240 s | fem_r, fem_l, rad_r, rad_l → lcca, rcca | A common brachiocephalic and left carotid origin (`n_bca_o`; there is no `n_lcca_o`). The left carotid takeoff is 64.6° from the groin and the brachiocephalic 41.1° from the same node, so the bigger trunk is the easy wrong turn. The right radial route to the left carotid is a 149° hairpin (infeasible). |

The ladder (spec §6.5) is: low-tortuosity → Type II → Type III → bovine → whole-body. With `ladderTier`, that gives tier 0: low-tort, type-i-plaque; tier 1: type-ii, type-ii-tortuous; tier 2: type-iii; tier 3: bovine; tier 4: none yet.

## For Vaibhav and Gibran (cross-checks)

- **New cases:** add the four to the NumPy cross-checks in `tests/crosscheck/`: per-edge measures, 5 mm-window turning, and narrowest radius.
- **The bovine node:** the `bovine` graph has a four-edge node, `n_bca_o` (arch in, arch out, `e_bca`, `e_lcca`). Worth checking:
  - junction-aware turning through it;
  - rail branch entry choosing between two children at one node;
  - `steerableAt` at a node with two candidate branches.
- **Iliac turns:** `type-ii-tortuous`'s iliacs (95–97°) are the closest any case comes to the preset limits other than type-iii's 120°. A good boundary check for `turn_too_sharp` (Standard J at 80°, soft angled at 110°).
- **Rail acceptance:** the "reaches every target on every template case using the frontier routes" check (spec §5.7) should now loop over all six generated cases. A golden log for one tier-1 case would help S4.
