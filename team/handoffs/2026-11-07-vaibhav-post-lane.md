# Handoff — Vaibhav post-lane: wording, demo-path test, replay timeline

What landed:
- **Aroovee's voice-review wording** (from `lane/aroovee` 35aad5b):
  - `plan.too_narrow` → "…narrows to {diameter_mm} mm, and the {preset} wire needs {required_mm} mm."
  - `drive.fidelity_drift` → "On average the tip ran {mean_mm} mm from the planned centerline; {zero_mm} mm or more scores zero."
  - The proximity unit in `plan.top_contributor` is now "points".
  - The golden results are regenerated, and a field-by-field diff shows that only feedback `text` changed: three lines in three files, no number.
  - The open request file stays in `team/requests/`, so #17's move to `done/` merges cleanly in either order.
- **`client/src/score/demo-path.test.ts`:** the engine half of `team/DEMO.md` on real case files through `loadCase`.
  - **The beats:** Plan (a frontier; on type-iii, at least 3 routes and the right-femoral route flagged at 117–123°), Compare (two weight sets give two orders), Drive (`RailWireSource` with `autoDrive`: target reached, no wrong branch or prolapse), Results (`scoreCase`: reached, at least 1 star, at least one feedback line, every number grounded, byte-identical twice) and Progression (open mode unlocks the demo case; ladder mode starts at the lowest tier).
  - **Status:** fixture-y passes today.
  - **type-iii:** its cases turn on by themselves when D6-min lands, with the Drive beat marked `it.fails` and linked to the drivability request. With David's cases copied in temporarily, Plan, Compare and Progression pass and Drive is the expected failure.
  - **Timing:** `metrics/vaibhav/demo-path-timing.md` (fixture-y Drive + Results: 226 samples, about 22 ms).
- **`replayTimeline(input)`** in `client/src/score/replay.ts`, exported from `score/index.ts`. It's for the §6.3 Replay screen, "the driven path over the best frontier route, with force spikes and wrong branches marked on the timeline". It returns:
  - `durationS`, equal to `drive.timeS`;
  - `drivenPath`, the sample tips;
  - `bestRouteId` and `bestPath`: the same best route as the gentleness reference (the new `bestFrontierRoute`), or the player's own route with no safe route;
  - one `markers` entry per event, ordered by t then kind. Each marker has the tip at or before the event, and a label from the new `replay.*` templates, so every number is in `values`.

  Pure. The guard tests cover the 6 new templates.
- **Request filed:** `team/requests/to-all-from-vaibhav-mediapipe-hand-input.md`, a proposal for optional webcam hand input. Nothing is built.

Who switches:
- **Aroovee:** `replayTimeline` is on offer for the Replay screen; you decide whether to use it. Results already has everything from `scoreAttempt`. Please answer the MediaPipe request.
- **David:** please answer the MediaPipe request. The type-iii drivability request is still open; the review note for #13 repeats it with a suggested place in the seed search.

Review notes: written for my human to post on #13 (D6-min) and #17 (A2). The team has no reviews folder, so they're outside the repo.
- **#13:** merges cleanly with `main` and passes the full suite (542 + 164). The anatomy and fluoro budgets are fine, and its tests already assert 120° and at least 3 frontier routes. **Blocking:** every type-iii frontier route still ends in a wrong branch. Low-tort's soft angled route to lcca does too.
- **#17:** the engine is used only through its public entry points, the Library uses the V6 helpers, open mode is on, storage is guarded, and the badges come from `engineMode` and `planningOnly`. One fix suggested: filter malformed history records, so a bad seq can't make V6 throw while the Library renders.

Mock replaced: none
Contracts version after this handoff: unchanged (1)
Tests: `pnpm test` gives 543 green and 5 skipped (the type-iii demo-path cases and the D6 check), twice in a row. `python -m pytest tests/crosscheck -q` gives 164 green. The build is clean, with no mock markers.
New dependencies: none
Decisions logged: none (wording and helpers within existing decisions).
Waiting on others:
- David's type-iii retune, then the `cannot_steer` contract.
- D6-min (#13) merging, for the integration (cross-checks, rail acceptance, timings, progression, a type-iii golden). The demo-path type-iii cases turn on when it lands.
- The team's MediaPipe decision.
