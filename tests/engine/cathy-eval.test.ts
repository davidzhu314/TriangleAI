/**
 * G5 eval set for Cathy's LLM layer (tests/fixtures/cathy/eval-questions.json, facts in eval-facts.json).
 *
 * Always (CI, LLM mocked):
 * - at least 40 spoken questions per screen;
 * - the frozen facts are what the engine gives today (regenerate with UPDATE_FIXTURES=1 after a deliberate
 *   engine change, and say so in the handoff);
 * - every key fact a question expects is in that screen's facts, so the eval is answerable from them;
 * - the deterministic matcher never resolves a row to the WRONG action (it may leave it for the LLM).
 *
 * Live (only after the to-all request is approved; never in CI): CATHY_EVAL_URL=<server function URL>
 * runs every row through understand() and answer() against the real model, reports the intent pass rate,
 * the key-fact pass rate and the grounding-rejection rate, and with UPDATE_METRICS=1 writes them to
 * metrics/gibran/cathy-eval.md.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { answer, understand, type CathyRequest, type CathyTransport } from '../../client/src/input/voice/cathy-llm';
import { matchCommand } from '../../client/src/input/voice/match';
import type { CathyFacts } from '../../client/src/score/cathy-facts';
import { driveScene, planScene } from '../../client/src/score/cathy.testutil';
import { noAnswerLine } from '../../client/src/score/live';
import { machineLine, readJson, REPO, shouldWriteFixtures, shouldWriteMetrics, writeMetrics } from './engine.testutil';

interface Row {
  q: string;
  intent: string;
  facts?: string[][];
  refuse?: boolean;
}
const DIR = join(REPO, 'tests/fixtures/cathy');
const questions = readJson<{ plan: Row[]; drive: Row[] }>(DIR, 'eval-questions.json');
const FACTS_FILE = join(DIR, 'eval-facts.json');

const engineFacts = (): { plan: CathyFacts; drive: CathyFacts } => ({ plan: planScene('type-iii', 'rcca').facts, drive: driveScene('type-iii', 'rcca').facts });
if (shouldWriteFixtures()) writeFileSync(FACTS_FILE, `${JSON.stringify(engineFacts(), null, 2)}\n`);
const frozen = readJson<{ plan: CathyFacts; drive: CathyFacts }>(FACTS_FILE);

describe('Cathy eval set', () => {
  it('has at least 40 questions per screen', () => {
    expect(questions.plan.length).toBeGreaterThanOrEqual(40);
    expect(questions.drive.length).toBeGreaterThanOrEqual(40);
  });

  it('the frozen facts are what the engine gives today', () => {
    expect(frozen).toEqual(engineFacts());
  });

  for (const screen of ['plan', 'drive'] as const) {
    it(`${screen}: every expected key fact is in the facts`, () => {
      const text = JSON.stringify(frozen[screen]).toLowerCase();
      for (const row of questions[screen]) {
        for (const anyOf of row.facts ?? []) {
          // "no"/"none" style answers are words, not facts; at least one option must be in the facts
          expect(anyOf.some((f) => text.includes(f.toLowerCase()) || ['no', 'none', "doesn't", 'does not'].includes(f)), `${row.q}: ${anyOf.join(' | ')}`).toBe(true);
        }
      }
    });

    it(`${screen}: the deterministic matcher never picks a wrong action`, () => {
      const wrong: string[] = [];
      for (const row of questions[screen]) {
        const m = matchCommand([{ transcript: `hey cathy ${row.q}`, confidence: 0.9 }]);
        if (m.action && m.action !== row.intent) wrong.push(`${row.q} → ${m.action} (want ${row.intent})`);
      }
      expect(wrong).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------- live, after approval only

const URL_ = process.env['CATHY_EVAL_URL'];

const fetchTransport =
  (url: string): CathyTransport =>
  async (req: CathyRequest, signal: AbortSignal) => {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req), signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

describe.skipIf(!URL_)('Cathy eval against the real model (CATHY_EVAL_URL)', () => {
  it('reports intent, key-fact and grounding-rejection rates', async () => {
    const opts = { transport: fetchTransport(URL_!), timeoutMs: 10_000, log: () => {} };
    const rows: string[] = [];
    const totals = { intent: 0, intentOk: 0, answers: 0, factsOk: 0, rejected: 0 };
    for (const screen of ['plan', 'drive'] as const) {
      for (const row of questions[screen]) {
        const m = matchCommand([{ transcript: `hey cathy ${row.q}`, confidence: 0.9 }]);
        const intent = m.action ?? (await understand(row.q, opts)).intent;
        totals.intent++;
        if (intent === row.intent) totals.intentOk++;
        let said = '';
        let factsOk = true;
        if (row.intent === 'question') {
          const a = await answer(row.q, frozen[screen], noAnswerLine(), opts);
          totals.answers++;
          if (a.fallback === 'grounding') totals.rejected++;
          said = a.text;
          const low = said.toLowerCase();
          factsOk = row.refuse ? a.source === 'template' || !/\d/.test(said) : (row.facts ?? []).every((anyOf) => anyOf.some((f) => low.includes(f.toLowerCase())));
          if (factsOk) totals.factsOk++;
        }
        rows.push(`| ${screen} | ${row.q} | ${row.intent} | ${intent} | ${said.replace(/\|/g, '/')} | ${row.intent === 'question' ? (factsOk ? 'yes' : 'no') : '—'} |`);
      }
    }
    const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(0)}%` : '—');
    if (shouldWriteMetrics()) {
      writeMetrics('cathy-eval.md', [
        '# G5 — Cathy eval: live results',
        '',
        `Written by \`CATHY_EVAL_URL=… UPDATE_METRICS=1 pnpm exec vitest run tests/engine/cathy-eval.test.ts\`. ${machineLine()}`,
        '',
        `Intent: ${pct(totals.intentOk, totals.intent)} (${totals.intentOk}/${totals.intent}). Key facts in answers: ${pct(totals.factsOk, totals.answers)} (${totals.factsOk}/${totals.answers}). Grounding rejections: ${pct(totals.rejected, totals.answers)} (${totals.rejected}/${totals.answers}).`,
        '',
        '| Screen | Question | Expected | Got | Cathy said | Key facts |',
        '| --- | --- | --- | --- | --- | --- |',
        ...rows,
      ]);
    }
    expect(totals.intent).toBeGreaterThan(0);
  }, 600_000);
});
