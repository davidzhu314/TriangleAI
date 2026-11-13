/**
 * Apex plan: where to go in through the heart's apex for a transcatheter valve. Pure functions; no DOM, no AI.
 *
 * The geometry comes from the case's apex.json (slicer/export_apex.py): the hand-marked valve plane and apex, and per
 * candidate puncture point on the heart's surface, the sheath line's angle off the valve axis, the distance to the rib
 * cage, the lung it crosses, its closest approach to bone and the intercostal space it leaves through. This module
 * validates the file, keeps the candidates no other candidate beats on every measure (the frontier), names what each
 * frontier candidate is best at, and gives each a verdict against illustrative thresholds.
 */
import { rasMmToYupM, type Vec3 } from '../contracts';

export const APEX_SCHEMA = 'threadsim.apex/1';

/** Illustrative thresholds, labelled so on screen. */
export const COAXIAL_GOOD_DEG = 15;
export const COAXIAL_FAIR_DEG = 30;
/** Half of an illustrative 8 mm sheath plus 1 mm: below this the line grazes a rib or cartilage. */
export const BONE_CLEAR_MM = 5;
/** Below this the line goes through bone or cartilage. */
export const BONE_HIT_MM = 1.5;

export interface ApexCandidateJson {
  id: string;
  /** RAS mm. */
  pos: Vec3;
  coaxial_deg: number;
  from_apex_mm: number;
  to_valve_mm: number;
  /** null when the line never leaves the rib cage within the export's reach. */
  wall_depth_mm: number | null;
  lung_mm: number;
  bone_clearance_mm: number;
  nearest_bone: string;
  /** Intercostal space k (between left ribs k and k + 1), or null when the nearest two ribs aren't consecutive. */
  ics: number | null;
}

export interface ApexJson {
  schema: typeof APEX_SCHEMA;
  units: 'mm';
  axes: 'RAS';
  /** "hand-marked": a person marked the valve and apex on the CT. "draft": a script did, to test the pipeline. */
  landmarks: 'hand-marked' | 'draft';
  valve: { center: Vec3; axis: Vec3; hinges: Vec3[] };
  apex: Vec3;
  candidate_radius_mm: number;
  candidates: ApexCandidateJson[];
}

export class ApexFileError extends Error {}

const isVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x));
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Throws ApexFileError naming the first problem. */
export function parseApexJson(raw: unknown): ApexJson {
  const fail = (why: string): never => {
    throw new ApexFileError(`apex.json: ${why}`);
  };
  if (!raw || typeof raw !== 'object') fail('not an object');
  const j = raw as Record<string, unknown>;
  if (j['schema'] !== APEX_SCHEMA) fail(`schema is not ${APEX_SCHEMA}`);
  if (j['units'] !== 'mm' || j['axes'] !== 'RAS') fail('units must be mm and axes RAS');
  if (j['landmarks'] !== 'hand-marked' && j['landmarks'] !== 'draft') fail('landmarks must be "hand-marked" or "draft"');
  const v = j['valve'] as Record<string, unknown> | undefined;
  if (!v || !isVec3(v['center']) || !isVec3(v['axis']) || !Array.isArray(v['hinges']) || v['hinges'].length !== 3 || !v['hinges'].every(isVec3)) fail('valve needs center, axis and three hinges');
  if (!isVec3(j['apex'])) fail('apex must be a point');
  if (!isNum(j['candidate_radius_mm'])) fail('candidate_radius_mm must be a number');
  if (!Array.isArray(j['candidates'])) fail('candidates must be a list');
  for (const [i, c] of (j['candidates'] as Record<string, unknown>[]).entries()) {
    const ok =
      typeof c['id'] === 'string' &&
      isVec3(c['pos']) &&
      ['coaxial_deg', 'from_apex_mm', 'to_valve_mm', 'lung_mm', 'bone_clearance_mm'].every((k) => isNum(c[k])) &&
      (c['wall_depth_mm'] === null || isNum(c['wall_depth_mm'])) &&
      typeof c['nearest_bone'] === 'string' &&
      (c['ics'] === null || (Number.isInteger(c['ics']) && (c['ics'] as number) >= 1 && (c['ics'] as number) <= 11));
    if (!ok) fail(`candidate ${i + 1} is malformed`);
  }
  return raw as ApexJson;
}

// ================================================================ plan

export type ApexVerdict = 'good' | 'fair' | 'poor';

/** What a frontier candidate is best at. */
export type ApexPick = 'coaxial' | 'clearance' | 'shallow' | 'near_apex';

export interface ApexCandidate {
  id: string;
  /** Metres, Y-up (the case's 3D frame). */
  at: Vec3;
  /** Where the line leaves the rib cage, metres Y-up; null when it doesn't within the export's reach. */
  wallAt: Vec3 | null;
  coaxialDeg: number;
  fromApexMm: number;
  toValveMm: number;
  wallDepthMm: number | null;
  lungMm: number;
  boneClearanceMm: number;
  nearestBone: string;
  ics: number | null;
  verdict: ApexVerdict;
  /** Plain-language reasons, from the numbers above. Empty when it's good. */
  reasons: string[];
  /** The measures this candidate is best at among the frontier (none for a candidate off the frontier). */
  picks: ApexPick[];
}

export interface ApexPlan {
  draft: boolean;
  /** Metres, Y-up. */
  valveAt: Vec3;
  /** Valve axis end 30 mm into the ventricle, metres Y-up (for drawing). */
  valveAxisEnd: Vec3;
  apexAt: Vec3;
  candidateRadiusMm: number;
  /** Candidates no other one beats on every measure, most coaxial first. */
  frontier: ApexCandidate[];
  /** How many candidates the export measured. */
  measured: number;
  /** The frontier candidate the screen opens on: the most coaxial one that doesn't go through bone or lung. */
  suggested: ApexCandidate | null;
}

const ordinal = (n: number): string => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

export function icsName(ics: number | null): string | null {
  return ics === null ? null : `${ordinal(ics)} intercostal space`;
}

function judge(c: ApexCandidateJson): { verdict: ApexVerdict; reasons: string[] } {
  const reasons: string[] = [];
  let poor = false;
  if (c.coaxial_deg > COAXIAL_FAIR_DEG) {
    poor = true;
    reasons.push(`More than ${COAXIAL_FAIR_DEG}° off the valve axis: the sheath would meet the valve at a slant.`);
  } else if (c.coaxial_deg > COAXIAL_GOOD_DEG) reasons.push(`Between ${COAXIAL_GOOD_DEG}° and ${COAXIAL_FAIR_DEG}° off the valve axis.`);
  if (c.bone_clearance_mm < BONE_HIT_MM) {
    poor = true;
    reasons.push(`Goes through the ${c.nearest_bone.toLowerCase()}.`);
  } else if (c.bone_clearance_mm < BONE_CLEAR_MM) reasons.push(`Passes ${c.bone_clearance_mm.toFixed(1)} mm from the ${c.nearest_bone.toLowerCase()}.`);
  if (c.lung_mm > 0) {
    poor = true;
    reasons.push(`Crosses ${c.lung_mm.toFixed(0)} mm of lung.`);
  }
  if (c.wall_depth_mm === null) {
    poor = true;
    reasons.push('Doesn’t reach the chest wall within the measured range.');
  }
  return { verdict: poor ? 'poor' : reasons.length ? 'fair' : 'good', reasons };
}

/** Measures to minimise, in order: off-axis angle, minus bone clearance, lung, depth to the rib cage, distance from the apex. */
function costs(c: ApexCandidateJson): number[] {
  return [c.coaxial_deg, -c.bone_clearance_mm, c.lung_mm, c.wall_depth_mm ?? Infinity, c.from_apex_mm];
}

function dominates(a: number[], b: number[]): boolean {
  let strictly = false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]! > b[i]!) return false;
    if (a[i]! < b[i]!) strictly = true;
  }
  return strictly;
}

const mmToM = (p: Vec3): Vec3 => rasMmToYupM(p);

export function apexPlan(j: ApexJson): ApexPlan {
  const [cx, cy, cz] = j.valve.center;
  const [ax, ay, az] = j.valve.axis;
  const all = j.candidates.map((c) => ({ c, k: costs(c) }));
  const front = all.filter((x) => !all.some((y) => y !== x && dominates(y.k, x.k)));
  const best = (i: number): string | undefined => [...front].sort((a, b) => a.k[i]! - b.k[i]!)[0]?.c.id;
  const pickOf: [ApexPick, string | undefined][] = [
    ['coaxial', best(0)],
    ['clearance', best(1)],
    ['shallow', best(3)],
    ['near_apex', best(4)],
  ];
  const frontier: ApexCandidate[] = front
    .map(({ c }) => {
      const { verdict, reasons } = judge(c);
      const [px, py, pz] = c.pos;
      const len = Math.hypot(cx - px, cy - py, cz - pz) || 1;
      const out: Vec3 = [(px - cx) / len, (py - cy) / len, (pz - cz) / len];
      const wall: Vec3 | null = c.wall_depth_mm === null ? null : [px + out[0] * c.wall_depth_mm, py + out[1] * c.wall_depth_mm, pz + out[2] * c.wall_depth_mm];
      return {
        id: c.id,
        at: mmToM(c.pos),
        wallAt: wall && mmToM(wall),
        coaxialDeg: c.coaxial_deg,
        fromApexMm: c.from_apex_mm,
        toValveMm: c.to_valve_mm,
        wallDepthMm: c.wall_depth_mm,
        lungMm: c.lung_mm,
        boneClearanceMm: c.bone_clearance_mm,
        nearestBone: c.nearest_bone,
        ics: c.ics,
        verdict,
        reasons,
        picks: pickOf.filter(([, id]) => id === c.id).map(([p]) => p),
      };
    })
    .sort((a, b) => a.coaxialDeg - b.coaxialDeg || a.id.localeCompare(b.id));
  const safe = frontier.filter((c) => c.boneClearanceMm >= BONE_HIT_MM && c.lungMm === 0 && c.wallDepthMm !== null);
  return {
    draft: j.landmarks === 'draft',
    valveAt: mmToM(j.valve.center),
    valveAxisEnd: mmToM([cx + ax * 30, cy + ay * 30, cz + az * 30]),
    apexAt: mmToM(j.apex),
    candidateRadiusMm: j.candidate_radius_mm,
    frontier,
    measured: j.candidates.length,
    suggested: safe[0] ?? frontier[0] ?? null,
  };
}

/** The sheath line drawn on screen: rib cage → puncture → valve centre, metres Y-up. */
export function sheathLine(plan: ApexPlan, c: ApexCandidate): Vec3[] {
  return c.wallAt ? [c.wallAt, c.at, plan.valveAt] : [c.at, plan.valveAt];
}
