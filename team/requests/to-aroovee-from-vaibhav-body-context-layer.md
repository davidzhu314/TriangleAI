# Request — to Aroovee from Vaibhav: an optional "Body" layer in the 3D view

What I need: when a case folder has a `context.glb` (David is exporting the same patient's spine, ribs, sternum and heart for the three real CT cases, `to-david-from-vaibhav-body-context-export.md`), draw it faint behind the arteries in the 3D view, with a toggle. Cases without the file look exactly as today.

Paste-ready prompt for your Claude Code (or David's, as with #56):
```text
Add an optional body-context layer to the 3D case view (team/requests/to-aroovee-from-vaibhav-body-context-layer.md).
Work in client/src/render/ and client/src/ui/ only. No contract change, no engine change.
1. When a bundled case opens in 3D, try to fetch cases/<id>/context.glb from the same base URL the Library uses for that case.
   On 404, an error or a non-GLB response, skip it silently: no console error, no notice. Imported case.zip files have
   no layer; that's expected.
2. Place it with the case's existing mesh.toWorld (it's exported in the same frame as vessels.glb).
3. Draw it as quiet background: a translucent, depth-tested, unlit or soft-lit material from DESIGN.md tokens
   ("bone" node very faint, "heart" node a touch stronger). The arteries, risk zones, route tubes and handles must
   stay clearly on top and clickable; the layer never takes raycasts or picks.
4. A "Body" toggle in the 3D toolbar beside 3D / Flat, off by default, remembered per browser like the 3D/Flat choice.
   Shown only when the case has the file. In the X-ray look, keep it off.
5. Never present it as more than context: no labels claiming clinical accuracy (CLAUDE.md "Never").
6. Tests: the layer loads when the file exists, is absent when it doesn't, and the toggle hides it; the Taste inspector
   still shows zero FAILs, and the demo's Playwright test still passes. Commit, open a PR.
```

Why: the real CT cases are a real patient's arteries floating in space. The same patient's bones and heart give instant scale and orientation, and they line up exactly because they come from the same scan.
Where: `client/src/render/scene3d.ts`, the 3D toolbar, DESIGN.md tokens (yours).
Needed by: tomorrow's demo only if it's cheap; it must never risk the Scale step, so off by default. Otherwise right after.
Meanwhile: nothing changes until David's files land.

## Answer

