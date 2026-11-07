/**
 * Matching recognised speech to a voice command. Pure.
 *
 * Each alternative (best first, as the recogniser ranks them) is normalised, any wake phrase is
 * stripped, and every phrasing scores 1 − (word edit distance ÷ the longer word count), plus a bonus
 * when the phrasing appears as contiguous words. The first alternative whose best phrasing reaches
 * MATCH_MIN wins; ties go to the action listed first.
 */

import { MATCH_MIN, SUBSTRING_BONUS, VOICE_ACTIONS, VOICE_COMMANDS, WAKE_LEADS, WAKE_NAMES, type VoiceAction } from './commands';

export interface SpeechAlternative {
  transcript: string;
  confidence: number;
}

export type VoiceMatch = { action: VoiceAction; heard: string; score: number } | { action: null; heard: string };

const DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

/** Lowercase, digits to words, punctuation removed, spaces collapsed. Returns the words. */
export function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[0-9]/g, (d) => ` ${DIGITS[Number(d)]} `)
    .replace(/['’]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Drop a leading "hey Cathy" / "a Kathy" / "Cathy". */
export function stripWake(words: string[]): string[] {
  let i = 0;
  if ((WAKE_LEADS as readonly string[]).includes(words[0] ?? '') && (WAKE_NAMES as readonly string[]).includes(words[1] ?? '')) i = 2;
  else if ((WAKE_NAMES as readonly string[]).includes(words[0] ?? '')) i = 1;
  return words.slice(i);
}

export function wordEditDistance(a: readonly string[], b: readonly string[]): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length]!;
}

const contains = (words: readonly string[], phrase: readonly string[]) =>
  phrase.length > 0 && words.some((_, i) => phrase.every((p, k) => words[i + k] === p));

/** Score of one phrasing against normalised, wake-stripped words. */
export function phraseScore(words: readonly string[], phrasing: string): number {
  const p = phrasing.split(' ');
  if (words.length === 0) return 0;
  const base = 1 - wordEditDistance(words, p) / Math.max(words.length, p.length);
  return Math.min(1, base + (contains(words, p) ? SUBSTRING_BONUS : 0));
}

export function matchCommand(alternatives: readonly SpeechAlternative[]): VoiceMatch {
  for (const alt of alternatives) {
    const words = stripWake(normalize(alt.transcript));
    let best: { action: VoiceAction; score: number } | null = null;
    for (const action of VOICE_ACTIONS) {
      for (const phrasing of VOICE_COMMANDS[action]) {
        const s = phraseScore(words, phrasing);
        if (!best || s > best.score) best = { action, score: s };
      }
    }
    if (best && best.score >= MATCH_MIN) return { action: best.action, heard: alt.transcript, score: best.score };
  }
  return { action: null, heard: alternatives[0]?.transcript ?? '' };
}
