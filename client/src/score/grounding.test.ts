/**
 * The grounding check (G5, spec §6.4) against an adversarial table of LLM outputs on real facts (Type III
 * arch, right carotid target, Plan and Drive screens). Each row is accepted or rejected, for the stated
 * reason. Also: every deterministic line on every bundled case passes against its own facts, so the
 * template fallback is always grounded.
 */

import { describe, expect, it } from 'vitest';
import { caseIndex, driveScene, loadBundledCase, planScene } from './cathy.testutil';
import { CATHY_MAX_CHARS, groundingCheck, numbersIn, type GroundingResult } from './grounding';

const plan = planScene('type-iii', 'rcca').facts;
const drive = driveScene('type-iii', 'rcca').facts;

type Row = [text: string, expected: 'ok' | Exclude<GroundingResult, { ok: true }>['reason']];

// Plan facts (Type III → right carotid, from the right radial, one edge in): route so far 31.3 cm, sharpest
// turn 9°, fluoro estimate 35 s; best route 42.8 cm and 50 s; ranks 1–5; best next: Right common carotid.
const PLAN_ROWS: Row[] = [
  // accepted
  ['The best way on is the Right common carotid.', 'ok'],
  ['The best route from here goes through the right common carotid; it is the shortest, gentlest and least radiation.', 'ok'],
  ['Your route so far is 31.3 cm, with a sharpest turn of 9 degrees.', 'ok'],
  ['Your route so far is 31.3 centimetres long.', 'ok'],
  ['The top route is 42.8 cm with an estimated fluoro time of 50 s.', 'ok'],
  ['Estimated fluoro time on the best route is fifty seconds.', 'ok'],
  ['The best one goes through the Right common carotid.', 'ok'],
  ['Rank one is the Soft angled wire through the Right subclavian to radial.', 'ok'],
  ['Try the Standard J wire if you want a stiffer tip.', 'ok'],
  ['Head for the carotid next.', 'ok'],
  ['The second route uses the Standard J wire.', 'ok'],
  ["I can't tell that from this case's results.", 'ok'],
  ['It crosses no heavy risk zones: 0 zones.', 'ok'],
  // invented numbers
  ['That route is 45 cm long.', 'number'],
  ['Your route so far is 32 cm.', 'number'],
  ['There are 7 good routes.', 'number'],
  // rounding tricks
  ['The best route is about 43 cm.', 'number'],
  ['The best route is 42.75 cm.', 'number'],
  ['The best route is 42.80 cm.', 'ok'],
  // digits in words
  ['The best route is forty-three centimetres.', 'number'],
  ['Fluoro would take about sixty seconds.', 'number'],
  ['It is nine hundred millimetres long.', 'number'],
  // percentages
  ['It has a 95% success rate.', 'number'],
  ['It succeeds ninety percent of the time.', 'number'],
  // units changed
  ['The best route is 428 mm long.', 'number'],
  ['The best route is 42.8 mm long.', 'number'],
  ['The best route is 0.43 m long.', 'number'],
  ['Fluoro takes 50 minutes.', 'number'],
  ['The next branch is 3 cm ahead.', 'number'],
  // ratios are comparisons the engine never stated
  ['The femoral route is twice as long.', 'number'],
  ['That cuts the fluoro time in half.', 'number'],
  // wrong or invented vessels
  ['Head into the left vertebral artery.', 'name'],
  ['Go through the innominate artery.', 'name'],
  ['The right vertebral is the safer branch.', 'name'],
  ['Take the right internal carotid.', 'name'],
  // invented wires
  ['Switch to a hydrophilic wire.', 'wire'],
  ['A stiffer wire would help here.', 'wire'],
  // extra claims
  ['This is the optimal route.', 'claim'],
  ['The radial route is safer for patients.', 'claim'],
  ['This route is clinically validated.', 'claim'],
  ['I guarantee this route reaches the target.', 'claim'],
  // too long / empty
  ['The best route goes through the Right common carotid. '.repeat(6), 'too_long'],
  ['   ', 'empty'],
];

// Drive facts (Type III → right carotid from the left radial, pushed without rotating): the warning is live,
// 20 mm before the branch point: the tip would enter the Aorta, not the Brachiocephalic trunk; rotate right.
const DRIVE_ROWS: Row[] = [
  ['Careful: the tip will go into the Aorta, not the Brachiocephalic trunk. Rotate right.', 'ok'],
  ["Rotate right now, or you'll slip into the aorta instead of the brachiocephalic trunk.", 'ok'],
  ['The branch point is 20 mm ahead; rotate right.', 'ok'],
  ['Peak force so far was 0.378 N.', 'ok'],
  ['The branch point is 2 cm ahead.', 'number'],
  ['The branch point is 15 mm ahead.', 'number'],
  ['Rotate right by about 40 degrees.', 'number'],
  ['Turn the tip a quarter turn to the right.', 'number'],
  ['Careful, you are heading into the renal artery.', 'name'],
  ['Push harder through the bifurcation.', 'name'],
];

describe('grounding check: adversarial LLM outputs', () => {
  it.each(PLAN_ROWS)('Plan: %j → %s', (text, expected) => {
    const r = groundingCheck(text, plan);
    expect(r.ok ? 'ok' : r.reason, JSON.stringify(r)).toBe(expected);
  });
  it.each(DRIVE_ROWS)('Drive: %j → %s', (text, expected) => {
    const r = groundingCheck(text, drive);
    expect(r.ok ? 'ok' : r.reason, JSON.stringify(r)).toBe(expected);
  });

  it('the length cap is CATHY_MAX_CHARS', () => {
    const at = 'a'.repeat(CATHY_MAX_CHARS);
    expect(groundingCheck(at, plan).ok).toBe(true);
    expect(groundingCheck(`${at}a`, plan)).toMatchObject({ ok: false, reason: 'too_long' });
  });
});

describe('number reading', () => {
  it.each([
    ['42.8 cm', [42.8, 'cm']],
    ['1,250 mm', [1250, 'mm']],
    ['the 71° turn', [71, 'degrees']],
    ['forty-three centimetres', [43, 'cm']],
    ['one hundred and twenty degrees', [120, 'degrees']],
    ['95%', [95, '%']],
    ['0.045 N·s', [0.045, 'N·s']],
  ] as const)('%s', (text, [value, unit]) => {
    expect(numbersIn(text)[0]).toMatchObject({ value, unit });
  });
  it('ordinals and pronoun "one" are not numbers', () => {
    expect(numbersIn('the 2nd route, the first branch, the best one, which one')).toEqual([]);
  });
});

let linesChecked = 0;
describe('every deterministic line is grounded in its own facts', () => {
  for (const { id } of caseIndex.cases) {
    it(id, () => {
      const c = loadBundledCase(id);
      let checked = 0;
      for (const t of c.targets) {
        for (const facts of scenes(id, t.id)) {
          for (const line of facts.lines) {
            const r = groundingCheck(line, facts);
            expect(r, `${id} → ${t.id} (${facts.screen}): ${line}`).toEqual({ ok: true });
            checked++;
          }
        }
      }
      linesChecked += checked;
    }, 60_000);
  }
});

function scenes(id: string, targetId: string) {
  const out = [];
  try {
    out.push(planScene(id, targetId).facts, driveScene(id, targetId, 'warning').facts, driveScene(id, targetId, 'end').facts);
  } catch {
    /* no safe route to this target */
  }
  return out;
}

describe('the deterministic-line sweep checked real lines', () => {
  it('at least 10 lines per bundled case on average', () => {
    expect(linesChecked).toBeGreaterThanOrEqual(10 * caseIndex.cases.length);
  });
});
