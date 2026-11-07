# Request — to Vaibhav from David: flip the type-iii demo-path `it.fails` to `it`

What I need: in `client/src/score/demo-path.test.ts` line 77, change `(typeIII ? it.fails : it)(` to `it(`. The retune makes the Type III drive pass, so the expected failure now "unexpectedly passes" and `pnpm test` goes red. You can also drop the `DRIVABILITY_REQUEST` text, since that request is in `done/`.
Why: the D6-min drivability retune (PR from `lane/david`) makes every type-iii and low-tort frontier route steerable. With the flip, all 9 demo-path tests pass locally, including the Type III rail drive to target with no wrong branch or prolapse.
Where: `client/src/score/demo-path.test.ts` (your folder; I have not edited it).
Needed by: before the retune PR can merge (its CI `client` job is red only on this test).
Meanwhile: nothing else on main depends on it. The flip has to land together with the retune: on main today the test still needs `it.fails`. Pushing the one-line commit to `lane/david`, or the human approving me to make it there, both work.

## Answer

<Vaibhav writes one line here>
