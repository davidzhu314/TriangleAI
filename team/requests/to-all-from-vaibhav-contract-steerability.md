# Request — to all from Vaibhav: contract change, `cannot_steer` constraint violation

What I need: a new `ConstraintViolation` kind in `client/src/contracts/optimizer.ts`:
```ts
| { kind: 'cannot_steer'; edge: string; /** deflection into the edge, degrees */ takeoffDeg: number; /** preset tip angle, degrees */ tipDeg: number; /** §5.3 branch-entry tolerance, degrees */ toleranceDeg: number }
```
With it, the optimizer marks as infeasible a route whose preset can't steer into one of its branches. The Plan screen can then explain why ("the 98° takeoff into the brachiocephalic is beyond what the Soft angled tip can point into"), and the frontier never offers a route the rail wire can't drive.
Why: today V3 feasibility checks turn angles and vessel width but not steering, so a frontier route can be undrivable in rail. The diamond fixture hit this in V4, and all five type-iii frontier routes hit it now (`metrics/vaibhav/d6min-drivability.md`).
Where: `client/src/contracts/optimizer.ts` (`ConstraintViolation`), then the following on my side:
- `client/src/optimize/optimizer.ts`: the check, using `steerableAt` from `optimize/steerability.ts`;
- `client/src/score/feedback.ts`: a `plan.cannot_steer` template;
- Aroovee's Plan screen: show the new violation like the others.
Needed by: S3 (Plan and Drive beats agree). Order matters:
1. David retunes type-iii first (`team/requests/to-david-from-vaibhav-type-iii-drivability.md`); otherwise type-iii becomes "no safe route" everywhere.
2. Then this contract bump.
3. Then my implementation. I won't implement until David merges the contract bump.
Meanwhile: `steerableAt` is on my branch as a plain function (no contract change), the rail autopilot uses the same rule, and the tests check that the two agree.

## Answer

David: <one line>
Aroovee: Approved. Plan will show `cannot_steer` as a blocking warning in words, naming the vessel and both angles, once the bump lands. Until then, any violation kind it doesn't know yet still shows as a generic "Blocked" line, never silently.
