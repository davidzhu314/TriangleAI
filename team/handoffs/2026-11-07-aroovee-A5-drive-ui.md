# Handoff — Aroovee A5, part 1: the Drive screen (wire not connected yet)

**A5 is not finished.** Its acceptance needs a wire, and the screen may only get one through `client/src/wire/select.ts`, which doesn't exist on main. Everything that doesn't need the wire is built. PR #17 now carries A2, A3, A4 and this part of A5.

What landed:
- **Drive screen** (`client/src/ui/drive/`), laid out from Aroovee's mockup and answering "Where is my tip, and am I pushing on the wall?":
  - **Case panel:** "Training case (not a patient)", with the current vessel, distance to the target, fluoro used against the case's budget (with a meter), and wall force (illustrative, on a meter with the force-spike threshold marked).
  - **Controls legend:** push/pull W/S, rotate A/D, hold for fluoro Space, contrast puff C, with the A1 icons. Each key chip is also a press-and-hold button, for mouse and touch.
  - **Top centre:** the view label ("Front view · rail mode", or "wire not connected"), the Front/X-ray switch, and a banner. The banner shows the wall-force warning, fluoro over budget, target reached, the fallback notice from `onFallback`, or "not available yet".
  - **Route overview** (top right), and Restart and Exit to case (bottom right).
  - **Difficulty ladder (spec §5.5):** intermediate cases dim the front view, and expert cases are X-ray only.
  - **Hidden on purpose:** no honesty line on the Drive HUD.
- **Input** (`ui/drive/input.ts`): the keyboard and gamepad mapping to `ControlInput` (spec §5.4), with the contract's 0.15 dead zone rescaled to reach ±1, fluoro as hold-to-activate, and one puff per press. A per-frame loop sends each frame to the wire once there is one.
- **View** (`render/drive-view.ts`):
  - Front view: translucent vessels, the planned route as a ghost trail, and an opaque wire with its tip.
  - X-ray: a grey ground. The wire shows only while fluoro is held, and the vessels appear as a dark silhouette only during a contrast puff, fading over `--duration-contrast-fade`.
  - It sits behind a `DriveView` interface for the later three.js scene.
- **Wire connection:** `import.meta.glob('../../wire/select.ts')` finds David's selector when it lands. It expects `selectWireSource(c: LoadedCase): Promise<WireSource>`, requested in `team/requests/to-david-from-aroovee-select-ts.md`.
- **Left out:** the mockup's hand-tracking panel and gesture chips, since the team answered hand input "after the demo".

How to use: Plan → Compare → "Start drive", or `/#/case/<key>/drive` once a plan is saved. With no plan, Drive says so and links to Plan.

Who switches: David — add `select.ts`, rail first (request filed). The three.js and physics-index requests are still open.
Mock replaced: the A4 Drive placeholder.
Contracts version after this handoff: unchanged (1)

Tests:
- `pnpm test`: 637 green, including the mock guard. New: `ui/drive/input.test.ts`, covering the dead zone, keys, fluoro hold, one puff per press, the gamepad axes and trigger, and keys combined with the stick.
- `pnpm exec playwright test`: 24 green and 1 fixme (WebGL), twice in a row. `tests/e2e/a5-drive.spec.ts` covers:
  - no plan → Plan, in words;
  - without a wire: dashes in the HUD and the "not available" banner, never made-up values, and no honesty line on the HUD;
  - keys lighting their controls, with Space as fluoro;
  - X-ray with a contrast puff that fades;
  - the expert case (type-iii) being X-ray only.
- Taste v2.1.5 `lint.mjs` on my folders: 0 FAIL, 1 WARN (`default-font`, Inter).
- `inspect.mjs --app`, Drive at 1440, 768 and 390: **0 FAIL and 0 WARN in light and dark**, after two layout fixes:
  - the route overview was drawn behind the case panel;
  - the left column was too tall, so the controls were compacted to the mockup's four rows and the overview moved top right.
- Token check: clean.
- Screenshots: `metrics/aroovee/A5/`: front view at 1440 in light and dark, X-ray during a puff, and 390 in light and dark.

New dependencies: none.

Decisions logged:
- `select.ts` is found by glob.
- Drive HUD values are contract fields with one step of arithmetic.
- The mockup's hand-tracking parts are left out, and the view stays 2D until three.js.

Known gaps:
- **No wire, so no driving.** A5's acceptance (drive to the target on rail, the HUD live, the fallback notice tested) waits on `select.ts`. The code paths for live state and fallback are written but untested against a real source.
- **3D:** the 3D drive view waits on three.js.
- **Type III in 2D:** the front view flattens the arch, so its branches overlap. three.js would fix this.
- **Plan's view on Type III:** walking Type III in Plan's 2D view is harder to follow than on fixture-y. The keyboard list of next steps still works.
