/**
 * The grounding check (G5, spec §6.4): before anything the LLM wrote is shown or spoken, it must
 * - be non-empty and at most CATHY_MAX_CHARS long;
 * - contain only numbers that are engine values it was given, at the same rounding: digits, decimals,
 *   percentages and numbers in words ("twelve") all count; a number with a unit must match a value with
 *   that same unit (12 mm is not 1.2 cm, and a rank or count never vouches for "3 cm"); ratio words
 *   ("twice", "half") are comparisons the engine did not state, so they never pass;
 * - name only vessels, entries, targets and wires from the case's name set (facts.names);
 * - make none of the claims on the never-say list (spec §9.4).
 * On failure the caller discards the text and uses the deterministic template line.
 *
 * Strict on purpose: a false rejection costs a template line, a false acceptance is an invented fact.
 * Pure: no clock, no randomness.
 */

import type { CathyFacts } from './cathy-facts';

/** Longest LLM line Cathy will say, characters. Illustrative (DECISIONS.md, "Cathy: LLM line length"). */
export const CATHY_MAX_CHARS = 240;

export type GroundingResult = { ok: true } | { ok: false; reason: 'empty' | 'too_long' | 'number' | 'name' | 'wire' | 'claim'; detail: string };

/** Spec §9.4 / team/DEMO.md never-say, plus claims Cathy must never make. */
export const CLAIM_BLOCKLIST: readonly string[] = [
  'realistic catheter simulation',
  'safer for patients',
  'clinically validated',
  'optimal route',
  'optimal',
  'guarantee',
  'clinically proven',
  'diagnos',
  'prescribe',
  'dosage',
];

// ---------------------------------------------------------------- numbers

const UNITS: Readonly<Record<string, string>> = {
  mm: 'mm', millimeter: 'mm', millimeters: 'mm', millimetre: 'mm', millimetres: 'mm',
  cm: 'cm', centimeter: 'cm', centimeters: 'cm', centimetre: 'cm', centimetres: 'cm',
  m: 'm', meter: 'm', meters: 'm', metre: 'm', metres: 'm',
  s: 's', sec: 's', secs: 's', second: 's', seconds: 's',
  min: 'min', minute: 'min', minutes: 'min',
  '°': 'degrees', deg: 'degrees', degree: 'degrees', degrees: 'degrees',
  n: 'N', newton: 'N', newtons: 'N',
  'n·s': 'N·s', 'n.s': 'N·s', 'newton-seconds': 'N·s',
  '%': '%', percent: '%', pct: '%',
  zone: 'zones', zones: 'zones',
  point: 'points', points: 'points',
  star: 'stars', stars: 'stars',
};

const SMALL: Readonly<Record<string, number>> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Readonly<Record<string, number>> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const MULTIPLIERS: Readonly<Record<string, number>> = { hundred: 100, thousand: 1000 };
/** Words that state a number on their own (a ratio or fraction is a computed claim, so it must be a value too). */
const STANDALONE: Readonly<Record<string, number>> = { half: 0.5, twice: 2, double: 2, triple: 3, thrice: 3, quarter: 0.25, dozen: 12 };
/** The unit of a ratio word: the facts never hold one, so "twice" or "half" is never grounded. */
export const RATIO = 'ratio';
/** "one" is a pronoun after these ("the best one", "which one"), not a number. */
const ONE_PRONOUN_BEFORE = new Set(['the', 'this', 'that', 'which', 'any', 'each', 'every', 'no', 'a', 'another', 'other', 'next', 'best', 'right', 'wrong', 'same', 'first', 'last']);

export interface SaidNumber {
  value: number;
  unit: string | null;
  raw: string;
}

type Tok = { w: string; raw: string };

function tokens(text: string): Tok[] {
  // numbers (with thousands separators and decimals), words (with hyphens and ·), and the symbols ° and %
  const re = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|[A-Za-z]+(?:[-·.][A-Za-z]+)*|°|%/g;
  return [...text.matchAll(re)].map((m) => ({ w: m[0].toLowerCase(), raw: m[0] }));
}

const unitAt = (toks: Tok[], i: number): string | null => {
  const t = toks[i];
  if (!t) return null;
  return UNITS[t.w] ?? (t.raw === 'N' ? 'N' : null);
};

/** Every number stated in `text`, with the unit that follows it when there is one. */
export function numbersIn(text: string): SaidNumber[] {
  const toks = tokens(text);
  const out: SaidNumber[] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!;
    if (/^\d/.test(t.w)) {
      // ordinals written as digits ("2nd") are positions, not values
      if (/^(st|nd|rd|th)$/.test(toks[i + 1]?.w ?? '') && text.includes(t.raw + toks[i + 1]!.raw)) {
        i++;
        continue;
      }
      out.push({ value: Number(t.w.replace(/,/g, '')), unit: unitAt(toks, i + 1), raw: t.raw });
      if (unitAt(toks, i + 1)) i++;
      continue;
    }
    if (t.w in STANDALONE) {
      out.push({ value: STANDALONE[t.w]!, unit: RATIO, raw: t.raw });
      continue;
    }
    const isNumberWord = (w: string) => w in SMALL || w in TENS || w in MULTIPLIERS;
    if (t.w.split('-').every(isNumberWord)) {
      if (t.w === 'one' && ONE_PRONOUN_BEFORE.has(toks[i - 1]?.w ?? '')) continue;
      // read a run: "one hundred twenty three", "twenty-one" (hyphen kept in the token)
      let total = 0;
      let current = 0;
      let j = i;
      const raw: string[] = [];
      for (; j < toks.length; j++) {
        const parts = toks[j]!.w.split('-');
        if (!parts.every((p) => p in SMALL || p in TENS || p in MULTIPLIERS || p === 'and')) break;
        if (toks[j]!.w === 'and' && !(toks[j + 1]?.w && (toks[j + 1]!.w in SMALL || toks[j + 1]!.w in TENS))) break;
        for (const p of parts) {
          if (p === 'and') continue;
          if (p in SMALL) current += SMALL[p]!;
          else if (p in TENS) current += TENS[p]!;
          else {
            current = (current || 1) * MULTIPLIERS[p]!;
            if (p === 'thousand') {
              total += current;
              current = 0;
            }
          }
        }
        raw.push(toks[j]!.raw);
      }
      const unit = unitAt(toks, j);
      out.push({ value: total + current, unit, raw: raw.join(' ') });
      i = unit ? j : j - 1;
    }
  }
  return out;
}

/** Every number the facts hold, with its unit when the facts give one (values in strings included). */
export function factNumbers(facts: CathyFacts): SaidNumber[] {
  const out: SaidNumber[] = [];
  const walk = (v: unknown, key: string): void => {
    if (typeof v === 'number') {
      out.push({ value: v, unit: key.endsWith('_mm') ? 'mm' : null, raw: String(v) });
    } else if (typeof v === 'string') {
      out.push(...numbersIn(v));
    } else if (Array.isArray(v)) {
      for (const x of v) walk(x, key);
    } else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o['value'] === 'number' && typeof o['unit'] === 'string') {
        out.push({ value: o['value'], unit: UNITS[o['unit'].toLowerCase()] ?? o['unit'], raw: String(o['value']) });
        return;
      }
      for (const [k, x] of Object.entries(o)) walk(x, k);
    }
  };
  walk(facts, '');
  return out;
}

// ---------------------------------------------------------------- names

/** Words that make a phrase a vessel name. */
const ANATOMY = new Set([
  'aorta', 'aortic', 'arch', 'carotid', 'carotids', 'subclavian', 'vertebral', 'basilar', 'iliac', 'femoral', 'radial', 'brachial',
  'brachiocephalic', 'innominate', 'axillary', 'ulnar', 'renal', 'celiac', 'coeliac', 'mesenteric', 'cerebral', 'jugular', 'popliteal',
  'tibial', 'hepatic', 'splenic', 'coronary', 'bca', 'cca', 'ica', 'eca', 'lcca', 'rcca', 'sca', 'root', 'bifurcation',
]);
const MODIFIERS = new Set(['left', 'right', 'common', 'internal', 'external', 'proximal', 'distal', 'ascending', 'descending', 'superior', 'inferior', 'anterior', 'posterior', 'middle', 'thoracic', 'abdominal']);
/** Nouns that only say "a vessel"; alone they name nothing. */
const GENERIC = new Set(['artery', 'arteries', 'vessel', 'vessels', 'branch', 'branches', 'trunk', 'segment']);

const words = (s: string): string[] => s.toLowerCase().match(/[a-z]+/g) ?? [];

/**
 * Each vessel phrase in `text` (a run of anatomy words, side words and vessel nouns): its specific words
 * must all be words of one name in `names`. "left carotid" fails when the case only has a right carotid.
 */
export function unknownVesselPhrase(text: string, names: readonly string[]): string | null {
  const nameWords = names.map((n) => new Set(words(n)));
  const w = words(text);
  for (let i = 0; i < w.length; ) {
    if (!(ANATOMY.has(w[i]!) || MODIFIERS.has(w[i]!) || GENERIC.has(w[i]!))) {
      i++;
      continue;
    }
    let j = i;
    while (j < w.length && (ANATOMY.has(w[j]!) || MODIFIERS.has(w[j]!) || GENERIC.has(w[j]!))) j++;
    const run = w.slice(i, j);
    i = j;
    if (!run.some((x) => ANATOMY.has(x) || GENERIC.has(x))) continue; // "rotate left": a direction, not a vessel
    const specific = run.filter((x) => !GENERIC.has(x));
    if (specific.length === 0) continue; // "the next branch"
    if (!nameWords.some((set) => specific.every((x) => set.has(x)))) return run.join(' ');
  }
  return null;
}

const WIRE_DETERMINERS = new Set(['the', 'this', 'that', 'your', 'a', 'an', 'another', 'same', 'current', 'other', 'its', 'any', 'each', 'one', 'guide', 'of']);

/** A "<word> wire" whose word is not part of a wire name in `names` (an invented wire). */
export function unknownWire(text: string, names: readonly string[]): string | null {
  const nameWords = new Set(names.flatMap(words));
  const w = words(text);
  for (let i = 1; i < w.length; i++) {
    if (w[i] !== 'wire' && w[i] !== 'wires') continue;
    const before = w[i - 1]!;
    if (WIRE_DETERMINERS.has(before) || nameWords.has(before)) continue;
    return `${before} ${w[i]}`;
  }
  return null;
}

// ---------------------------------------------------------------- the check

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

export function groundingCheck(text: string, facts: CathyFacts): GroundingResult {
  const t = text.trim();
  if (t.length === 0) return { ok: false, reason: 'empty', detail: '' };
  if (t.length > CATHY_MAX_CHARS) return { ok: false, reason: 'too_long', detail: `${t.length} characters` };

  const lower = t.toLowerCase();
  for (const phrase of CLAIM_BLOCKLIST) if (lower.includes(phrase)) return { ok: false, reason: 'claim', detail: phrase };

  const allowed = factNumbers(facts);
  for (const said of numbersIn(t)) {
    const match = said.unit !== RATIO && allowed.some((a) => close(a.value, said.value) && (said.unit === null || a.unit === said.unit));
    if (!match) return { ok: false, reason: 'number', detail: said.unit ? `${said.raw} ${said.unit}` : said.raw };
  }

  const vessel = unknownVesselPhrase(t, facts.names);
  if (vessel) return { ok: false, reason: 'name', detail: vessel };
  const wire = unknownWire(t, facts.names);
  if (wire) return { ok: false, reason: 'wire', detail: wire };
  return { ok: true };
}
