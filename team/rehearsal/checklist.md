# Demo rehearsal checklist

Owner: Gibran (G2). Source: `team/DEMO.md` (Aroovee's), beat by beat. This file adds what to click, what should appear, and what to check. It never changes a beat: beat changes and fact lines go through Aroovee or a to-all request. Record each run in `team/rehearsal/<date>-<n>.md`, and file each bug to its owner (`team/lanes/gibran.md`, "Where bugs go").

Updated after rehearsal 1, for the fixes in #50 (David, in Aroovee's place) and #51 (Vaibhav).

## Before the run

- [ ] Latest `main`, then `pnpm install`, `pnpm build` and `pnpm preview` (the production build at http://localhost:4173). The demo runs on the production build, not `pnpm dev`.
- [ ] Browser at 1440 × 900, light mode, zoom 100%, one tab. Clear site data (or use a fresh profile), so the Library starts with no stars.
- [ ] Fresh browser: the guided tutorial popover opens over the Library's case list. Click "Skip tutorial" before the demo starts.
- [ ] Physics: is `python -m server` running in `physics/`? If it is, http://127.0.0.1:8765/cases/index.json answers and phantom cards show in the Library. If not, every case says "Planning only" and drives on rail. Note which one this run used.
- [ ] For the Scale beat: a `case.zip` of `ts-s1404-cta` on the desktop. Zip the three files in `client/public/cases/ts-s1404-cta/`.
- [ ] Backup video at hand: `metrics/aroovee/A8/demo-backup.webm` (kept out of git; ask Aroovee).
- [ ] Timer ready. Time each beat from its first click to the moment its "should appear" items are all on screen.

## Beats

| Slot | Beat | Do | Should appear | Check | Fallback (`team/DEMO.md`) |
| --- | --- | --- | --- | --- | --- |
| 0:00–0:20 | **Problem** | Narrate over the Library. | The Library with its cases, and the honesty line at the bottom. | Figures used are only the spec §10.1 ones: about $200,000 per simulator, $630,000 for 12 compact units plus software, and 58% with lab access but 17% with 1–3 sessions a year. | Narration only. |
| 0:20–1:00 | **Plan** | Open "Type III arch, right carotid target", then "Start planning". The defaults are right femoral, right common carotid and soft angled. Click the "next step" buttons six times, to the right carotid. | After the first step: "Blocked: the 120° turn into the Right iliac to femoral is sharper than the Soft angled wire can take (110°)." Live costs update with each step. | Every number has a tooltip naming its formula, and the presets are labelled illustrative. | If type-iii is missing, use `fixture-y` and say "a simple Y-branch case". |
| 1:00–1:40 | **Compare** | Click "Compare routes". Move "Closeness to risk zones" to its maximum, then **put it back to where it started** (every weight reads the same). Then switch to "Right radial (shortest, gentlest, least radiation)", soft angled. | The overlay and sliders side by side, with the full table under them and no scrolling. 3 rows, each naming its entry. Right radial ranks first at equal weights. At maximum risk weight, left femoral goes first and right radial last. Back at equal weights, right radial is first again. | The ranking visibly changes, routes differ by line pattern and label, not colour alone, and nothing says "optimal". | If fewer routes show, say "the frontier shows its best routes". |
| 1:40–2:20 | **Drive** | "Start drive". Hold Space for fluoro, press C to puff contrast, and hold W. | Expert case: X-ray only. The wire is visible while fluoro is held, vessels show for about 1.5 s after a puff, and the HUD shows the force meter, fluoro budget and distance to target. The target is reached in about 21 s, with no wrong branch. | The mode label says rail (or physics, if that's live). Fluoro used **stops rising** once "The wire reached the Right common carotid." appears. If the physics fallback notice appears, say so aloud. | Rail on type-iii. A physics drive needs a phantom case, which is the open choice in `team/DEMO.md`. |
| 2:20–2:45 | **Results** | Click "Finish drive" (Results doesn't open by itself). | Plan 100 of 100, 3 stars, and the lead line "Your route is the best available at your own weights." with "Retry the drive" beside it. Below that, the drive score table and the replay timeline with event marks. | No "Revise the plan" next to praise. Every number in the feedback has a tooltip. | None: scores come from the live log. |
| 2:45–3:00 | **Scale** | Back to the Library. Drag the `ts-s1404-cta` `case.zip` onto "Drop a case.zip here" (or use "Choose a case.zip"). | It validates, loads, and shows as "Imported this session". | Say it was exported with 3D Slicer from a public CT dataset (TotalSegmentator, CC BY 4.0). | Import a generated `case.zip`, and describe Slicer export honestly. |

## Never say

"Realistic catheter simulation", "safer for patients", "clinically validated", or "optimal route" without the trade-offs on screen (spec §9.4).

## After the run

- Total time against 3:00, and each beat against its slot.
- Anything slow (over 1 s with no feedback), confusing, or wrong goes in the run file, with the owner named.
- File a request per bug, attaching a failing test or exact steps.
