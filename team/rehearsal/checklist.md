# Demo rehearsal checklist

Owner: Gibran (G2). Source: `team/DEMO.md` (Aroovee's), beat by beat. This file adds what to click, what should appear, and what to check. It never changes a beat: beat changes and fact lines go through Aroovee or a to-all request. Record each run in `team/rehearsal/<date>.md`, and file each bug to its owner (`team/lanes/gibran.md`, "Where bugs go").

## Before the run

- [ ] Latest `main`, then `pnpm install`, `pnpm build` and `pnpm preview` (the production build at http://localhost:4173). The demo runs on the production build, not `pnpm dev`.
- [ ] Browser at 1440 × 900, light mode, zoom 100%, one tab. Clear site data (or use a fresh profile), so the Library starts with no stars and the guided tutorial appears.
- [ ] Physics: is `python -m server` running in `physics/` (http://127.0.0.1:8765/cases/index.json answers)? If yes, phantom cards show in the Library. If no, every case says "Planning only" and drives on rail. Note which one this run used.
- [ ] Backup video at hand: `metrics/aroovee/A8/demo-backup.webm` (kept out of git; ask Aroovee).
- [ ] Fresh browser: the guided tutorial popover opens over the Library's case list. Click "Skip tutorial" before the demo starts.
- [ ] Timer ready. Time each beat from its first click to the moment its "should appear" items are all on screen.

## Beats

| Slot | Beat | Do | Should appear | Check | Fallback (`team/DEMO.md`) |
| --- | --- | --- | --- | --- | --- |
| 0:00–0:20 | **Problem** | Narrate over the Library. | The Library with its cases, and the honesty line at the bottom. | Figures used are only the spec §10.1 ones: about $200,000 per simulator, $630,000 for 12 compact units plus software, and 58% with lab access but 17% with 1–3 sessions a year. | Narration only. |
| 0:20–1:00 | **Plan** | Open "Type III arch, right carotid target", then start planning. Choose right femoral and soft angled, then build the route to the right carotid with the keyboard path. | Live costs (length, sharpest turn, narrowest point, risk) update with each step. A warning in words says the 120.1° turn on the right iliac is sharper than the soft angled wire takes (110°). | Every number has a tooltip naming its formula, and the presets are labelled illustrative. | If type-iii is missing, use `fixture-y` and say "a simple Y-branch case". |
| 1:00–1:40 | **Compare** | Go to Compare. Scroll down to the weights (they sit below the fold at 1440 × 900). Move "Closeness to risk zones" to its maximum, then switch to the right radial route ("Shortest, gentlest, least radiation": rows name the trade-off, not the entry site). | 3 rows: right radial, left radial, left femoral, each with soft angled and standard J, so 6 routes on 3 paths. Right radial ranks first at equal weights. At maximum risk weight, left femoral goes first and right radial last. | The ranking visibly changes, routes differ by line pattern and label, not colour alone, and nothing says "optimal". | If fewer routes show, say "the frontier shows its best routes". |
| 1:40–2:20 | **Drive** | Drive the right radial route. Hold Space for fluoro, press C to puff contrast, and hold W. **Release Space as soon as the target is reached**: fluoro keeps counting until Finish drive. | Expert case: X-ray only. The wire is visible while fluoro is held, vessels show for about 1.5 s after a puff, and the HUD shows the force meter, fluoro budget and distance to target. The target is reached in about 21 s with no wrong branch. | The mode label says rail (or physics, if that's live). If the physics fallback notice appears, say so aloud. | Rail on type-iii. A physics drive needs a phantom case, which is the open choice in `team/DEMO.md`. |
| 2:20–2:45 | **Results** | Click "Finish drive" (Results doesn't open by itself). | Plan score and drive score out of 100, stars, the lead feedback line with one action beside it, and the replay timeline with event marks. **Known issue (2026-11-07 run):** after the Compare beat as scripted, the right radial route ranks last at the player's weights, so the plan score is 0. | The action beside a `plan.best` lead line is "Retry the drive", never "Revise the plan". Every number in the feedback has a tooltip. | None: scores come from the live log. |
| 2:45–3:00 | **Scale** | Back to the Library. Import a case: drag in a `case.zip` (or use "Choose a case.zip"). | The case validates, loads, and shows as "Imported this session". | Say what's true about 3D Slicer: a Slicer-exported CT case (`ts-s1404-cta`, planning only) is bundled in the Library. | Import a generated `case.zip`, and describe Slicer export honestly. |

## Never say

"Realistic catheter simulation", "safer for patients", "clinically validated", or "optimal route" without the trade-offs on screen (spec §9.4).

## After the run

- Total time against 3:00, and each beat against its slot.
- Anything slow (over 1 s with no feedback), confusing, or wrong goes in the run file, with the owner named.
- File a request per bug, attaching a failing test or exact steps.
