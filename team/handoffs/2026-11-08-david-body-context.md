# Handoff — David: same-patient body context for the real CT cases

What landed (PR from `lane/david-body-context`, held until after the demo freeze):
- **`client/public/cases/{ts-s1404-cta,ts-s1336-cta,ts-s0727-cta}/context.glb`:**
  - nodes `bone` (vertebrae C7–L5, ribs 1–12 left and right, sternum, merged; 34k triangles) and `heart` (8k triangles);
  - node extras `{kind: "context", label: "Bones" | "Heart"}`;
  - about 0.75 MB each;
  - mm and RAS, the same frame as the case's `vessels.glb`.
- **`slicer/fetch_totalsegmentator.py --context`:** range reads of those 44 masks per subject. It never downloads the CT image or `meta.csv`.
- **`slicer/export_context.py`:** masks → the committed `slicer/cases/<id>/context.seg.nrrd` → `context.glb`, using the same GLB writer as `export_case.py`. Its new optional node extras leave `vessels.glb` byte-identical.
- **Tests:** `tools/slicer-case.test.ts` checks each `context.glb`: size, frame, nodes and extras, and that the case package never names it.
- **Docs:** THIRD_PARTY.md and slicer/README.md.

How to use: fetch `<case base URL>/context.glb` and place it with the case's `mesh.toWorld`, like `vessels.glb`. Only the three `ts-*-cta` cases have one; a 404 elsewhere means no context.
Who switches:
- **Aroovee:** your side is `team/requests/to-aroovee-from-vaibhav-body-context-layer.md`. Draw both nodes as the faint anatomy layer; `classify()` returns null for `kind: "context"`, so they get no arteries/veins toggle.
- **Vaibhav:** rerun the case sweep. Nothing the engine reads has changed.

Mock replaced: none
Contracts version after this handoff: unchanged (2)
Tests: `tsc`, `vitest run` and `vite build` are green (counts in the PR). The context files re-export byte-identical, and all three `vessels.glb` re-export byte-identical after the writer change.
New dependencies: none
Decisions logged: DECISIONS.md 2026-11-08 "Body context as an optional per-case file, no contract change"
Known gaps:
- The bone is merged into one node: no separate spine or ribs, and no costal cartilage.
- The generated cases have no context file.
