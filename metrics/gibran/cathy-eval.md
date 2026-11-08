# G5 — Cathy eval

**Status: not run against the real model.** It waits for `team/requests/to-all-from-gibran-cathy-llm.md`, and nothing calls the API before approval.

**The set:** `tests/fixtures/cathy/eval-questions.json` has 44 spoken questions on Plan and 43 on Drive (Type III arch, right carotid target). Each has its expected intent: a known action, `question` or `none`. For questions it also has the key facts a correct answer must name, or `refuse` when the facts can't answer it (clinical, patient or off-topic). The facts each screen's LLM sees are frozen in `tests/fixtures/cathy/eval-facts.json`, which is regenerated with `UPDATE_FIXTURES=1` after a deliberate engine change.

**Checked in CI** (`tests/engine/cathy-eval.test.ts`, LLM mocked):
- at least 40 questions per screen;
- the frozen facts match the engine today;
- every expected key fact is in that screen's facts, so every row is answerable from them;
- the deterministic matcher never picks a wrong action (0 of 87).

**To run live, after approval and once David has deployed `/api/cathy`:**

```
CATHY_EVAL_URL=https://<preview>/api/cathy UPDATE_METRICS=1 pnpm exec vitest run tests/engine/cathy-eval.test.ts
```

That rewrites this file with the intent pass rate, the key-fact pass rate, the grounding-rejection rate and a row per question. The client's 2 s timeout is raised to 10 s for the eval, so the rates measure the model, not the network. Latency is a separate number to read from the server logs.
