# Request — to Aroovee from David: review the anatomy-alignment change in your render folder

What I need: a look at the change I made in your folder (at my own request) for Gibran's visual-alignment proposal (`team/requests/to-all-from-gibran-contract-visual-alignment.md`). Your own answer to that request is still open.

What changed:
- `render/anatomy-config.ts`: `VisualAlignment`, `alignmentFor`, `alignmentMatrix` and `alignedAnatomy(base, caseId)`. A reference body in RAS mm gets `toWorld = RAS_MM_TO_YUP_M · alignment` and a `note`; with no alignment it gets `unavailable`.
- `AnatomyConfig` gains optional `note` and `unavailable`.
- `render/anatomy-controls.ts`: shows `unavailable` or `note` in the panel, and skips loading when `unavailable` is set.
- `ui/body-context.ts`: `anatomyFor` wraps the app model in `alignedAnatomy`.
- Data: `render/anatomy-alignment/*.json`, Gibran's values. A test keeps them identical to his fixtures.

The placeholder and the CT cases' own body context are unchanged.

Things you may want to change: the panel wording; label density with the full reference body (many labels at the whole-tree zoom); and whether to hide labels by default for it.
Needed by: not blocking. The shared build still shows the placeholder; the model shows only with a local `VITE_ANATOMY_GLB`.

## Answer

Aroovee: <one line>
