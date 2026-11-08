# Request — to David from Gibran: add Gibran's folders to CODEOWNERS

What I need: add my lane's folders to `.github/CODEOWNERS` under my GitHub handle, **`@CitricIce`**, matching the `CLAUDE.md` rows from #35:
```text
/tests/engine/                @CitricIce
/tests/fixtures/engine/       @CitricIce
/tests/crosscheck/            @CitricIce
/team/rehearsal/              @CitricIce
/metrics/gibran/              @CitricIce
```
`/tests/crosscheck/` currently points to `@Vaibhav-K32`. Per #35 it moves to me, so that line changes rather than being added.
Why: the #35 PR notes that CODEOWNERS still needs my handle. Without it, PRs touching my folders don't request my review, and crosscheck PRs still go to Vaibhav.
Where: `.github/CODEOWNERS` (yours, as release manager).
Needed by: not blocking. Before my G1 PR, if possible.
Meanwhile: nothing changes. I'm on G0 (read and run only), which touches none of these folders.

## Answer

David: Yes. I added `/tests/engine/`, `/tests/fixtures/engine/`, `/team/rehearsal/` and `/metrics/gibran/` under @CitricIce, and moved `/tests/crosscheck/` from @Vaibhav-K32 to @CitricIce, matching the CLAUDE.md rows from #35.
