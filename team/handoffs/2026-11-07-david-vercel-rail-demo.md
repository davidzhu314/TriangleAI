# Handoff — David (between milestones): Vercel static rail demo

What landed:
- **`vercel.json`:** Vite preset, `pnpm install`, `pnpm build`, output `dist/`.
- **`.vercelignore`:** keeps the local physics venv, the CathSim clone and `physics/runs/` out of CLI uploads.
- **`.gitignore`:** ignores `.vercel`.
- **`playwright.config.ts`:** an `E2E_BASE_URL` override, so the e2e tests can run against a deployed copy; no local server starts then.

How to use:
- **Public URL:** https://threadsim.vercel.app.
- **Vercel project:** `threadsim` (team `dz-ll`), Git-connected to `davidzhu314/TriangleAI`, root directory `.`, production branch `main`, Node 22.x. Pushes to `main` deploy production, and other branches get preview deploys.
- **Check a deploy:** `E2E_BASE_URL=https://threadsim.vercel.app pnpm exec playwright test tests/e2e/a8-demo.spec.ts --workers=1`.

Who switches: nobody. Aroovee can present from the URL.
Mock replaced: none
Contracts version after this handoff: unchanged (1)
Tests: `pnpm test` is green. Against the live URL:
- `a8-demo.spec.ts`, every beat, passes: Library → Plan → Compare → Drive (rail on Type III, target reached) → Results, plus `case.zip` import and fixture-y end to end.
- `a6-results.spec.ts` passes, including the click-through "Library → Brief → Plan → Compare → Drive → Results on fixture-y, rail wire".
- `a2-library-brief.spec.ts` passes with one worker. With several parallel workers against the remote host, some import checks hit the 5 s expect timeout.
New dependencies: none. No secrets, environment variables, API keys or serverless functions. The Vercel project has no environment variables.
Decisions logged: none.

**This host is rail-only:**
- no physics process, so no phantom cards (`PHYSICS_CASES_URL` is `null` anyway);
- no live physics wire;
- no recorded-run replay, because none exist.

Every bundled case drives on the rail wire.

Known gaps:
- **Node version:** `package.json`'s `engines` is `>=22.12.0`, so Vercel warns it could move to a newer major. The project setting is pinned to 22.x. Pinning `engines` to `22.x` would remove the warning, but that would change the repo's engines rule, so I left it.
- **Tutorial test:** `a8-tutorial.spec.ts` doesn't load the deployed site (it starts its own local Vite server and harness). In remote mode it fails one localStorage check, and it passes in the normal local run.
- **Full suite against the remote host:** shows some flaky timeouts. The two A5 Drive tests are already with Aroovee.
