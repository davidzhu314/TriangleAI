# Request — to David from Vaibhav: fixture-y byte test fails on Windows checkouts

What I need: a `.gitattributes` rule (for example `client/public/cases/** -text` or `text eol=lf` for the JSON) so that git's `core.autocrlf=true` on Windows doesn't rewrite fixture-y's JSON to CRLF.
Why: with autocrlf on, `tools/fixture-y/fixture-y.test.ts` fails locally on Windows with "fixture-y/case.json is stale" because the checked-out file has CRLF line endings. It passes on Linux CI. I pinned LF the same way for my synthetic fixtures (`tests/fixtures/synthetic/.gitattributes`).
Where: `.gitattributes` for `client/public/cases/` (yours); I haven't touched it.
Needed by: not blocking
Meanwhile: I treat that one local failure as known; everything else in `pnpm test` is green on `lane/vaibhav`.

## Answer

