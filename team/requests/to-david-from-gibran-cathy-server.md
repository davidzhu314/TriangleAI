# Request — to David from Gibran: the Cathy server function (`POST /api/cathy`)

What I need: once `to-all-from-gibran-cathy-llm.md` is approved, please do three things. You own server code, dependencies and the deploy.
1. Add `@anthropic-ai/sdk` as a server-only dependency.
2. Add `ANTHROPIC_API_KEY` to the Vercel project's environment variables.
3. Deploy the function below as `api/cathy.ts`.

Why: G5's client (`client/src/input/voice/cathy-llm.ts`) sends only two request shapes. The function turns each into one Messages API call with a JSON-schema output, and returns the JSON. The client then runs the grounding check, and falls back to the template line on any error, timeout or rejection.

**What it sends to Anthropic:** the transcript (for `understand`), or the question, the engine facts and the template line (for `answer`). Nothing else.

**Model and parameters** follow the claude-api skill's current defaults:
- **Model and effort:** `claude-opus-5-5` at effort `low`, since these are short classification or phrasing calls. Thinking stays adaptive; it can't be turned off on this model.
- **Output:** a JSON-schema format, and `max_tokens: 1024`.
- **Refusal fallback:** `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) handles a refusal server-side.
- **Timeout and logging:** a 1.8 s SDK timeout with no retries, and no logging of transcripts or bodies.

**Latency risk:** the client waits about 2 s and then says the template line, so a slow answer is never seen. The live eval will measure how often that happens. If it's too often, a faster model is the team's call; I've left the model as the skill's default.

Where: the code below, for `api/cathy.ts` at the repo root (Vercel serves `api/` as functions next to the Vite build).

```ts
// api/cathy.ts — Vercel Function: Cathy's LLM calls (G5). Holds ANTHROPIC_API_KEY from the environment;
// never logs transcripts, questions or facts. The client grounds every answer and falls back to the template line.
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ maxRetries: 0, timeout: 1800 }); // reads ANTHROPIC_API_KEY; TS timeout is in ms
const MODEL = 'claude-opus-5-5';
const MAX_INPUT_CHARS = 300;
const MAX_FACTS_CHARS = 20_000;

const ANSWER_SYSTEM = `You are Cathy, the voice assistant in ThreadSim, a training simulator for planning and driving a guidewire through vessel models. You are a training assistant, not a clinician.
Use only the facts in the user message. Never estimate, compute or invent a number: quote numbers exactly as they appear in the facts, with the same unit. Name only vessels, entries, targets and wires that appear in the facts.
If the facts don't answer the question, say you can only answer from this case's results. Give no clinical or patient advice, and never call a route optimal, safe for patients or clinically validated.
Answer in one or two short spoken sentences, under 240 characters.`;

const UNDERSTAND_SYSTEM = `You classify what a trainee said to Cathy, the voice assistant in ThreadSim, a guidewire training simulator.
Pick the one action the trainee asked for, from the list given with its example phrasings. If they asked a question about the case instead, answer "question". If it is neither, answer "none". Never pick anything outside the list.`;

type UnderstandBody = { kind: 'understand'; transcript: string; actions: { id: string; examples: string[] }[] };
type AnswerBody = { kind: 'answer'; question: string; facts: unknown; template: string };

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function ask(system: string, user: string, schema: Record<string, unknown>): Promise<unknown> {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 1024,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: user }],
  });
  if (response.stop_reason === 'refusal') throw new Error('refused');
  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error('no text');
  return JSON.parse(text.text);
}

export async function POST(request: Request): Promise<Response> {
  let body: UnderstandBody | AnswerBody;
  try {
    body = (await request.json()) as UnderstandBody | AnswerBody;
  } catch {
    return json(400, { error: 'bad json' });
  }
  try {
    if (body.kind === 'understand') {
      if (typeof body.transcript !== 'string' || body.transcript.length > MAX_INPUT_CHARS || !Array.isArray(body.actions)) return json(400, { error: 'bad request' });
      const ids = body.actions.map((a) => String(a.id));
      const out = await ask(
        UNDERSTAND_SYSTEM,
        `Actions:\n${body.actions.map((a) => `- ${a.id}: ${a.examples.join('; ')}`).join('\n')}\n\nThe trainee said: ${body.transcript}`,
        { type: 'object', properties: { intent: { type: 'string', enum: [...ids, 'question', 'none'] } }, required: ['intent'], additionalProperties: false },
      );
      return json(200, out);
    }
    if (body.kind === 'answer') {
      const facts = JSON.stringify(body.facts);
      if (typeof body.question !== 'string' || body.question.length > MAX_INPUT_CHARS || facts.length > MAX_FACTS_CHARS || typeof body.template !== 'string') {
        return json(400, { error: 'bad request' });
      }
      const out = await ask(
        ANSWER_SYSTEM,
        `Facts (JSON):\n${facts}\n\nWhat the engine's own line says: ${body.template}\n\nThe trainee asked: ${body.question}`,
        { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false },
      );
      return json(200, out);
    }
    return json(400, { error: 'unknown kind' });
  } catch (error) {
    // No body or transcript in logs: the status is enough to debug, and the client falls back anyway.
    if (error instanceof Anthropic.RateLimitError) return json(429, { error: 'rate limited' });
    if (error instanceof Anthropic.APIError) return json(502, { error: `upstream ${error.status ?? ''}`.trim() });
    return json(502, { error: 'upstream' });
  }
}
```

**Client transport.** This lives with the screen (Aroovee's), because the input folder makes no network calls:

```ts
const cathyTransport: CathyTransport = async (req, signal) => {
  const res = await fetch('/api/cathy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req), signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};
```

I haven't type-checked or run this code: the SDK isn't a dependency and nothing may call the real API before approval. Please type-check it when you add the SDK. If your SDK version's beta types don't take `fallbacks: 'default'` yet, use the array form (`betas: ['server-side-fallback-2026-06-01']`, `fallbacks: [{ model: 'claude-opus-4-8' }]`) or drop it. A refusal then just falls back to the template line on the client.

Needed by: not the demo. It's needed after the to-all approval, before the live eval.
Meanwhile: the client is tested against recorded responses (`tests/fixtures/cathy/recorded-responses.json`). With no transport, Cathy uses the template lines.

## Answer

David: <one line>
