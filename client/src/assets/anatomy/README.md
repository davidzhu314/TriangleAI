# Anatomy layer: model and integration

The 3D views (Plan, Compare, Drive) can show an anatomical model behind the case: arteries and veins toggled apart, with labels, opacity and camera reset. The code is in `client/src/render/anatomy-*.ts`.

## What's here

- **`placeholder-vascular.glb`**: a stylized model, for UI work only. It is not anatomy: 6 arteries (arch and branches) and 4 veins (venae cavae, brachiocephalic veins) as simple tubes, in metres, Y-up. The layer fits it into each case's bounds and the controls say "Placeholder model".
- **`make-placeholder.mjs`** rebuilds it: `node client/src/assets/anatomy/make-placeholder.mjs . client/src/assets/anatomy/placeholder-vascular.glb`.

## Swapping in the real model (David)

1. **Put the GLB where the app can fetch it**, for example `client/public/anatomy/vascular.glb`, which serves at `/anatomy/vascular.glb`.
2. **Set two Vite env variables** (for example in `.env.local`, which is never committed):
   ```sh
   VITE_ANATOMY_GLB=/anatomy/vascular.glb
   VITE_ANATOMY_FRAME=ras-mm   # or yup-m if the file is already metres, Y-up
   ```
   - `ras-mm`, the default, places it with `RAS_MM_TO_YUP_M`, the same transform as each case's `vessels.glb`. It then lines up with the case if both share the patient frame.
   - With these set, the layer stops fitting and the "Placeholder" note goes away.
3. **Name or tag each vessel** so the layer can sort and label it:
   - **Best:** node `extras` (glTF `extras`, which three.js reads as `userData`): `{ "kind": "artery" | "vein", "label": "Left common carotid" }`.
   - **Otherwise by node name:** names starting `artery_`, `a_`, `vein_` or `v_`, or containing aorta, carotid, subclavian, iliac, vena cava, SVC or IVC. The label is then the name made readable (`artery_left_carotid` shows as "Left carotid").
   - Unsorted meshes still draw with the layer, but no arteries/veins toggle applies to them.
4. **Keep it light:** it loads only when a trainee turns the layer on, but AR draws it too. Aim for under 60,000 triangles, as with the case meshes.

## Guarantees

- **The case stays on top.** The route trace, frontier routes, markers and branch handles draw over the layer. The layer is translucent, writes no depth, and is never picked.
- **Nothing outside the screens changes.** No case data, physics or engine code changes, and nothing from the model reaches `optimize` or `score`.
- **Colours are tokens:** `--color-anatomy-artery`, `--color-anatomy-vein`, and `--opacity-anatomy` for the starting opacity, in light and dark.
- **Drive's X-ray hides the layer** without changing the trainee's settings.

## The interface

These are for other code, such as the assistant or voice after the demo. They're under review with Vaibhav in `team/requests/to-vaibhav-from-aroovee-anatomy-layer.md`.

- `dualView.anatomy()?.set({ veins: false })`, `.state()` and `.suppress(on)`
- `dualView.resetCamera()`
- The pure rules (`classify`, `labelFor`, `shows`, `AnatomyState`) are in `render/anatomy-model.ts`, which has no three.js or DOM in it.
