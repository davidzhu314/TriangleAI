/**
 * Cathy's LLM layer (G5), client side: the LLM understands and phrases; the engine supplies every fact.
 * - understand(): when the deterministic matcher found no command in what followed "Hey Cathy", ask the
 *   LLM which known action it was, or 'question', or 'none'. Anything outside that list counts as 'none'.
 * - answer(): a short spoken line from the facts (cathyFacts) only, then the grounding check; if the check
 *   fails, the LLM is slow, errors or is offline, the deterministic template line is said instead.
 * A Cathy answer is never blocked on the LLM: after CATHY_TIMEOUT_MS the template line wins.
 *
 * It talks only to the server function (POST /api/cathy, David's) through an injected transport, so tests
 * use recorded responses and nothing here touches the network. With no transport (the LLM switched off, or
 * not approved yet) every call returns the deterministic result at once.
 */

import type { FeedbackLine } from '../../contracts';
import type { CathyFacts } from '../../score/cathy-facts';
import { groundingCheck, type GroundingResult } from '../../score/grounding';
import { VOICE_ACTIONS, VOICE_COMMANDS, type VoiceAction } from './commands';
import type { VoiceMatch } from './match';

/** How long Cathy waits for the LLM before saying the template line, ms. Illustrative (DECISIONS.md). */
export const CATHY_TIMEOUT_MS = 2000;

export type CathyIntent = VoiceAction | 'question' | 'none';

export type CathyRequest =
  | { kind: 'understand'; transcript: string; actions: { id: VoiceAction; examples: readonly string[] }[] }
  | { kind: 'answer'; question: string; facts: CathyFacts; template: string };

/** Sends one request to the server function and resolves with its JSON body. Rejects on any failure. */
export type CathyTransport = (request: CathyRequest, signal: AbortSignal) => Promise<unknown>;

export type CathyFallbackReason = 'off' | 'timeout' | 'error' | 'malformed' | 'unknown_action' | 'grounding';

export interface CathyAnswer {
  text: string;
  source: 'llm' | 'template';
  /** Why the template line was used, when it was. */
  fallback?: CathyFallbackReason;
  grounding?: GroundingResult;
}

export interface CathyLlmOptions {
  transport: CathyTransport | null;
  timeoutMs?: number;
  /** Where rejections are logged: the dev console only (the default logs nothing in a production build). */
  log?: (message: string, detail?: unknown) => void;
}

const devLog = (message: string, detail?: unknown): void => {
  if (import.meta.env?.DEV) console.debug(`[cathy] ${message}`, detail ?? '');
};

/** The transport's answer, or a fallback reason; never throws, never waits past the timeout. */
async function call(opts: CathyLlmOptions, request: CathyRequest): Promise<{ body: unknown } | { fail: CathyFallbackReason }> {
  if (!opts.transport) return { fail: 'off' };
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ fail: CathyFallbackReason }>((resolve) => {
    timer = setTimeout(() => {
      ctrl.abort();
      resolve({ fail: 'timeout' });
    }, opts.timeoutMs ?? CATHY_TIMEOUT_MS);
  });
  const sent = opts.transport(request, ctrl.signal).then(
    (body) => ({ body }),
    () => ({ fail: 'error' as const }),
  );
  try {
    return await Promise.race([sent, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const INTENTS = new Set<string>([...VOICE_ACTIONS, 'question', 'none']);

/** Which known action (or a question, or nothing) the words after the wake phrase were. */
export async function understand(transcript: string, opts: CathyLlmOptions): Promise<{ intent: CathyIntent; fallback?: CathyFallbackReason }> {
  const log = opts.log ?? devLog;
  const actions = VOICE_ACTIONS.map((id) => ({ id, examples: VOICE_COMMANDS[id].slice(0, 3) }));
  const r = await call(opts, { kind: 'understand', transcript, actions });
  if ('fail' in r) {
    if (r.fail !== 'off') log(`understand: ${r.fail}`);
    return { intent: 'none', fallback: r.fail };
  }
  const intent = isRecord(r.body) ? r.body['intent'] : undefined;
  if (typeof intent !== 'string') {
    log('understand: malformed response', r.body);
    return { intent: 'none', fallback: 'malformed' };
  }
  if (!INTENTS.has(intent)) {
    log('understand: unknown action', intent);
    return { intent: 'none', fallback: 'unknown_action' };
  }
  return { intent: intent as CathyIntent };
}

/**
 * Cathy's spoken line: the LLM's phrasing when it passes the grounding check, else `template` (the
 * deterministic line for the action, or noAnswerLine() for a question the engine has no answer for).
 */
export async function answer(question: string, facts: CathyFacts, template: FeedbackLine, opts: CathyLlmOptions): Promise<CathyAnswer> {
  const log = opts.log ?? devLog;
  const fallback = (reason: CathyFallbackReason, grounding?: GroundingResult): CathyAnswer => ({
    text: template.text,
    source: 'template',
    fallback: reason,
    ...(grounding ? { grounding } : {}),
  });
  const r = await call(opts, { kind: 'answer', question, facts, template: template.text });
  if ('fail' in r) {
    if (r.fail !== 'off') log(`answer: ${r.fail}`);
    return fallback(r.fail);
  }
  const text = isRecord(r.body) ? r.body['text'] : undefined;
  if (typeof text !== 'string') {
    log('answer: malformed response', r.body);
    return fallback('malformed');
  }
  const g = groundingCheck(text, facts);
  if (!g.ok) {
    log(`answer: grounding rejected (${g.reason}: ${g.detail})`, text);
    return fallback('grounding', g);
  }
  return { text: text.trim(), source: 'llm' };
}

/**
 * What a wake-word utterance asks for: the deterministic match when there is one (no LLM call), else the
 * LLM's reading of the words. `match` comes from the wake listener, so it already had the wake phrase.
 */
export async function resolveIntent(match: VoiceMatch, opts: CathyLlmOptions): Promise<{ intent: CathyIntent; heard: string; fallback?: CathyFallbackReason }> {
  if (match.action) return { intent: match.action, heard: match.heard };
  const u = await understand(match.heard, opts);
  return { ...u, heard: match.heard };
}
