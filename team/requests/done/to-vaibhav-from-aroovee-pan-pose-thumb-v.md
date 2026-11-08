# Request — to Vaibhav from Aroovee: the view-turning pose becomes "thumb + V"

What I need: change the pan pose (the one that turns the 3D case on three axes, `status: 'pan'`) from "index, middle and ring out, pinky folded" to **thumb + V**:
- thumb out;
- index and middle straight and spread apart in a V;
- ring and pinky folded.

Push it to `lane/vaibhav-input` (or straight to `integration/hands-voice`) and tell me; I'll update the screens' words, `team/DEMO.md` and the e2e tests the same hour.

Why: the team finds three fingers awkward and asked for the thumb with the index and middle fingers. Thumb up with index and middle *together* is the gun pose (push, pull, rotate the wire), so the two must be told apart by the gap between index and middle.

The catch, from `constants.ts`: `GUN.stay.barrelGapMaxDeg` is 55° (twisting a real hand opens the barrel to ~53°), and `GUN.enter` is 30°. So:
- A V narrower than ~55° keeps an engaged gun engaged: the wire keeps driving. Suggest the pan's `enter` needs a gap clearly above that (for example ≥ 65°), or that the V counts only when the gun isn't engaged, whichever the real clip says. A relaxed peace sign is often only 30–45°, so the on-screen words will say "spread them wide".
- Exclusive with point (middle folded there) and with the gun (gap), as today.
- `panAnchor`: the index and middle MCPs (the ring is folded now).
- The synthetic helper needs a way to spread index and middle (`spreadDeg` exists for the index; something like `{ flex: { ring: 1, pinky: 1 }, thumb: 'out', spreadDeg: 70 }` would do if the gap check reads it).

Unchanged on my side: `g.pan` (dx, dy) and `g.hands.Left/Right.pan` drive yaw, pitch and the two-hand roll exactly as now.

## Answer

Vaibhav: Done on `vaibhav/requests-batch` (PR into integration/hands-voice). The pan pose is now thumb + V: thumb out (thumbUp > 0.4 start / 0.2 keep), index and middle straight (≤ 0.45 / 0.6), ring and pinky folded (≥ 0.45 / 0.3), and the index–middle gap ≥ 65° to start, ≥ 45° to keep, so it can't start inside the gun's keep limit (55°); an engaged gun is never taken over (tested; the real-clip replay is unchanged). `panAnchor` is now the index and middle MCPs. For your e2e hands: `syntheticHand({ flex: { index: 0, middle: 0, ring: 1, pinky: 1 }, thumb: 'out', spreadDeg: 70 })` (`spreadDeg` widens the gap). `hands-voice.spec.ts` "the pan gesture moves the view" still builds the three-finger hand and now fails until you switch it. The Drive help card already says "Thumb out, index and middle straight and spread wide in a V". Untuned on a real hand: please try it in the lab.
