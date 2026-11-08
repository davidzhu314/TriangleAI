/**
 * Cathy's AI wording (the G5 LLM layer), screen side: the transport to the server function and the switch.
 *
 * - The browser never sees an API key. It POSTs Cathy's two request shapes (understand, answer) to `/api/cathy`
 *   (David's Vercel function, which holds ANTHROPIC_API_KEY), and the LLM layer in `client/src/input/voice/cathy-llm.ts`
 *   grounds every answer against the engine's facts, falling back to the template line on any error, timeout,
 *   refusal or mismatch.
 * - Off by default (Settings, "Cathy's AI wording"). Off means no transport: no request leaves the page, and Cathy
 *   answers exactly as before.
 * - The LLM never computes or decides a route, measure, score or number: the engine supplies every fact.
 */
import type { CathyLlmOptions, CathyRequest, CathyTransport } from '../../input/voice/cathy-llm';
import { readSettings } from '../settings-store';

/** Where the server function answers. Same origin, so the deployed app and `vercel dev` both work. */
export const CATHY_ENDPOINT = '/api/cathy';

/** One request to the server function; rejects on any non-2xx answer (the LLM layer then says the template line). */
export const cathyTransport: CathyTransport = async (request: CathyRequest, signal: AbortSignal) => {
  const res = await fetch(CATHY_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request), signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

/** Whether the trainee has turned Cathy's AI wording on (Settings). */
export const cathyAiOn = (): boolean => readSettings().cathyAi;

/** The LLM layer's options for now: the transport when AI wording is on, else none (template lines only). */
export function cathyLlmOptions(): CathyLlmOptions {
  return { transport: cathyAiOn() ? cathyTransport : null };
}

/** The privacy line, shown in Cathy's box whenever AI wording is on (DECISIONS.md: it ships before the LLM is on). */
export const CATHY_AI_NOTE =
  "AI wording is on: your question and this case's facts are sent to Anthropic's Claude, through our server, to word Cathy's answer. The numbers come from the route engine, never from the AI.";
