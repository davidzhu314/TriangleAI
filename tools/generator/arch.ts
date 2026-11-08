/**
 * Parametric aortic arch generator (spec §3.4). Parameters → control points → centripetal
 * Catmull–Rom splines → centerlines sampled about 1 mm apart from those same splines → one swept
 * tube per vessel → GLB. Branch origins are points on the parent's spline and are shared as graph
 * nodes, so the graph is exact. Millimetres, RAS (+x patient right, +y anterior, +z superior).
 *
 * Seeded and deterministic. Teaching anatomy: shapes and sizes are plausible, not measured.
 * Every bundled generated case (cases.ts) comes from this one function.
 */
import {
  CASE_SCHEMA_ID,
  type ArchType,
  type CaseDifficulty,
  type CaseEntry,
  type CaseJson,
  type CaseRiskZone,
  type CaseTarget,
  type CaseVessel,
  type CenterlineEdge,
  type CenterlineNode,
  type CenterlinesJson,
} from '../../client/src/contracts/case';
import type { Vec3 } from '../../client/src/contracts/events';
import type { GlbMesh } from '../lib/glb';
import { rand3, mulberry32, type Rng } from '../lib/rng';
import { roundTo } from '../lib/stable-json';
import { catmullRom, cumulative, pointAt, resample } from '../lib/spline';
import { appendTube, type TubeGeometry } from '../lib/tube';

const DECIMALS = 4;

export type EntryId = 'fem_r' | 'fem_l' | 'rad_r' | 'rad_l';
export type TargetId = 'rcca' | 'lcca';
export type VesselId = 'aorta' | 'bca' | 'rcca' | 'lcca' | 'r_subclavian' | 'l_subclavian' | 'r_iliac' | 'l_iliac';

export interface RiskZoneSpec {
  id: string;
  kind: CaseRiskZone['kind'];
  tier: CaseRiskZone['tier'];
  /** Edge id from the generated graph, e.g. "e_r_arm". */
  edge: string;
  from_mm: number;
  to_mm: number;
}

export interface ArchParams {
  id: string;
  title: string;
  seed: number;
  arch_type: ArchType;
  /** Brachiocephalic trunk and left common carotid share one origin on the arch (spec §3.4). */
  bovine: boolean;
  /** 0..1: added curvature along the branches. */
  tortuosity: number;
  /** Start and end diameters per vessel, mm; defaults below. Radii taper linearly between them. */
  diameters_mm?: Partial<Record<VesselId, [number, number]>>;
  /** Extra tortuosity weight per vessel (default 1 for iliacs, less elsewhere). */
  tortuosityWeight?: Partial<Record<VesselId, number>>;
  entries: EntryId[];
  targets: TargetId[];
  risk_zones: RiskZoneSpec[];
  scenario: string;
  difficulty: CaseDifficulty;
  fluoro_budget_s: number;
}

const DEFAULT_DIAMETERS_MM: Record<VesselId, [number, number]> = {
  aorta: [18, 28], // bifurcation → root
  bca: [12, 11],
  rcca: [7, 7],
  lcca: [7, 7],
  r_subclavian: [9, 2.6], // origin → wrist (radial)
  l_subclavian: [9, 2.6],
  r_iliac: [9, 7.5], // bifurcation → common femoral
  l_iliac: [9, 7.5],
};

const DEFAULT_WEIGHT: Record<VesselId, number> = {
  aorta: 0,
  bca: 0.15,
  rcca: 0.3,
  lcca: 0.3,
  r_subclavian: 0.3,
  l_subclavian: 0.3,
  r_iliac: 1,
  l_iliac: 1,
};

/** Wiggle amplitude at tortuosity 1 and weight 1, mm. */
const WIGGLE_MM = 28;
/** Takeoff direction jitter (unitless, added before normalising); seeds vary every case a little. */
const TAKEOFF_JITTER = 0.08;
/** Length of the control leg that fixes a branch's takeoff direction, mm. */
const TAKEOFF_LEG_MM = 6;

/**
 * Per arch type: how high the arch rises above where the limbs meet it (mm) and where each origin
 * sits, as arc length from the apex (+ toward the root, − toward the descending aorta). Type III
 * rises higher and its origins slide down the limbs, so a femoral wire meets them at steeper angles.
 */
type TakeoffId = 'bca' | 'lcca' | 'l_arm';
interface ArchShape {
  rise: number;
  lsca: number;
  lcca: number;
  bca: number;
  /** Takeoff directions for this arch type (DECISIONS.md, "D6-min drivability retune"). */
  dirs: Record<TakeoffId, Vec3>;
}
const ARCH: Record<ArchType, ArchShape> = {
  I: { rise: 28, lsca: -24, lcca: -10, bca: 10, dirs: { bca: [0.62, 0.25, 0.75], lcca: [0.1, 0.05, 0.99], l_arm: [-0.85, -0.05, 0.52] } },
  II: { rise: 40, lsca: -22, lcca: -4, bca: 18, dirs: { bca: [0.9, 0.2, 0.4], lcca: [0.35, 0.05, 0.94], l_arm: [-0.95, -0.1, 0.15] } },
  III: { rise: 55, lsca: -20, lcca: -12, bca: 20, dirs: { bca: [0.95, 0.2, 0.2], lcca: [-0.05, 0.05, 0.99], l_arm: [-0.95, -0.1, 0.15] } },
};

/**
 * Bovine arch (DECISIONS.md, D6): one common origin for the brachiocephalic trunk and the left common
 * carotid, placed this far from the apex toward the root (mm). The LCCA leaves the common origin up
 * and to the left, so from the femoral side it is a steeper takeoff than a normal LCCA, and the tip
 * has to be rolled away from the bigger brachiocephalic trunk beside it.
 */
const BOVINE = { fromApex: 2, dirs: { bca: [0.8, 0.25, 0.55] as Vec3, lcca: [0.4, 0.05, 0.92] as Vec3 }, lccaPath: [[-14, 4, 50], [-26, 6, 120]] as Vec3[] };

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const unit = (a: Vec3): Vec3 => scale(a, 1 / Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]));
const round3 = (p: Vec3): Vec3 => [roundTo(p[0], DECIMALS), roundTo(p[1], DECIMALS), roundTo(p[2], DECIMALS)];

interface BranchSpec {
  vessel: VesselId;
  /** Takeoff direction before jitter. */
  dir: Vec3;
  /** Control points after the takeoff leg, as offsets from the origin, mm. */
  path: Vec3[];
  /** When the branch is a stub, how many of `path` it keeps. */
  stub?: number;
}

const mirror = (p: Vec3): Vec3 => [-p[0], p[1], p[2]];

const ARM_PATH: Vec3[] = [[30, -2, -16], [60, 0, -30], [92, 8, -86], [118, 15, -170], [138, 24, -258]];
const ILIAC_PATH: Vec3[] = [[10, 2, -32], [20, 5, -64], [30, 8, -96], [40, 11, -128], [52, 14, -160], [66, 18, -192]];

const BRANCHES = {
  bca: { vessel: 'bca', dir: [0.62, 0.25, 0.75], path: [[14, 6, 18], [24, 10, 30]] },
  rcca: { vessel: 'rcca', dir: [0.05, 0.1, 1], path: [[8, 10, 50], [12, 12, 112]] },
  lcca: { vessel: 'lcca', dir: [-0.25, 0.05, 0.97], path: [[-10, 4, 55], [-14, 6, 125]] },
  r_arm: { vessel: 'r_subclavian', dir: [0.85, 0, -0.5], path: ARM_PATH, stub: 2 },
  l_arm: { vessel: 'l_subclavian', dir: [-0.85, -0.05, 0.52], path: ARM_PATH.map(mirror), stub: 2 },
  r_iliac: { vessel: 'r_iliac', dir: [0.3, 0.05, -0.95], path: ILIAC_PATH, stub: 3 },
  l_iliac: { vessel: 'l_iliac', dir: [-0.3, 0.05, -0.95], path: ILIAC_PATH.map(mirror), stub: 3 },
} satisfies Record<string, BranchSpec & { vessel: VesselId; dir: Vec3 }>;

function aortaControl(rise: number): Vec3[] {
  const top = 300;
  return [
    [0, 0, 0], // aortic bifurcation
    [-4, -8, 110],
    [-12, -20, 230],
    [-18, -25, top],
    [-16, -18, top + 0.75 * rise],
    [-2, -6, top + rise], // apex
    [12, 6, top + 0.75 * rise],
    [18, 14, top],
    [14, 18, top - 45], // root
  ];
}

export interface GeneratedCase {
  caseJson: CaseJson;
  centerlines: CenterlinesJson;
  meshes: GlbMesh[];
}

export function generateArch(p: ArchParams): GeneratedCase {
  const rng: Rng = mulberry32(p.seed);
  const diam = { ...DEFAULT_DIAMETERS_MM, ...p.diameters_mm };
  const weight = { ...DEFAULT_WEIGHT, ...p.tortuosityWeight };
  const has = (e: EntryId) => p.entries.includes(e);

  const nodes: CenterlineNode[] = [];
  const edges: CenterlineEdge[] = [];
  const node = (id: string, pos: Vec3, kind: CenterlineNode['kind']) => {
    nodes.push({ id, pos, kind });
    return id;
  };

  const radiusAt = (v: VesselId, frac: number) => roundTo((diam[v][0] + (diam[v][1] - diam[v][0]) * frac) / 2, DECIMALS);

  /** Add edges along one spline, split at `splits` (arc lengths), between the given node ids. */
  const addSplit = (
    dense: Vec3[], cs: number[], vessel: VesselId, splits: number[], nodeIds: string[], edgeIds: string[],
  ) => {
    const L = cs[cs.length - 1]!;
    for (let k = 0; k < edgeIds.length; k++) {
      const a = splits[k]!;
      const b = splits[k + 1]!;
      const pts = resample(dense, cs, a, b).map(round3);
      pts[0] = nodes.find((n) => n.id === nodeIds[k])!.pos;
      pts[pts.length - 1] = nodes.find((n) => n.id === nodeIds[k + 1])!.pos;
      const n = pts.length - 1;
      edges.push({
        id: edgeIds[k]!, from: nodeIds[k]!, to: nodeIds[k + 1]!, vessel, points: pts,
        radii_mm: pts.map((_, i) => radiusAt(vessel, (a + ((b - a) * i) / n) / L)),
      });
    }
  };

  // ---------------------------------------------------------------- aorta
  const arch = ARCH[p.arch_type];
  const aortaCtl = aortaControl(arch.rise);
  const aorta = catmullRom(aortaCtl);
  const aortaCs = cumulative(aorta);
  const apexIndex = aorta.findIndex((q) => q === aortaCtl[5]);
  const sApex = aortaCs[apexIndex]!;
  const L = aortaCs[aortaCs.length - 1]!;
  const sAt = { lsca: sApex + arch.lsca, lcca: sApex + arch.lcca, bca: p.bovine ? sApex + BOVINE.fromApex : sApex + arch.bca };
  const at = (s: number) => round3(pointAt(aorta, aortaCs, s));
  node('n_aortic_bif', round3(aorta[0]!), 'branch');
  node('n_lsca_o', at(sAt.lsca), 'branch');
  if (p.bovine) {
    // One common origin: the LCCA leaves from n_bca_o, and the arch has no separate LCCA node.
    node('n_bca_o', at(sAt.bca), 'branch');
    node('n_root', round3(aorta[aorta.length - 1]!), 'end');
    addSplit(aorta, aortaCs, 'aorta', [0, sAt.lsca, sAt.bca, L],
      ['n_aortic_bif', 'n_lsca_o', 'n_bca_o', 'n_root'],
      ['e_aorta_desc', 'e_arch_distal', 'e_aorta_asc']);
  } else {
    node('n_lcca_o', at(sAt.lcca), 'branch');
    node('n_bca_o', at(sAt.bca), 'branch');
    node('n_root', round3(aorta[aorta.length - 1]!), 'end');
    addSplit(aorta, aortaCs, 'aorta', [0, sAt.lsca, sAt.lcca, sAt.bca, L],
      ['n_aortic_bif', 'n_lsca_o', 'n_lcca_o', 'n_bca_o', 'n_root'],
      ['e_aorta_desc', 'e_arch_distal', 'e_arch_proximal', 'e_aorta_asc']);
  }

  // ---------------------------------------------------------------- branches
  /** Build a branch from node `fromId`; returns nothing, adds one edge to `toId`. */
  const branch = (spec: BranchSpec, fromId: string, toId: string, toKind: CenterlineNode['kind'], edgeId: string, full: boolean) => {
    const origin = nodes.find((n) => n.id === fromId)!.pos;
    const dir = unit(add(spec.dir, scale(rand3(rng), TAKEOFF_JITTER)));
    const amp = WIGGLE_MM * p.tortuosity * weight[spec.vessel];
    const path = full ? spec.path : spec.path.slice(0, spec.stub ?? spec.path.length);
    // Wiggle interior control points only: the takeoff leg and the end stay put.
    const wiggles = spec.path.map(() => scale(rand3(rng), amp));
    const ctl: Vec3[] = [origin, add(origin, scale(dir, TAKEOFF_LEG_MM))];
    path.forEach((q, i) => ctl.push(i === path.length - 1 ? add(origin, q) : add(add(origin, q), wiggles[i]!)));
    const dense = catmullRom(ctl);
    const cs = cumulative(dense);
    node(toId, round3(dense[dense.length - 1]!), toKind);
    addSplit(dense, cs, spec.vessel, [0, cs[cs.length - 1]!], [fromId, toId], [edgeId]);
  };

  // Every branch draws from the generator in the same order whether or not it is a stub, so
  // adding an entry does not reshuffle the rest of the case.
  branch({ ...BRANCHES.bca, dir: p.bovine ? BOVINE.dirs.bca : arch.dirs.bca }, 'n_bca_o', 'n_bca_bif', 'branch', 'e_bca', true);
  branch(BRANCHES.rcca, 'n_bca_bif', 'n_rcca', p.targets.includes('rcca') ? 'target' : 'end', 'e_rcca', true);
  branch(BRANCHES.r_arm, 'n_bca_bif', has('rad_r') ? 'n_rad_r' : 'n_r_arm_end', has('rad_r') ? 'entry' : 'end', 'e_r_arm', has('rad_r'));
  const lcca = p.bovine ? { ...BRANCHES.lcca, dir: BOVINE.dirs.lcca, path: BOVINE.lccaPath } : { ...BRANCHES.lcca, dir: arch.dirs.lcca };
  branch(lcca, p.bovine ? 'n_bca_o' : 'n_lcca_o', 'n_lcca', p.targets.includes('lcca') ? 'target' : 'end', 'e_lcca', true);
  branch({ ...BRANCHES.l_arm, dir: arch.dirs.l_arm }, 'n_lsca_o', has('rad_l') ? 'n_rad_l' : 'n_l_arm_end', has('rad_l') ? 'entry' : 'end', 'e_l_arm', has('rad_l'));
  branch(BRANCHES.r_iliac, 'n_aortic_bif', has('fem_r') ? 'n_fem_r' : 'n_r_iliac_end', has('fem_r') ? 'entry' : 'end', 'e_r_iliac', has('fem_r'));
  branch(BRANCHES.l_iliac, 'n_aortic_bif', has('fem_l') ? 'n_fem_l' : 'n_l_iliac_end', has('fem_l') ? 'entry' : 'end', 'e_l_iliac', has('fem_l'));

  // ---------------------------------------------------------------- case.json
  const vessels: CaseVessel[] = [
    { id: 'aorta', name: 'Aorta', kind: 'artery' },
    { id: 'bca', name: 'Brachiocephalic trunk', kind: 'artery' },
    { id: 'rcca', name: 'Right common carotid', kind: 'artery' },
    { id: 'lcca', name: 'Left common carotid', kind: 'artery' },
    { id: 'r_subclavian', name: has('rad_r') ? 'Right subclavian to radial' : 'Right subclavian', kind: 'artery' },
    { id: 'l_subclavian', name: has('rad_l') ? 'Left subclavian to radial' : 'Left subclavian', kind: 'artery' },
    { id: 'r_iliac', name: has('fem_r') ? 'Right iliac to femoral' : 'Right iliac', kind: 'artery' },
    { id: 'l_iliac', name: has('fem_l') ? 'Left iliac to femoral' : 'Left iliac', kind: 'artery' },
  ];
  const ENTRY_NAMES: Record<EntryId, string> = { fem_r: 'Right femoral', fem_l: 'Left femoral', rad_r: 'Right radial', rad_l: 'Left radial' };
  const entries: CaseEntry[] = (['fem_r', 'fem_l', 'rad_r', 'rad_l'] as const)
    .filter(has)
    .map((e) => ({ id: e, name: ENTRY_NAMES[e], node: `n_${e}` }));
  const TARGET_NAMES: Record<TargetId, string> = { rcca: 'Right common carotid', lcca: 'Left common carotid' };
  const targets: CaseTarget[] = (['rcca', 'lcca'] as const)
    .filter((t) => p.targets.includes(t))
    .map((t) => ({ id: t, name: TARGET_NAMES[t], node: `n_${t}` }));

  const caseJson: CaseJson = {
    schema: CASE_SCHEMA_ID,
    id: p.id,
    title: p.title,
    units: 'mm',
    axes: 'RAS',
    source: { kind: 'parametric', dataset: 'ThreadSim arch generator (tools/generator)', license: 'Generated by ThreadSim tools; no third-party data', seed: p.seed },
    physics: { available: false },
    scenario: p.scenario,
    difficulty: p.difficulty,
    fluoro_budget_s: p.fluoro_budget_s,
    anatomy: { arch_type: p.arch_type, bovine: p.bovine, tortuosity: p.tortuosity },
    vessels,
    entries,
    targets,
    riskZones: p.risk_zones.map((z) => ({ ...z })),
  };

  // ---------------------------------------------------------------- mesh from the same centerlines
  const meshes: GlbMesh[] = vessels.map((v) => {
    const g: TubeGeometry = { positions: [], normals: [], indices: [] };
    for (const e of edges.filter((x) => x.vessel === v.id)) appendTube(g, e.points, e.radii_mm);
    return { name: v.id, positions: Float32Array.from(g.positions), normals: Float32Array.from(g.normals), indices: Uint32Array.from(g.indices) };
  });

  return { caseJson, centerlines: { nodes, edges }, meshes };
}
