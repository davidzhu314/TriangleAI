# Request — to David from Vaibhav: body context from the same CT scans (bones and heart)

What I need: for each real CT case (`ts-s1404-cta`, `ts-s1336-cta`, `ts-s0727-cta`), a light `context.glb` next to its `vessels.glb`, holding the same patient's spine, ribs, sternum and heart from TotalSegmentator. This is item 3 of `to-david-from-vaibhav-real-anatomy-context.md`, done the quick way, with no contract change.

Why this source and not a downloaded skeleton: the bones come from the same subject as the arteries, so they line up exactly, with no hand alignment that would pass off another body as this patient's. And the license is the same CC BY 4.0 already credited in `THIRD_PARTY.md`. Generic models from other projects were considered and rejected: ShareAlike and non-commercial terms, and misleading alignment.

Paste-ready prompt for your Claude Code:
```text
I'm David. Add body context to the three real CT cases (team/requests/to-david-from-vaibhav-body-context-export.md).
Work in slicer/ and client/public/cases/ only. Change no client code and no contract.
1. Extend slicer/fetch_totalsegmentator.py (or add a second mask list) to also fetch, for the same subject, the
   TotalSegmentator classes for the vertebrae (C7 to L5), the ribs (left and right 1–12), the sternum and the heart.
   Check the exact class names in the dataset's segmentations folder; use HTTP range reads as now.
2. Export them into one context.glb per case, in exactly the same frame and units as that case's vessels.glb
   (millimetres, RAS), so the case's existing mesh.toWorld places both. Nodes named "bone" (all bones merged) and "heart".
   Smooth, then decimate hard: under about 1.5 MB per file. It's faint background, not anatomy to study.
3. Put each file at client/public/cases/<id>/context.glb. Don't list it in case.json or the loader: the engine and the
   validator must keep ignoring it. Never hand-edit an export; fix the script and export again.
4. Record it: a THIRD_PARTY.md line (same TotalSegmentator source, CC BY 4.0, same citation), a DECISIONS.md line
   ("Body context as an optional per-case file, no contract change"), and the handoff/status.
5. Run pnpm test and pnpm build. Then open a PR from lane/david, and tell Aroovee (or do her side yourself, as you did
   for #56; her request is team/requests/to-aroovee-from-vaibhav-body-context-layer.md).
```

Where: `slicer/`, `client/public/cases/<id>/context.glb`, `THIRD_PARTY.md` (yours).
Needed by: tomorrow's demo if it fits in about an hour; otherwise first thing after it. It's polish, and no demo step depends on it.
Meanwhile: nothing changes. The engine never reads the file; I'll rerun the case sweep after it lands to confirm.

## Answer

David: Done (lane/david-body-context PR, held until after the demo freeze). Each real CT case now has `context.glb` (about 0.75 MB) beside its `vessels.glb`, in the same mm/RAS frame. It holds nodes `bone` and `heart` with extras `{kind: "context", label}`, from the same TotalSegmentator subject (CC BY 4.0). It isn't in `case.json` or `index.json`, the loader never reads it, and it re-exports byte-identical from the committed `context.seg.nrrd` (`slicer/export_context.py`).
