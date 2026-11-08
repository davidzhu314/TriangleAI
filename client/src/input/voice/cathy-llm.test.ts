/**
 * Cathy's LLM layer (G5) against recorded responses (tests/fixtures/cathy/recorded-responses.json): valid,
 * malformed JSON, unknown action, error, offline and timeout. Every failure path returns the deterministic
 * result (intent 'none', or the template line). No test calls the real API: the transport is a replay.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { planScene } from '../../score/cathy.testutil';
import { noAnswerLine, planAssistLine } from '../../score/live';
import { planAssist } from '../../optimize/assist';
import { DEFAULT_WEIGHTS } from '../../optimize/rank';
import { answer, resolveIntent, understand, type CathyRequest, type CathyTransport } from './cathy-llm';

interface Recorded {
  name: string;
  body?: unknown;
  error?: string;
  hang?: boolean;
}
interface UnderstandRow extends Recorded {
  transcript: string;
}
interface AnswerRow extends Recorded {
  question: string;
}
const recorded = JSON.parse(readFileSync(join(import.meta.dirname, '../../../../tests/fixtures/cathy/recorded-responses.json'), 'utf8')) as {
  understand: UnderstandRow[];
  answer: AnswerRow[];
};

/** A transport that replays one recorded row, and remembers what it was sent. */
function replay(row: Recorded): CathyTransport & { sent: CathyRequest[] } {
  const sent: CathyRequest[] = [];
  const t = (req: CathyRequest, signal: AbortSignal): Promise<unknown> => {
    sent.push(req);
    if (row.hang) return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
    if (row.error) return Promise.reject(new Error(row.error));
    return Promise.resolve(row.body);
  };
  return Object.assign(t, { sent });
}

const quiet = { log: () => {}, timeoutMs: 50 };
const scene = planScene('type-iii', 'rcca');
const facts = scene.facts;
const template = (() => {
  const best = scene.optimized.kind === 'frontier' ? scene.optimized.routes[0]! : null;
  const assist = planAssist({ optimized: scene.optimized, weights: DEFAULT_WEIGHTS, entryId: best!.entryId, presetId: best!.presetId, routeSoFar: best!.edges.slice(0, 1) });
  return planAssistLine(assist, scene.c, scene.targetId, 'best');
})();

const UNDERSTAND_EXPECT: Record<string, { intent: string; fallback?: string }> = {
  'valid action': { intent: 'assist_check' },
  'valid question': { intent: 'question' },
  'valid none': { intent: 'none' },
  'unknown action': { intent: 'none', fallback: 'unknown_action' },
  'malformed: not an object': { intent: 'none', fallback: 'malformed' },
  'malformed: wrong field': { intent: 'none', fallback: 'malformed' },
  'malformed: intent not a string': { intent: 'none', fallback: 'malformed' },
  error: { intent: 'none', fallback: 'error' },
  offline: { intent: 'none', fallback: 'error' },
  timeout: { intent: 'none', fallback: 'timeout' },
};

const ANSWER_EXPECT: Record<string, { source: 'llm' | 'template'; fallback?: string; grounding?: string }> = {
  'valid, grounded': { source: 'llm' },
  'valid, grounded, with numbers': { source: 'llm' },
  'ungrounded number': { source: 'template', fallback: 'grounding', grounding: 'number' },
  'ungrounded vessel': { source: 'template', fallback: 'grounding', grounding: 'name' },
  'never-say claim': { source: 'template', fallback: 'grounding', grounding: 'claim' },
  'too long': { source: 'template', fallback: 'grounding', grounding: 'too_long' },
  'malformed: no text': { source: 'template', fallback: 'malformed' },
  'malformed: text not a string': { source: 'template', fallback: 'malformed' },
  error: { source: 'template', fallback: 'error' },
  offline: { source: 'template', fallback: 'error' },
  timeout: { source: 'template', fallback: 'timeout' },
};

describe('understand(): recorded responses', () => {
  it('every recorded row has an expectation', () => {
    expect(recorded.understand.map((r) => r.name).sort()).toEqual(Object.keys(UNDERSTAND_EXPECT).sort());
  });

  it.each(recorded.understand.map((r) => [r.name, r] as const))('%s', async (_, row) => {
    const t = replay(row);
    const r = await understand(row.transcript, { transport: t, ...quiet });
    expect(r).toEqual(UNDERSTAND_EXPECT[row.name]);
    // it asked with the transcript and only the known actions
    expect(t.sent[0]).toMatchObject({ kind: 'understand', transcript: row.transcript });
    if (t.sent[0]!.kind === 'understand') expect(t.sent[0]!.actions.map((a) => a.id)).toContain('assist_check');
  });

  it('with the LLM off (no transport) it is "none" at once', async () => {
    expect(await understand('is this right', { transport: null })).toEqual({ intent: 'none', fallback: 'off' });
  });
});

describe('answer(): recorded responses, the template line on every failure', () => {
  it('every recorded row has an expectation', () => {
    expect(recorded.answer.map((r) => r.name).sort()).toEqual(Object.keys(ANSWER_EXPECT).sort());
  });

  it.each(recorded.answer.map((r) => [r.name, r] as const))('%s', async (_, row) => {
    const t = replay(row);
    const r = await answer(row.question, facts, template, { transport: t, ...quiet });
    const want = ANSWER_EXPECT[row.name]!;
    expect(r.source).toBe(want.source);
    expect(r.fallback).toBe(want.fallback);
    if (want.grounding) expect(r.grounding).toMatchObject({ ok: false, reason: want.grounding });
    if (want.source === 'template') expect(r.text).toBe(template.text);
    else expect(r.text).toBe((row.body as { text: string }).text);
    // the LLM saw the facts and the template line, nothing else
    expect(t.sent[0]).toEqual({ kind: 'answer', question: row.question, facts, template: template.text });
  });

  it('with the LLM off it is the template line at once', async () => {
    expect(await answer('where next', facts, template, { transport: null })).toEqual({ text: template.text, source: 'template', fallback: 'off' });
  });

  it('a question with no template falls back to the no-answer line', async () => {
    const r = await answer('what is the patient’s blood pressure', facts, noAnswerLine(), { transport: replay({ name: 'x', error: 'offline' }), ...quiet });
    expect(r.text).toBe("I can only answer from this case's results. Try asking where next, or how you're doing.");
  });

  it('logs each rejection, and only through the log hook', async () => {
    const logged: string[] = [];
    const row = recorded.answer.find((r) => r.name === 'ungrounded number')!;
    await answer(row.question, facts, template, { transport: replay(row), timeoutMs: 50, log: (m) => logged.push(m) });
    expect(logged).toEqual(['answer: grounding rejected (number: 43 cm)']);
  });
});

describe('resolveIntent(): the deterministic matcher first', () => {
  it('a matched command never calls the LLM', async () => {
    const t = replay({ name: 'x', body: { intent: 'zoom_out' } });
    const r = await resolveIntent({ action: 'assist_check', heard: 'Hey Cathy, am I on the right path', score: 1 }, { transport: t, ...quiet });
    expect(r.intent).toBe('assist_check');
    expect(t.sent).toEqual([]);
  });
  it('an unmatched utterance asks the LLM', async () => {
    const t = replay({ name: 'x', body: { intent: 'assist_check' } });
    const r = await resolveIntent({ action: null, heard: 'Hey Cathy, is the tip heading the right way' }, { transport: t, ...quiet });
    expect(r.intent).toBe('assist_check');
    expect(t.sent).toHaveLength(1);
  });
});
