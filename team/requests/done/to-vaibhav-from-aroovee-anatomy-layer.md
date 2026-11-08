# Request — to Vaibhav from Aroovee: the anatomy layer's interface (feature/vascular-ui)

What I need: a yes, or changes, on the interface below before it lands. It's the one surface your code would touch if the assistant or voice toggles anatomy later ("show the veins", "hide the labels", "reset the view"). Nothing on your side has to change now.

Why: the 3D views get an anatomical layer: a configurable GLB with arteries and veins toggled apart, labels, opacity and camera reset. It's built against a placeholder until David's anatomical GLB arrives. I'd rather agree the names with you now than rename them after your input code is wired to them.

Where: `client/src/render/anatomy-model.ts` (pure, no three.js or DOM) and `client/src/render/anatomy-controls.ts`, on branch `feature/vascular-ui`.

The interface:
```ts
// anatomy-model.ts: pure, safe to import from client/src/input or score
type VesselKind = 'artery' | 'vein';
interface AnatomyState { visible: boolean; arteries: boolean; veins: boolean; labels: boolean; opacity: number /* 0..1 */ }
classify(nodeName, extras?): VesselKind | null   // extras.kind first, then the name
labelFor(nodeName, extras?): string               // extras.label first
shows(kind, state): boolean

// The view (render/dual-view.ts): one per Plan, Compare and Drive view
dualView.anatomy(): AnatomyControls | null         // null without WebGL, or before the scene is ready
dualView.resetCamera(): void
interface AnatomyControls {
  state(): AnatomyState;
  set(change: Partial<AnatomyState>): AnatomyState;  // saved like a click (localStorage threadsim.anatomy.v1)
  suppress(on: boolean): void;                        // the screen hides it (Drive's X-ray) without changing settings
}
```

Your side, if and when you want it:
- **Voice or assistant toggles** call `set({ veins: false })` and similar. Tell me which screen object you'd hold: I can expose the live view's controls from `ui/plan`, `ui/compare` and `ui/drive` (for example `currentAnatomy()`), so you don't reach into `render/`.
- **Engine:** the layer never feeds the engine. It doesn't change routes, measures, scores or picking (it isn't pickable), and nothing from the anatomical model reaches `optimize` or `score`.

Needed by: before `feature/vascular-ui` merges, after the demo. Not blocking: the controls work without you.
Meanwhile: I build to this interface on the branch, and nothing calls it from `client/src/input`.

## Answer

Vaibhav: Yes, approved as written, with two notes: (1) expose `currentAnatomy()` from `ui/plan`, `ui/compare` and `ui/drive` and I'll hold that, so `client/src/input` never reaches into `render/`; (2) consider a third `VesselKind`, e.g. `'context'` (bones and heart: the `context.glb` nodes `bone` and `heart` from `to-david-from-vaibhav-body-context-export.md`), so one anatomy layer and one set of toggles covers both instead of a second Body layer.
