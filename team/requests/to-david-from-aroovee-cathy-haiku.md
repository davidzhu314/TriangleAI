# Request — to David from Aroovee: build `api/cathy.ts` on Claude Haiku 5.5

What I need: when you build the Cathy server function from `to-david-from-gibran-cathy-server.md`, use **Claude Haiku 5.5** instead of Opus 5.5 (decision in `DECISIONS.md`, 2026-11-08). Three changes to Gibran's draft; the rest stands (key only in Vercel's environment as `ANTHROPIC_API_KEY`, 1.8 s timeout with no retries, no logging of bodies, the two request shapes, the input caps).

1. **Model:** `const MODEL = 'claude-haiku-5-5';`
2. **No refusal fallback:** Haiku 5.5 has no server-side fallback, so drop `betas: ['server-side-fallback-2026-07-01']` and `fallbacks: 'default'`, and call the regular endpoint. Keep the `stop_reason === 'refusal'` check: it throws, and the client says the template line.
3. **Thinking off, effort low,** for the fastest short answers (Haiku 5.5 accepts `disabled` at effort `high` or below). Send no `temperature`, `top_p` or `top_k`: Haiku 5.5 rejects non-default values with a 400.

So `ask()` becomes:

```ts
async function ask(system: string, user: string, schema: Record<string, unknown>): Promise<unknown> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    thinking: { type: 'disabled' },
    system,
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: user }],
  });
  if (response.stop_reason === 'refusal') throw new Error('refused');
  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error('no text');
  return JSON.parse(text.text);
}
```

Please type-check it against the SDK version you add. If the installed types don't accept `thinking: { type: 'disabled' }` with `output_config.effort` on this model, keep adaptive thinking (omit `thinking`) at effort `low`; the client's 2 s fallback covers a slow answer either way.

Why Haiku: Cathy's calls are short (classify a phrase; word one or two sentences from engine facts). The client waits about 2 s before saying the template line, and Opus 5.5 always thinks first, so it would often miss that window. Haiku 5.5 is also far cheaper ($0.10 / $0.50 per million input / output tokens, against $4 / $20).

My side, once `/api/cathy` answers on the preview: the client transport in `client/src/ui/hands-voice/` (Gibran's snippet), the privacy line before the LLM is switched on, and a Playwright case against a stubbed `/api/cathy`.

Timing: after the demo, with the rest of the Cathy server work.

## Answer

