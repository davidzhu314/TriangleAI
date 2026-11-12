/**
 * Case package — spec §3.2. Producer: David (tools/, loader in client/src/case/). Consumers: Vaibhav, Aroovee.
 *
 * Two layers:
 * - Stored (`CaseJson`, `CenterlinesJson`, and the vertices in vessels.glb): millimetres, RAS axes,
 *   field names as the spec writes them. `case.schema.json` validates these files.
 * - Loaded (`LoadedCase`): metres, Y-up, camelCase. The loader converts once with `rasMmToYupM`;
 *   every contract after load uses metres.
 *
 * Bundled cases are unzipped folders under client/public/cases/<id>/ listed in cases/index.json;
 * imported cases are case.zip; phantom cases are served by the physics process. All three load the same way.
 */
import type { Vec3 } from './events';
import type { PhantomId } from './physics-protocol';
import type { ValidationResult } from './validation';

export const CASE_SCHEMA_ID = 'threadsim.case/1';

// ================================================================ stored (mm, RAS)

export type CaseSourceKind = 'ct' | 'parametric' | 'cathsim';

export interface CaseSourceInfo {
  kind: CaseSourceKind;
  /** Dataset name or generator name. */
  dataset?: string;
  /** License of the anatomy, e.g. "CC-BY-4.0" or "CC BY-NC-SA 4.0". */
  license: string;
  /** Generator seed (parametric cases), so the case can be rebuilt byte for byte. */
  seed?: number;
}

export interface CasePhysicsInfo {
  /** True only for the four CathSim phantoms; the validator downgrades anything else to planning only. */
  available: boolean;
  /** Required when `available` is true. */
  phantom?: PhantomId;
}

export type VesselKind = 'artery' | 'vein';

export interface CaseVessel {
  /** Equals the mesh node name in vessels.glb and `CenterlineEdge.vessel`. */
  id: string;
  name: string;
  kind: VesselKind;
}

export interface CaseEntry {
  /** e.g. "fem_r", "fem_l", "rad_r", "rad_l". */
  id: string;
  name: string;
  /** Centerline node id. */
  node: string;
}

export interface CaseTarget {
  /** Phantom cases use the CathSim target ids "bca" and "lcca". */
  id: string;
  name: string;
  /** Centerline node id. */
  node: string;
}

export type RiskZoneKind = 'plaque' | 'aneurysm' | 'dissection' | 'critical_branch';

/** forbidden: route removed (§4.4). heavy: counted as a crossing (§4.7). proximity: clearance penalty (§4.6). */
export type RiskTier = 'forbidden' | 'heavy' | 'proximity';

export interface CaseRiskZone {
  id: string;
  kind: RiskZoneKind;
  tier: RiskTier;
  /** Edge the zone lies on. */
  edge: string;
  /** Arc length along the edge from its `from` node, mm. */
  from_mm: number;
  /** Arc length along the edge from its `from` node, mm; ≥ from_mm. */
  to_mm: number;
}

/** Position on the §5.5 view ladder and the Library card. */
export type CaseDifficulty = 'beginner' | 'intermediate' | 'expert';

export type ArchType = 'I' | 'II' | 'III';

/** Anatomy descriptors used by the unlock ladder (§6.5) and the generator (§3.4). All optional. */
export interface CaseAnatomy {
  arch_type?: ArchType;
  bovine?: boolean;
  /** 0..1, generator input. */
  tortuosity?: number;
}

export type Species = 'human' | 'porcine' | 'ovine' | 'canine' | 'other';

/** Who the scan is of, when it matters (a large-animal study's CT). Never a patient identifier. */
export interface CaseSubject {
  species: Species;
  /** A study label such as "Pig 03". Never a name, record number or date of birth. */
  label?: string;
}

/** case.json. */
export interface CaseJson {
  schema: typeof CASE_SCHEMA_ID;
  id: string;
  title: string;
  units: 'mm';
  axes: 'RAS';
  source: CaseSourceInfo;
  physics: CasePhysicsInfo;
  vessels: CaseVessel[];
  entries: CaseEntry[];
  targets: CaseTarget[];
  riskZones: CaseRiskZone[];
  /** Case brief scenario card text (§7.1). Teaching scenario, never a real patient. */
  scenario?: string;
  difficulty?: CaseDifficulty;
  /** Fluoro allowance for the radiation budget (§6.5), seconds. */
  fluoro_budget_s?: number;
  anatomy?: CaseAnatomy;
  /** Absent means unstated; the real CT cases are human. */
  subject?: CaseSubject;
}

export type CenterlineNodeKind = 'entry' | 'branch' | 'target' | 'end';

export interface CenterlineNode {
  id: string;
  /** mm, RAS. */
  pos: Vec3;
  kind: CenterlineNodeKind;
}

export interface CenterlineEdge {
  id: string;
  from: string;
  to: string;
  /** Vessel id. */
  vessel: string;
  /** mm, RAS, about 1 mm apart; first point at `from`, last at `to`. */
  points: Vec3[];
  /** Maximum inscribed radius at each point, mm. Same length as `points`. */
  radii_mm: number[];
}

/** centerlines.json. */
export interface CenterlinesJson {
  nodes: CenterlineNode[];
  edges: CenterlineEdge[];
}

/** client/public/cases/index.json: the bundled cases the Library lists. */
export interface BundledCaseIndex {
  cases: { id: string; /** Folder relative to cases/, ending in "/". */ path: string }[];
}

/** File names inside a package (zip or folder). */
export const CASE_FILES = {
  case: 'case.json',
  centerlines: 'centerlines.json',
  mesh: 'vessels.glb',
} as const;

// ================================================================ conversion (one place, both ends)

/**
 * RAS millimetres → Y-up metres: (x, y, z)_RAS ↦ (−x, z, y) / 1000.
 * +X = patient left, +Y = superior, +Z = anterior: the default camera on +Z sees an AP view with the
 * patient's left on the viewer's right (radiological convention). A proper rotation, no mirror.
 * The physics process applies the same map before sending positions (physics/wire_protocol.py).
 */
export function rasMmToYupM(p: Vec3): Vec3 {
  return [-p[0] / 1000, p[2] / 1000, p[1] / 1000];
}

/** The same map as a column-major 4×4 matrix (three.js `Matrix4.fromArray`), for vessels.glb. */
export const RAS_MM_TO_YUP_M: readonly number[] = [
  -0.001, 0, 0, 0,
  0, 0, 0.001, 0,
  0, 0.001, 0, 0,
  0, 0, 0, 1,
];

// ================================================================ loaded (m, Y-up)

/** bundled: client/public/cases; imported: a dropped case.zip; physics: served by the physics process. */
export type CaseOrigin = 'bundled' | 'imported' | 'physics';

export interface LoadedNode {
  id: string;
  /** Metres, Y-up. */
  pos: Vec3;
  kind: CenterlineNodeKind;
}

export interface LoadedEdge {
  id: string;
  from: string;
  to: string;
  vessel: string;
  /** Metres, Y-up. */
  points: Vec3[];
  /** Metres, one per point. */
  radiiM: number[];
  /** Polyline arc length, metres. */
  lengthM: number;
}

export interface LoadedRiskZone {
  id: string;
  kind: RiskZoneKind;
  tier: RiskTier;
  edge: string;
  /** Arc length along the edge from its `from` node, metres. */
  fromM: number;
  toM: number;
}

export interface LoadedMesh {
  /** vessels.glb bytes as stored (mm, RAS), after any decimation. One node per vessel, named by vessel id. */
  glb: ArrayBuffer;
  /** Column-major 4×4 from file coordinates to metres Y-up; RAS_MM_TO_YUP_M unless a fix changed it. */
  toWorld: number[];
  triangles: number;
}

/** A case after load and validation. Everything the planner, rail wire and renderer need. */
export interface LoadedCase {
  id: string;
  title: string;
  origin: CaseOrigin;
  source: CaseSourceInfo;
  /** Physics mode allowed: a known phantom (and, at runtime, the physics process answering). */
  physics: CasePhysicsInfo;
  /** True when physics is not available: show the "Planning only" badge. */
  planningOnly: boolean;
  scenario?: string;
  difficulty?: CaseDifficulty;
  fluoroBudgetS?: number;
  anatomy?: CaseAnatomy;
  subject?: CaseSubject;
  vessels: CaseVessel[];
  entries: CaseEntry[];
  /** Targets the validator found unreachable from every entry are still listed, with `reachable: false`. */
  targets: (CaseTarget & { reachable: boolean })[];
  riskZones: LoadedRiskZone[];
  nodes: LoadedNode[];
  edges: LoadedEdge[];
  mesh: LoadedMesh;
  /** Every non-error result from load (warnings and notices). */
  validation: ValidationResult[];
}
