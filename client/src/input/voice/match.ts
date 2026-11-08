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

export type VoiceMatch =
  | { action: VoiceAction; heard: string; score: number; /** zoom_to: the artery as said, e.g. "aortic arch". */ target?: string }
  | { action: null; heard: string };

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

/** Polite openers people put before a command: "can you", "could you please", … */
const POLITE = [['can', 'you'], ['could', 'you'], ['would', 'you'], ['will', 'you'], ['please']];
const FILLER = new Set(['the', 'a', 'an', 'please', 'into', 'to', 'on']);
/** "Zoom in on the tip" is a plain zoom in, not an artery: these alone never make a zoom_to. */
const NOT_ARTERY = new Set(['tip', 'wire', 'catheter', 'it', 'that', 'this', 'here', 'there', 'me', 'view', 'screen', 'picture', 'image', 'map', 'target', 'end', 'middle', 'centre', 'center', 'bit', 'more', 'little', 'lot']);

function stripPolite(words: string[]): string[] {
  let w = words;
  for (let changed = true; changed; ) {
    changed = false;
    for (const p of POLITE) {
      if (p.every((x, i) => w[i] === x)) {
        w = w.slice(p.length);
        changed = true;
      }
    }
  }
  return w;
}

/**
 * "Zoom into the aortic arch", "can you zoom in on the left carotid please", "focus on the brachiocephalic":
 * a zoom_to phrase at the start, then the artery. The target is the rest, without "the" or a trailing "please";
 * resolving it to vessels is the screen's job (resolveVesselTarget, ./vessel-target). Null without a target.
 */
export function matchZoomTo(words: readonly string[]): { target: string } | null {
  const w = stripPolite([...words]);
  for (const phrasing of VOICE_COMMANDS.zoom_to) {
    const p = phrasing.split(' ');
    if (!p.every((x, i) => w[i] === x)) continue;
    const rest = w.slice(p.length).filter((x, i, a) => !(FILLER.has(x) && (i === 0 || i === a.length - 1)));
    while (rest.length && FILLER.has(rest[0]!)) rest.shift();
    while (rest.length && FILLER.has(rest[rest.length - 1]!)) rest.pop();
    if (rest.length && !rest.every((x) => NOT_ARTERY.has(x) || FILLER.has(x))) return { target: rest.join(' ') };
  }
  return null;
}

export function matchCommand(alternatives: readonly SpeechAlternative[]): VoiceMatch {
  for (const alt of alternatives) {
    const zoom = matchZoomTo(stripWake(normalize(alt.transcript)));
    if (zoom) return { action: 'zoom_to', heard: alt.transcript, score: 1, target: zoom.target };
  }
  for (const alt of alternatives) {
    const words = stripPolite(stripWake(normalize(alt.transcript)));
    let best: { action: VoiceAction; score: number } | null = null;
    for (const action of VOICE_ACTIONS) {
      if (action === 'zoom_to') continue; // only with a target (matchZoomTo)
      for (const phrasing of VOICE_COMMANDS[action]) {
        const s = phraseScore(words, phrasing);
        if (!best || s > best.score) best = { action, score: s };
      }
    }
    if (best && best.score >= MATCH_MIN) return { action: best.action, heard: alt.transcript, score: best.score };
  }
  return { action: null, heard: alternatives[0]?.transcript ?? '' };
}
