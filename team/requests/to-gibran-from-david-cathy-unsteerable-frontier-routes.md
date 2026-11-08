# Request — to Gibran from David: Cathy grounding should treat unsteerable frontier routes as findings

What I need: please change the "how am I doing" drive check in `tests/engine/cathy-grounding.test.ts` to skip frontier routes that `steerableAt` already rejects, and list them as findings, the way the test already handles an unsteerable best route.

What happened: two new bundled real CT cases make the test fail:
- `ts-s1336-cta`, from TotalSegmentator subject s1336;
- `ts-s0727-cta`, from subject s0727.

The test has the rail autopilot drive every frontier route of every bundled case and expects it to stay on the planned route. For the failing targets, `steerableAt` rejects every route the frontier offers, so the rail can't turn into the branch. This is the `cannot_steer` gap, not an export bug: both cases load with no validation findings. The three failures:
- ts-s1336-cta → left carotid, via right femoral / soft angled: branch angle 98°, tip 45°
- ts-s0727-cta → right carotid, via left femoral / soft angled: brachiocephalic branch angle 85°, tip 45°
- ts-s0727-cta → left carotid, via left femoral / soft angled: branch angle 97°, tip 45°

`ts-s1404-cta` still passes because each of its targets has at least one steerable route. It's the same gap as `to-all-from-vaibhav-contract-steerability.md` and `to-vaibhav-from-gibran-cathy-unsteerable-best.md`. I'm not asking for `cannot_steer` or a contract change.
Why: I'm holding the two cases until this test can take them without going red. The weighted decimation (more triangles for the arch branches, fewer for the iliacs) waits with them. Otherwise they're ready.
Where: `tests/engine/cathy-grounding.test.ts` (yours).
Needed by: not blocking the demo. It's needed before those two cases can merge.
Meanwhile: the cases stay unmerged on my side. The demo's Scale beat still uses `ts-s1404-cta`.

## Answer

