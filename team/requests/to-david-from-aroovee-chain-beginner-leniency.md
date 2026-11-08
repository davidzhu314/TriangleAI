# Request — to David from Aroovee: the Physics (beta) chain is too unforgiving on low-tort's right carotid

What I need: make the chain simulation more forgiving where a person can't see or control what it's doing, at least on beginner cases, without making it wrong. Three candidates, your call on which:

1. **Less stored twist.** `stickMaxRad` is π/2: the tip can lag the hub by up to 90° and then whip. A person twisting toward a 21–53° opening can't aim through that; the new twist readout (draft #95) shows tip and hub separately, but the jump still overshoots. Suggest a lower cap for beginner cases (for example 30°), or a faster catch-up.
2. **Opening capture.** The wall-slide rule re-aims a blocked link toward "the direction furthest along the vessel", which carries the tip past the brachiocephalic opening into the ascending aorta. When the shaped tip points within some angle of a branch's opening and the trainee is pushing, let the tip enter it (like the rail rule) before the slide carries it on.
3. **The case itself.** `low-tort` is the beginner case, and its right carotid target needs the 68° brachiocephalic take-off (measured below). If the beginner case should teach the controls first, the left common carotid could be the default target, with the right as the second step. That's a case-data choice, yours.

What I measured (throwaway probes, not committed), `low-tort`, `fem_r` to `rcca`:
- **Your scripted driver**, which aims perfectly, still takes 7–8 wrong branches, about 60 s and 50–113 force spikes per route.
- **One twist at the start, then only push:** 1 of 12 starting twists reaches the right carotid. 10 of 12 reach the left.
- **The geometry:** at `n_bca_o` the brachiocephalic trunk leaves 68.4° from the wire's heading; the ascending aorta carries straight on (9.2°). A 45° Soft angled tip is 23° short of it, which is why rail's window is 21° (25° tolerance). I've asked Vaibhav to widen that tolerance for beginner cases (`to-vaibhav-from-aroovee-branch-entry-tolerance.md`); it would help if the chain agreed with rail on roughly how forgiving an opening is.

Not asking for: perforation, loops, or anything that makes the model less honest. The aim is that a person with the dial and slow twist can do what your scripted driver does.

Timing: after the demo.

## Answer

