# Handoff — David (for Aroovee): 3D shading and framing

What landed:
- **Shading (`client/src/render/scene3d.ts`):**
  - The vessel walls render front faces only and get denser and darker toward the silhouette (a fresnel term added with `onBeforeCompile`), so they read as tubes.
  - Lighting: hemisphere 0.9 (was 2.2), a soft light from above at 0.6, and a key light at 2.2 that moves with the camera.
  - Colour and base opacity are still `--color-scene-vessel` and `--opacity-scene-vessel`; there is no new token.
  - `setVessels({ …, wall: false })` keeps the old flat, double-sided look; Drive's X-ray uses it.
- **Framing:**
  - `client/src/render/framing.ts` (+ test): `closeUpBox(case)` covers the targets and the branch points their vessels leave from (the arch and carotids), padded. It is null when the close-up would be more than half the tree (fixture-y).
  - `scene.frame('close' | 'whole')` eases over `--duration-slow`, or jumps under reduced motion, and keeps the orbit direction.
  - The view toolbar gets a "Close-up | Whole tree" switch (`.segmented`, beside 3D | Flat); it hides in Flat. The switch exposes `data-frame` on the view.
  - Compare opens on the close-up. Plan and Drive open on the whole tree and follow (`dual.follow`) into the close-up once the route's end or the wire tip reaches it. Picking a framing stops the follow.
- **DESIGN.md:** the Known Gaps 3D note describes both.

How to use: open any arch case in 3D. Gibran: on rehearsal, the Plan view now closes in on the arch as the route reaches it, and Drive does when the tip gets there.
Who switches: Aroovee: review the look in both themes. AR still uses the whole-tree placement, and the key light follows the screen camera, not the headset.
Mock replaced: none
Contracts version after this handoff: unchanged (1)
Tests:
- `tsc` + `vitest run` on this commit, in a clean worktree without my uncommitted CT cases;
- framing unit tests;
- `playwright test`, including two new a7 framing tests.
Counts are in the PR.
New dependencies: none
Decisions logged: DECISIONS.md 2026-11-07 "David (for Aroovee): 3D shading and framing"
Known gaps:
- Body context (item 3) is parked as a contract change.
- Compare's 3D well is still about 232 px at 1440 × 900; the close-up makes it more useful, but it isn't taller.
- The wall look is checked in Chromium's software renderer only, not on a GPU or a Quest 3.
