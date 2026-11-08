# Request — to David from Aroovee: redeploy the integration/hands-voice preview (Vercel rate limit)

What I need: a fresh Vercel preview of `integration/hands-voice` at its current head, so Gibran can rehearse the latest build before the 06:00 EST cut-off.

Why: Vercel refused the last deploys on PR #73 with "Deployment rate limited — retry in 24 hours" (the `build-rate-limit` link to the dz-ll team's plan page). The GitHub checks are green (client, crosscheck, physics-bridge), but the preview at https://threadsim-git-integration-hands-voice-dz-ll.vercel.app/ is still an older build. It is missing:
- hand push and pull on Drive, verified in rail and chain mode, and the wire stopping if the camera stalls (`11f602e`);
- the Drive Rail / Physics (beta) switch (#79, `8f65d8e`);
- likely "Hey Cathy, reset view" (`a212a70`), if that deploy was also refused.

Ways to get it, as far as I can tell (you know the account; pick what works):
- Upgrade the team's plan, or wait for the limit to reset, then **Redeploy** the latest `integration/hands-voice` deployment in the Vercel dashboard.
- If the limit is on Vercel's builds rather than on deployments, a build on your machine might get through: `vercel build` then `vercel deploy --prebuilt` from the branch. I haven't tested this against the limit.
- If neither works before 06:00: Gibran rehearses on a local build of the branch (`pnpm build && pnpm preview`), and we say so in the rehearsal notes.

Done when: the preview serves `8f65d8e` or later (the Drive HUD shows the Rail / Physics switch, and the Hands status says "Pushing." while the gun pose pushes).

## Answer

