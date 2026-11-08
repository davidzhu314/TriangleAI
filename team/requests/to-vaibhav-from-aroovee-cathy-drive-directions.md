# Request — to Vaibhav from Aroovee: Cathy's Drive directions confuse vessels that share a name

What I need: `driveAssist` (`client/src/score/live.ts`) and its templates (`client/src/score/templates.ts`) should name directions by **vessel**, not by **edge**, so a trainee is never told to "head into" the vessel they're already in, or pointed back at a branch whose opening they've just gone past. Two cases, both reproduced on `low-tort`, target `rcca`, its first frontier route (`e_r_iliac > e_aorta_desc > e_arch_distal > e_arch_proximal > e_bca > e_rcca`). Four of those edges, plus `e_aorta_asc`, are all the vessel "Aorta".

1. **"Next, head into the Aorta" while in the Aorta.** With the tip in `e_aorta_desc`, `nextEdge` is `e_arch_distal`, also "Aorta". Suggest: when the next edge is the same vessel, skip ahead to the next edge whose vessel differs, and say so: *"Keep going up the Aorta. The next branch is the Brachiocephalic trunk."* (new template, for example `assist.keep_going`).
2. **Overshooting an opening.** Pushing straight in rail mode, the tip goes past the brachiocephalic opening into `e_aorta_asc` (off the plan) at t ≈ 28 s, and Cathy says *"You're in the Aorta. Pull back toward the Brachiocephalic trunk."* The direction is right, but the trainee hears "you're in the Aorta" (they think they're on route) and is pointed at a branch they never entered and have gone past. Suggest: when the off-plan edge has the same vessel name as a planned one, or leaves from the node where `backToEdge` starts, say: *"You've gone past the opening of the Brachiocephalic trunk. Pull back until the tip is at the opening, then rotate toward it."* (for example `assist.past_opening`, values `{ vessel }`).

Also seen in the Physics (beta) chain, same route, push only: at the moment the tip reaches the right common carotid, "how am I doing" leads for a few seconds with the force line ("Peak force was 2.851 N against 0.357 N…") before "You're at the Right common carotid". `assist.at_target` should probably lead as soon as `reachedTarget`.

How I reproduced it: a throwaway Vitest probe (not committed) drove `RailWireSource` and `ChainWireSource` on a manual clock with push = 1, rotate = 0, and called `driveAssist` once a simulated second. The rail sequence was:
- t=0 `e_r_iliac`: "Next, head into the Aorta."
- t=11 `e_aorta_desc`: "Next, head into the Aorta."  ← case 1
- t=27 `e_arch_proximal`: "Next, head into the Brachiocephalic trunk."
- t=28 `e_aorta_asc`: "You're in the Aorta. Pull back toward the Brachiocephalic trunk."  ← case 2

Nothing to change on the screens: Plan, Drive and the Cathy box show `lines[0].text` as the engine writes it. A test in `live.test.ts` on `low-tort` for both cases would keep it fixed.

Timing: before the demo if it's a template change you're comfortable with; otherwise after.

## Answer


2026-11-08 · Vaibhav: **done** on `vaibhav/cathy-directions` (draft PR). All three, with your wording, tested on `low-tort` in `client/src/score/live-directions.test.ts`:
1. **Same vessel next:** "Keep going along the Aorta. The next branch is the Brachiocephalic trunk." (`assist.keep_going`; it says "along", not "up", since the same line serves routes going down). When the target is in that same vessel, it's "Keep going along the {vessel}. The {target} is ahead." (`assist.keep_going_target`).
2. **Past the opening:** "You've gone past the opening of the Brachiocephalic trunk. Pull back until the tip is at the opening, then rotate toward it." (`assist.past_opening`). It's used when the tip is off the plan in a vessel the plan also uses, and the way back is a different vessel. A real wrong branch into a differently named vessel still gets "You're in the X. Pull back toward the Y."
3. **Reaching the target:** on the last planned edge before the target, "You're on the plan. The Right common carotid is ahead." now leads, so the force line no longer comes first. `assist.at_target` still leads once `target_reached` fires.

`assist_check` ("am I on the right path") uses the same lines. One blocker: Gibran's `tests/engine/cathy-grounding.test.ts` pins the old edge-by-edge lines (26 tests), and I need his OK to update it.
