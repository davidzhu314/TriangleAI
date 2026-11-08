/**
 * "Hey Cathy, zoom into <artery>": the artery as said → the case's edges to frame. Pure (no clock, DOM or network).
 *
 * Each vessel is known by its own display name and id, plus common spoken names ("left carotid", "innominate",
 * "femoral"). "The aortic arch" (or "the arch") is the stretch of aorta the arch branches leave from: the aorta
 * edges that share a node with the brachiocephalic, the left carotid or a subclavian. Words are compared loosely
 * (an edit or two in a long word, so "carotted" or "brachiocephalc" still count), but "left" and "right" must match.
 */

import type { LoadedCase } from '../../contracts';
import { normalize, wordEditDistance } from './match';

export interface VesselTarget {
  /** What to call it in the reply: the vessel's display name, or "Aortic arch". */
  label: string;
  /** Edge ids to frame. */
  edges: string[];
}

/** Spoken names per vessel id, beyond the case's own display name. */
const SPOKEN: Readonly<Record<string, readonly string[]>> = {
  aorta: ['aorta', 'aortic', 'descending aorta', 'thoracic aorta', 'abdominal aorta'],
  bca: ['brachiocephalic', 'brachiocephalic trunk', 'brachiocephalic artery', 'innominate', 'innominate artery'],
  rcca: ['right carotid', 'right common carotid', 'right common carotid artery'],
  lcca: ['left carotid', 'left common carotid', 'left common carotid artery'],
  r_subclavian: ['right subclavian', 'right subclavian artery', 'right radial'],
  l_subclavian: ['left subclavian', 'left subclavian artery', 'left radial'],
  r_iliac: ['right iliac', 'right femoral', 'right iliac artery'],
  l_iliac: ['left iliac', 'left femoral', 'left iliac artery'],
};
const ARCH = ['aortic arch', 'arch', 'the arch', 'arch of the aorta', 'arch of aorta'];
const ARCH_BRANCHES = ['bca', 'lcca', 'l_subclavian', 'r_subclavian'];
const IGNORE = new Set(['the', 'a', 'artery', 'arteries', 'vessel', 'please', 'part', 'of', 'section']);
const SIDES = new Set(['left', 'right']);

/** Two words are the same if equal, or within one edit (two for 8+ letters) when both have 5+ letters. Sides exactly. */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (SIDES.has(a) || SIDES.has(b)) return false;
  if (a.length < 5 || b.length < 5) return false;
  const d = wordEditDistance([...a], [...b]);
  return d <= (Math.max(a.length, b.length) >= 8 ? 2 : 1);
}

/** 1 − (word edit distance with loose word equality) ÷ the longer length. */
function similarity(said: readonly string[], name: readonly string[]): number {
  const row = Array.from({ length: name.length + 1 }, (_, j) => j);
  for (let i = 1; i <= said.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= name.length; j++) {
      const cur = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (sameWord(said[i - 1]!, name[j - 1]!) ? 0 : 1));
      prev = cur;
    }
  }
  return 1 - row[name.length]! / Math.max(said.length, name.length, 1);
}

const words = (s: string): string[] => normalize(s).filter((w) => !IGNORE.has(w));

/** The best vessel (or the arch) for what was said; null when nothing is close enough (similarity < 0.6). */
export function resolveVesselTarget(said: string, c: Pick<LoadedCase, 'vessels' | 'edges'>): VesselTarget | null {
  const w = words(said);
  if (w.length === 0) return null;
  let best: { score: number; target: VesselTarget } | null = null;
  const consider = (names: readonly string[], target: () => VesselTarget | null) => {
    for (const n of names) {
      const s = similarity(w, words(n));
      if (s >= 0.6 && (!best || s > best.score)) {
        const t = target();
        if (t && t.edges.length) best = { score: s, target: t };
      }
    }
  };
  consider(ARCH, () => {
    const branchNodes = new Set(c.edges.filter((e) => ARCH_BRANCHES.includes(e.vessel)).flatMap((e) => [e.from, e.to]));
    const aorta = c.edges.filter((e) => e.vessel === 'aorta');
    const arch = aorta.filter((e) => branchNodes.has(e.from) || branchNodes.has(e.to));
    return { label: 'Aortic arch', edges: (arch.length ? arch : aorta).map((e) => e.id) };
  });
  for (const v of c.vessels) {
    const edges = c.edges.filter((e) => e.vessel === v.id).map((e) => e.id);
    consider([v.name, v.id.replace(/_/g, ' '), ...(SPOKEN[v.id] ?? [])], () => ({ label: v.name, edges }));
  }
  return best ? (best as { target: VesselTarget }).target : null;
}
