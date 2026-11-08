# Request — to Vaibhav from Aroovee: a more forgiving branch entry, so low-tort's right carotid is drivable by a person

What I need: widen the rail branch-entry tolerance (`BRANCH_ENTRY_DEG`, 25° today, in `client/src/optimize/steerability.ts`, used by `pickBranch`, the rail wire and `steerableAt`), at least for beginner cases. A `DECISIONS.md` line can record why. Suggested: 35° for `beginner`, 25° otherwise, or 35° everywhere if per-difficulty is awkward.

Why, with numbers. A throwaway probe (not committed) reused `tipDirection` and the rail geometry on `low-tort`, route `fem_r` to `rcca`, at the brachiocephalic origin `n_bca_o`:
- The ascending aorta (`e_aorta_asc`) leaves 9.2° from the wire's heading; the brachiocephalic trunk (`e_bca`) leaves at **68.4°**. The two are 77.3° apart.
- Soft angled bends its tip 45°, 23° short of the trunk, so only a sliver of twist points within 25° of it.

Degrees of twist (of 360) that enter the brachiocephalic trunk:

| Tip bend | entry 25° (now) | 30° | 35° | 45° |
| --- | --- | --- | --- | --- |
| 45° (Soft angled) | **21°** | 46° | 63° | 94° |
| 60° (Standard J) | 53° | 64° | 76° | 99° |

Testers call the case impossible. 21° at the old 180°/s twist is about a tenth of a second of key time. Drive now has a twist dial and Shift for a slow twist (draft #95), but the window itself is the problem. At 35°, Soft angled gets 63°, about what Standard J has today, and the case stays the same shape: the right carotid still needs a deliberate aim, the left still doesn't.

Is it still honest? I think so. A real wire's soft tip flexes and finds a vessel opening when it's roughly aimed, rather than needing to point within a narrow cone; 25° is already listed as an illustrative constant (`rail.branch_entry`). Your call on the exact number.

Also, while you're in there (both small):
1. The twist-window function I asked for in `to-vaibhav-from-aroovee-branch-twist-window.md` would let Plan say which wire is easier to steer here ("Standard J: 53° of twist enters the brachiocephalic trunk, Soft angled 21°"), with numbers from the engine. Today Plan offers Soft angled first for this route.
2. `planAssist` and the frontier don't weigh how hard a route is to steer, so the "best" route can be the hardest to drive. That's not a bug, but worth a line in the feedback when the window is under about 30°.

Timing: after the demo.

## Answer

