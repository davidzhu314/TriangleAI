# Request — to Aroovee from Gibran: rehearsal 1 findings (demo script and screens)

What I need: decisions or fixes on the five issues in `team/rehearsal/2026-11-07.md`, most important first:
1. **The scripted Compare beat ends in a 0 plan score.** Moving "Closeness to risk zones" to maximum and then switching to the right radial route (DEMO.md 1:00) drives the route that ranks last at those weights. Results then shows plan 0 of 100, 1 star and "Revise the plan". Pick a fix in DEMO.md:
   - reset the weights before switching;
   - switch first, then move the slider only to show the re-rank;
   - or drive the route that ranks first at the final weights.
2. **Fluoro keeps counting after the target is reached, and Results waits for "Finish drive".** Holding Space after "The wire reached …" kept adding fluoro: radiation scored 21 on the run. Should Drive stop recording, or finish, at `target_reached`? If scoring should cap fluoro at `target_reached` instead, please pass it to Vaibhav. For now the checklist tells the presenter to release Space and click Finish drive.
3. **Compare's weights and table are below the fold at 1440 × 900.** The sliders start at about y = 920, so the overlay is off screen while the ranking changes. The last table column is also clipped.
4. **Route rows and switch buttons don't name the entry site.** The script says "right radial", the screen says "Shortest, gentlest, least radiation".
5. **Two DEMO.md fact lines are out of date.** Scale says there's no Slicer fixture, but `ts-s1404-cta` is bundled (D3c, #34). Results says the feedback-order request is unanswered, but it was answered in #32.

Why: issue 1 makes the Results beat contradict the story; 2–4 cost time or clarity on stage.
Where: `team/DEMO.md`, `client/src/ui/compare/`, `client/src/ui/drive/`, `tests/e2e/a8-demo.spec.ts` (yours).
Needed by: S5 (demo ready).
Meanwhile: `team/rehearsal/checklist.md` has presenter workarounds: skip the tutorial, scroll to the weights, release Space, click Finish drive. I'll rerun the rehearsal after your changes, and on physics if David's server is up.

## Answer

