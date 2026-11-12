import { describe, expect, it } from 'vitest';
import { APEX_SCHEMA, ApexFileError, apexPlan, icsName, parseApexJson, sheathLine, type ApexCandidateJson, type ApexJson } from '.';

const cand = (id: string, over: Partial<ApexCandidateJson>): ApexCandidateJson => ({
  id,
  pos: [-50, 200, -160],
  coaxial_deg: 20,
  from_apex_mm: 10,
  to_valve_mm: 80,
  wall_depth_mm: 30,
  lung_mm: 0,
  bone_clearance_mm: 6,
  nearest_bone: 'Left rib 6',
  ics: 5,
  ...over,
});

const file = (candidates: ApexCandidateJson[], landmarks: ApexJson['landmarks'] = 'hand-marked'): ApexJson => ({
  schema: APEX_SCHEMA,
  units: 'mm',
  axes: 'RAS',
  landmarks,
  valve: { center: [0, 160, -100], axis: [-0.5, 0.5, -0.7071], hinges: [[10, 160, -100], [-5, 168, -100], [-5, 152, -100]] },
  apex: [-55, 210, -165],
  candidate_radius_mm: 30,
  candidates,
});

describe('apex.json', () => {
  it('accepts a well-formed file and rejects malformed ones', () => {
    expect(parseApexJson(file([cand('c1', {})])).candidates).toHaveLength(1);
    expect(() => parseApexJson({ ...file([]), schema: 'x' })).toThrow(ApexFileError);
    expect(() => parseApexJson({ ...file([]), landmarks: 'guessed' })).toThrow(/landmarks/);
    expect(() => parseApexJson(file([cand('c1', { ics: 0 })]))).toThrow(/candidate 1/);
    expect(() => parseApexJson(file([cand('c1', { pos: [1, 2] as never })]))).toThrow(/candidate 1/);
  });
});

describe('apex plan', () => {
  it('keeps only candidates no other beats on every measure', () => {
    const plan = apexPlan(
      file([
        cand('coax', { coaxial_deg: 8, bone_clearance_mm: 4 }),
        cand('clear', { coaxial_deg: 25, bone_clearance_mm: 11 }),
        cand('worse', { coaxial_deg: 26, bone_clearance_mm: 3, wall_depth_mm: 40, from_apex_mm: 20 }),
      ]),
    );
    expect(plan.frontier.map((c) => c.id)).toEqual(['coax', 'clear']);
    expect(plan.measured).toBe(3);
    expect(plan.frontier[0]!.picks).toContain('coaxial');
    expect(plan.frontier[1]!.picks).toContain('clearance');
  });

  it('judges against the illustrative thresholds, with reasons', () => {
    const plan = apexPlan(
      file([
        cand('good', { coaxial_deg: 10, bone_clearance_mm: 7, from_apex_mm: 30 }),
        cand('fair', { coaxial_deg: 22, bone_clearance_mm: 12, from_apex_mm: 30 }),
        cand('bone', { coaxial_deg: 5, bone_clearance_mm: 0.3, nearest_bone: 'Costal cartilage' }),
        cand('lung', { coaxial_deg: 9, bone_clearance_mm: 8, lung_mm: 14, wall_depth_mm: 20 }),
      ]),
    );
    const by = Object.fromEntries(plan.frontier.map((c) => [c.id, c]));
    expect(by['good']!.verdict).toBe('good');
    expect(by['good']!.reasons).toEqual([]);
    expect(by['fair']!.verdict).toBe('fair');
    expect(by['bone']!.verdict).toBe('poor');
    expect(by['bone']!.reasons.join(' ')).toMatch(/through the costal cartilage/);
    expect(by['lung']!.reasons.join(' ')).toMatch(/14 mm of lung/);
    expect(by['fair']!.reasons.join(' ')).toMatch(/Between 15° and 30°/);
    // The suggestion skips lines through bone or lung, even more coaxial ones.
    expect(plan.suggested?.id).toBe('good');
  });

  it('flags draft landmarks and draws the line from the rib cage to the valve', () => {
    const plan = apexPlan(file([cand('c1', {})], 'draft'));
    expect(plan.draft).toBe(true);
    const line = sheathLine(plan, plan.frontier[0]!);
    expect(line).toHaveLength(3);
    // Puncture to valve is to_valve_mm; rib cage to puncture is wall_depth_mm (metres in the 3D frame).
    const d = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!) * 1000;
    expect(d(line[0]!, line[1]!)).toBeCloseTo(30, 6);
    expect(line[2]).toEqual(plan.valveAt);
  });

  it('names intercostal spaces', () => {
    expect(icsName(5)).toBe('5th intercostal space');
    expect(icsName(1)).toBe('1st intercostal space');
    expect(icsName(2)).toBe('2nd intercostal space');
    expect(icsName(11)).toBe('11th intercostal space');
    expect(icsName(null)).toBeNull();
  });
});
