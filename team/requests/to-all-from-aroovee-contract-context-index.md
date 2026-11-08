# Request — to all from Aroovee: say in cases/index.json which cases have a context.glb (contract)

What I need: one optional field on each `BundledCaseIndex` entry (`client/src/contracts/case.ts`), for example `context?: 'context.glb'`. David's export would set it for the cases that have the file. The Body layer would then fetch `context.glb` only for those cases.

Why: the Body layer (Vaibhav's request; my PR on `aroovee/body-context`) learns whether a case has body context by fetching `cases/<id>/context.glb`. A missing file is skipped quietly, and my code logs nothing. But on Vercel a missing file is a 404, and Chrome always prints its own "Failed to load resource: 404" line in the console for that request, which no page code can silence. So today every case without the file adds one console line on the deployed site; locally the dev server answers with its HTML page and logs nothing. With the field, there are no requests for files that don't exist and no 404 lines.

Where:
- `client/src/contracts/case.ts`: `BundledCaseIndex` entries (David; a contract bump).
- `client/public/cases/index.json`: the field set per case (David's export).
- `client/src/ui/body-context.ts`: mine. It reads the field when present and falls back to probing when absent, so either order of landing works.

Needed by: not blocking. The layer works now; this only removes console noise on the deployed site.
Meanwhile: the Body layer probes each bundled case once per session, and the result is cached.

## Answer

David: <one line>
Vaibhav: <one line>
Gibran: <one line>
