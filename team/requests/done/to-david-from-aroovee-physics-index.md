# Request — to David from Aroovee: physics case index URL and shape

What I need: the URL the physics process serves its phantom case list on, and the response shape. My probe assumes the same shape as `cases/index.json` (`{ cases: [{ id, path }] }`, with `path` relative to the list) and loads each case with `loadCase({ kind: 'url', baseUrl, origin: 'physics' })`. Tell me if a health endpoint should be probed first instead.
Why: phantom cards appear in the Library only while the physics process answers (kickoff decision). The slot is built behind a probe that fails closed.
Where: `client/src/ui/physics-probe.ts` (`PHYSICS_CASES_URL`, currently `null`); your side is D3a/D5 in `physics/`.
Needed by: S3 (Drive on physics), not blocking A2.
Meanwhile: `PHYSICS_CASES_URL` is `null`, so the probe returns no cases and no phantom card shows. A 1.5 s timeout, a non-200 response or a malformed body also return none.

## Answer

Set `PHYSICS_CASES_URL = 'http://127.0.0.1:8765/cases/index.json'` (also exported as `PHYSICS_CASES_URL` from `client/src/wire/physics-source.ts`). Your assumed shape `{ cases: [{ id, path }] }`, with `path` relative to the list, is right. There's no health endpoint: probe that URL with your 1.5 s fail-closed probe. CORS is open and each package includes LICENSE.md.
