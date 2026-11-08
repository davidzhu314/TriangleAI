# Handoff — David, chain simulation: arch cases drivable, and a `?wire=chain` dev switch

What landed (onto `integration/hands-voice` by PR; main is untouched):
- `client/src/wire/physics-chain.ts`: the solver is reworked.
  - Follow-the-leader feed.
  - Position-based body behind joint-based shaped tips.
  - Wall sliding keeps headway away from the entry, so the wire no longer coils or corkscrews.
  - Load counts only the bend beyond the vessel's own curve, so a clean push no longer saturates the risk index.
  - Torsion stick uses mean contact and is capped at 90°, so the tip roll no longer freezes.
  - 5 mm progress window.
  - A wrong branch is counted when the tip is outside every planned vessel by 2 mm, not by edge label at a junction.
  - New: `shapedTipAim()`, which gives where the shaped tip is turned to point.
- `client/src/wire/physics-chain-autopilot.ts` (new, tests and probes only): a scripted driver with the player's controls (push, pull, wire roll). It aims at planned junctions and backs off and re-rolls on a wrong branch or a stall. It is a fixed rule set and computes no route or score.
- `client/src/wire/physics-chain-lumen.ts`: `query(p, only?)` can be limited to a set of edges.
- `client/src/wire/select.ts`: default-off dev switch. `?wire=chain` in the page URL drives any case on `ChainWireSource`, loaded lazily (its own 18 kB chunk). Without the flag nothing changes: rail, or physics for phantoms.

How to use: `pnpm dev`, then open `http://localhost:5173/?wire=chain#/case/low-tort/plan`, plan a route, and press Drive.
- W/S push and pull, A/D roll the wire, Space fluoro, C contrast.
- The mode label reads "chain mode".
- It also works on the integration preview URL with `?wire=chain` once this merges there.

Who switches: nobody has to. Aroovee, once the Drive redesign draws device selection, pulse rate and the imaging states, select.ts can offer chain properly (a request to David).
Mock replaced: none.
Contracts version after this handoff: unchanged (3 on the integration branch).
Tests: `pnpm test` (all green: 1146 passed).
- `physics-chain.test.ts` adds drivability: the scripted driver reaches the target on every low-tort frontier route (rcca, lcca) and on the type-iii right-radial routes to rcca.
- It also checks that a clean push keeps up with the feed at low risk.
- The branch-by-roll test now pulls the angled catheter back first, since the catheter's angle also aims the wire.

New dependencies: none.
Decisions logged: DECISIONS.md 2026-11-08 "Chain simulation: follow-the-leader body, and drivability is tested".

Known gaps:
- Type III from the femoral or the left radial: the wire alone does not select the LCCA, and from the femoral not the BCA either. Roll sweeps at those junctions confirm no wire roll does it. The catheter makes the BCA reachable from the left radial; the scripted driver does not use the catheter yet.
- Constants are illustrative and not calibrated by a person playing it. The risk index and wall force (up to about 3 N when the tip is pushed into a dead end) need a feel pass.
- The body keeps any lean it is given (follow-the-leader). With the angled catheter just behind the wire, the wire favours the catheter's side; rolling the catheter changes that.
