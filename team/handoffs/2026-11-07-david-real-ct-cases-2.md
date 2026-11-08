# Handoff — David: two more real CT cases and weighted decimation

What landed:
- **`client/public/cases/ts-s1336-cta/`** and **`client/public/cases/ts-s0727-cta/`**:
  - export inputs in `slicer/cases/ts-s1336-cta/` and `slicer/cases/ts-s0727-cta/` (`vessels.seg.nrrd`, `endpoints.mrk.json`, `case-meta.json`);
  - listed in `cases/index.json` after `ts-s1404-cta` and before `fixture-y`.
- **`slicer/export_case.py`:** weighted decimation (`DETAIL_WEIGHT`).
- **`tools/slicer-case.test.ts`:** now checks all three Slicer cases.
- **`tools/catalog.ts`:** the new order.
- THIRD_PARTY.md, README.md and slicer/README.md updated.

## Cases

| id | Source | License | Graph | Triangles |
| --- | --- | --- | --- | --- |
| `ts-s1336-cta` | TotalSegmentator v2.0.1 small subset, subject s1336 | CC BY 4.0 (Zenodo 10047263) | 11 nodes, 10 edges | 89,992 (decimated, weighted) |
| `ts-s0727-cta` | same dataset, subject s0727 | CC BY 4.0 | 12 nodes, 11 edges | 83,512 (under the cap, not decimated) |

- **Common to both:** entries `fem_r` and `fem_l`, targets `rcca` and `lcca`, planning only, outside the ladder.
- **Labels:** none for arch type, bovine or plaque.
- **Checks:** both load with no validation findings and re-export byte-identical. `ts-s1404-cta` still re-exports byte-identical.

## Mesh budget

- **Weights:** a vessel keeps `min(1, k × weight)` of its triangles. Arch branches and carotids are ×4, subclavians ×2, aorta ×1, iliacs ×½; the total stays under 90k.
- **Effect:** only s1336 was over the cap. Its arch branches and subclavians are now kept whole, and the iliacs drop to about 5.5k triangles each.
- **Limit:** detail near the arch is limited by the masks' 1.5 mm voxels, not by decimation. Load time is unchanged: same budget, about 1.5 MB GLBs.

## Known gaps, for Vaibhav's sweep

- **Merged arch node (s1336):** the brachiocephalic and left carotid origins share one arch node, `n_b3`, with four edges. s0727 has a separate node for each origin.
- **Not steerable, s1336 → lcca:** only fem_r / soft angled is offered, with a takeoff of 98° at `n_b3` against a 45° tip.
- **Not steerable, s0727 → rcca:** fem_l / soft angled, 85° at `n_b4` into `e_bca`.
- **Not steerable, s0727 → lcca:** fem_l / soft angled, 97° at `n_b3`.
- **What that means:** these targets have no steerable frontier route. Since #57 they are Cathy findings, not failures, and `cannot_steer` will turn them into `no_safe_route` for those choices.
- **Not modelled:** no risk zones and no radial entries. The subclavians stop at the scan edge.

## The rest

How to use: these are bundled cases, so the Library lists them. To reproduce them, see `slicer/README.md`.
Who switches:
- Vaibhav: sweep the two cases.
- Gibran: `cathy-grounding` passes with them (98/98).

Mock replaced: none
Contracts version after this handoff: unchanged (1)
Tests:
- `tsc` + `vitest run` (999 passed, 4 skipped, 2 todo), including `tests/engine/cathy-grounding.test.ts` (98/98) and `tools/slicer-case.test.ts` for all three cases.
- Playwright counts are in the PR.
New dependencies: none
Decisions logged: DECISIONS.md 2026-11-07 "Two more real CT cases and weighted decimation"
