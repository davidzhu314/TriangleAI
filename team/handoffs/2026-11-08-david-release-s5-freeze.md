# Handoff — David (release manager): S5, merge freeze, demo decisions

**Merge freeze on `main`, from 2026-11-08 until the demo is over.** Vercel deploys every merge straight to https://threadsim.vercel.app. Only demo fixes merge, each with CI green and David's OK. Everything else waits: PR #68 (body context), #22, and any other feature.

What landed (DECISIONS.md, 2026-11-08):
- **S5 reached, main at 392dbad.**
  - A8: 7/7 twice; full Playwright: 61 passed, 1 fixme.
  - Taste inspector: 0 FAIL on the six screens at 1440, 768 and 390 px, light theme.
  - V7, A8, D7, A7, G1 and G2 are merged.
- **Drive leads with rail** on `type-iii`. The presenter says "the wire", not "physics wire". DEMO.md's Drive line and "open choice" note are updated, which David did in Aroovee's place with her OK.
- **AR is not presented:** it stays an unverified bonus.
- **CC BY-SA (Gibran's request):** nothing share-alike goes in `client/` before the demo. `assets/vascular/` stays where it is, with a CLAUDE.md row naming Gibran as owner.

Who switches:
- **Everyone:** respect the freeze, and send demo fixes only.
- **Aroovee:** check the DEMO.md wording. Add your answer line to `to-all-from-gibran-license-vascular-assets.md`, then it can move to done.
- **Gibran:** the next rehearsal is rail only.
- **Vaibhav:** #22 waits until after the demo.

Contracts version after this handoff: unchanged (2)
Tests: run on main at 392dbad. `vitest run` and the build were green on the body-context branch built on it.
New dependencies: none
