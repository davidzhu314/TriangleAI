# Handoff — Aroovee A7 and the three.js views: 3D Plan, Compare, Drive, and AR

What landed:
- **`client/src/render/scene3d.ts`:** the shared three.js scene of a case.
  - vessels.glb placed with `mesh.toWorld`, translucent, with simplified centerline tubes as the fallback and as AR's low-cost mesh;
  - risk zones in their tier colours;
  - routes as tubes, dashed for frontier routes from the `--dash-route-*` tokens;
  - entry and target markers, clickable branch-point handles, OrbitControls, and an AP camera that matches the 2D front view.
  - Every colour and opacity is a token, re-read when the theme changes.
- **`render/dual-view.ts`:** each case view has two faces, 3D by default and the 2D front drawing as "Flat".
  - The choice is remembered per browser (`threadsim.view.v1`).
  - Flat is also the fallback without WebGL.
  - three.js loads with a dynamic import only when a case view opens; the main chunk stays at 158 KB.
- **Plan** (`render/plan-view.ts`): in 3D, a click on a branch point extends the route; the keyboard path is unchanged.
- **Compare** (`render/compare-view.ts`): frontier routes in 3D, in their colours and dash patterns.
- **Drive** (`render/drive-view.ts`):
  - Front view: translucent vessels, the ghost trail, and the wire and tip.
  - X-ray: the same scene in the X-ray tokens. The wire shows only with fluoro. The puff's silhouette fades from `--opacity-xray-contrast` to 0 over `--duration-contrast-fade`.
  - The 3D/Flat switch sits in the HUD.
  - `data-wire` and `data-contrast` report the 3D state.
- **A7 AR** (`render/ar.ts`, `render/ar-math.ts`), per spec §7.2:
  - **Entry:** "Enter AR" shows only where immersive-ar is supported, and says "AR could not start" if the session is refused.
  - **Placement:** a hit-test reticle; the case is placed at 50% scale, with a 1:1 button.
  - **Manipulation:** squeeze grabs and moves it; both hands squeezing scale and turn it.
  - **Planning:** select picks a branch handle.
  - **Panels:** the cost panel (Plan) or the HUD (Drive) floats beside the model on a canvas panel.
  - **Driving:** the controller's thumbstick pushes and rotates, the trigger holds fluoro, and A/X puffs. These go through the same step the keyboard and gamepad use.
  - **Frame rate:** the session asks for 72 fps; past a 14 ms mean frame, the simplified mesh swaps in.
- **Other changes:**
  - The segmented-control styles moved to `ui/ui.css`.
  - The tutorial note now sits beside its anchor when there's room.
  - Plan and Compare keep their view across redraws, so the 3D camera stays where the player turned it.

How to use:
- Open any case on Plan, Compare or Drive: it shows in 3D. "Flat" switches to the 2D drawing.
- On a headset or AR phone browser, press "Enter AR".
- `createCaseScene(case, label)` gives any screen the scene.

Who switches:
- **David:** nothing to change. A live phantom drive in 3D needs your physics server, and so does the physics-probe URL (still mine to do).
- **Vaibhav:** nothing. The XR controller feeds the same `ControlInput` as the gamepad.
- **Gibran:** for rehearsal, the demo now shows Plan, Compare and Drive in 3D. Use "Flat" if the demo laptop's GPU struggles.

Mock replaced: the 2D-only views (they stay as the Flat face).
Contracts version after this handoff: unchanged (1)
Tests:
- `pnpm test`: 759 passed, including the new `render/ar-math.test.ts`. It covers placement scales, the 72 fps target and 14 ms budget, the rolling budget trip, two-hand scale and turn, and the XR controller mapping.
- `pnpm exec playwright test`: 54 passed with `--retries=0`. The new `tests/e2e/a7-3d-ar.spec.ts` covers:
  - Plan opens in 3D, and Flat is remembered;
  - Drive X-ray in 3D shows the wire only with fluoro, and the puff fades to 0;
  - no "Enter AR" without immersive-ar;
  - with a stubbed `navigator.xr`, the button appears on Plan and Drive and says when AR is refused.
- `a8-demo.spec.ts` on the production build: 7/7, three runs in a row.
- Taste lint: 0 FAIL.
- Inspector: 0 FAIL on every screen with 3D, light and dark (`metrics/aroovee/A8/gate.md`, re-run section).
- Token check: clean.
New dependencies: none (`three` came with D5).
Decisions logged:
- The 3D views with a Flat face.
- three.js loaded on demand.
- A7 built but unverified on a headset.
- The demo's fixture-y drive uses Flat.

Known gaps:
- **AR is unverified on a Quest 3.** Placement, grabbing, two-hand scale, picking, the floating panel, controller driving and 72 fps need a person in a headset. Everything that can run without one is tested.
- **The 3D scene in headless Chromium is drawn in software,** so automated tests read the view's data attributes, not pixels.
- **Clicking a branch handle in 3D was checked by hand,** not in Playwright: the handle's screen position depends on the camera.
- **The Results replay view stays 2D** (see DESIGN.md).
- **The physics probe still needs pointing at David's server.**
