# Handoff — David, body context: the same patient's major veins

What landed (PR from `lane/david-context-veins` to main, held until after the demo; no freeze exception taken):
- `slicer/fetch_totalsegmentator.py`: `--context` also fetches the TotalSegmentator v2 classes `inferior_vena_cava`, `superior_vena_cava`, `iliac_vena_left`, `iliac_vena_right`, `brachiocephalic_vein_left` and `brachiocephalic_vein_right`, still by HTTP range reads. A class missing for a subject is skipped and named.
- `slicer/export_context.py`:
  - `--veins` builds or reads a separate `veins.seg.nrrd`, one segment per vein id. `--veins-only` builds just that file.
  - The export writes `bone` and `heart` first, then the six veins, each with extras `{kind: "vein", label}`.
  - Triangle budgets: IVC 6k, SVC 2.5k, iliac veins 3k each, brachiocephalic veins 2k each.
  - An empty mask is skipped and named.
- New committed inputs: `slicer/cases/ts-{s1404,s1336,s0727}-cta/veins.seg.nrrd`. `context.seg.nrrd` is unchanged.
- Re-exported `client/public/cases/ts-{s1404,s1336,s0727}-cta/context.glb`: about 1.09 MB each (was 0.75 MB).
- Docs: `slicer/README.md`, a THIRD_PARTY.md row, a DECISIONS.md line "Body context gains the same patient's major veins".

Checks:
- **Skipped classes:** none. All six vein classes are present and non-empty for s1404, s1336 and s0727.
- **`bone` and `heart`:** byte-identical to the previous files in every node (positions, normals, indices, extras). The JSON asset block is unchanged.
- **Reproducibility:** each `context.glb` re-exports byte-identical from the committed `context.seg.nrrd` and `veins.seg.nrrd`.
- **`vessels.glb`, `case.json`, `centerlines.json`:** all three cases re-export byte-identical with `slicer/export_case.py`.
- **Frame:** the vein bounds sit where they should against the bones and heart (SVC above the heart, IVC below and to the right, iliac veins in the pelvis).
- **Not referenced:** no `case.json`, `index.json`, schema or loader code names `context.glb`. No contract change.

How to use: after the merge, the files are where the Body layer already looks.
Who switches:
- Aroovee: check how the vein nodes show (today they fall under the Veins toggle, labelled). Request: `team/requests/to-aroovee-from-david-context-veins.md`.
- Vaibhav: case sweep. Request: `team/requests/to-vaibhav-from-david-context-veins-sweep.md`.

Mock replaced: none.
Contracts version after this handoff: unchanged.
Tests: `pnpm test` and `pnpm build`, both green.
New dependencies: none.
Decisions logged: DECISIONS.md 2026-11-08 "Body context gains the same patient's major veins".

Known gaps:
- Aroovee's e2e fixture `tests/e2e/fixtures/context-ts-s1404-cta.glb` was made from the old file. It's hers to regenerate if a test counts nodes.
- Her contract request for a `context` field in `index.json` is answered: after the demo.
