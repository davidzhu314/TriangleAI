/**
 * The §3.5 checks, one function per row, on the stored package (mm, RAS). Severities follow
 * DECISIONS.md: error rejects (schema), warning loads with something flagged, dropped or a fix
 * offered, notice is logged silently (privacy).
 *
 * Checks that drop things (radii, graph) edit the package they are given; loadCase passes copies.
 */
import schema from '../contracts/case.schema.json';
import {
  AORTA_RADIUS_RANGE_MM,
  AORTA_VESSEL_ID,
  MESH_TRIANGLE_BUDGET,
  type CaseJson,
  type CaseOrigin,
  type CenterlineEdge,
  type CenterlinesJson,
  type PhantomId,
  type ValidationCheckId,
  type ValidationResult,
  type Vec3,
} from '../contracts';

/** Order of the §3.5 table; results are reported in this order. */
export const CHECK_ORDER: readonly ValidationCheckId[] = ['schema', 'units', 'axes', 'graph', 'radii', 'mesh_budget', 'privacy', 'physics'];

export const KNOWN_PHANTOMS: readonly PhantomId[] = ['low_tort', 'phantom2', 'phantom3', 'phantom4'];

/** Edges shorter than this (mm) count as zero-length. */
export const ZERO_LENGTH_MM = 1e-6;

const CASE_KEYS = new Set(Object.keys(schema.properties));
const CENTERLINE_KEYS = new Set(Object.keys(schema.$defs.centerlines.properties));
/** Shown at most; the rest are summarised in one line. */
const MAX_SCHEMA_MESSAGES = 20;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// ================================================================ privacy

/**
 * Remove top-level fields the format does not define (where exporters put patient and study
 * data) from case.json and centerlines.json. Values are never logged, only field names.
 */
export function stripUnknownFields(caseRaw: unknown, centerlinesRaw: unknown): string[] {
  const removed: string[] = [];
  if (isObject(caseRaw)) {
    for (const k of Object.keys(caseRaw)) {
      if (!CASE_KEYS.has(k)) {
        delete caseRaw[k];
        removed.push(`case.json/${k}`);
      }
    }
  }
  if (isObject(centerlinesRaw)) {
    for (const k of Object.keys(centerlinesRaw)) {
      if (!CENTERLINE_KEYS.has(k)) {
        delete centerlinesRaw[k];
        removed.push(`centerlines.json/${k}`);
      }
    }
  }
  return removed;
}

export function privacyResult(removed: string[]): ValidationResult[] {
  if (removed.length === 0) return [];
  return [
    {
      check: 'privacy',
      severity: 'notice',
      message: `Removed ${removed.length} metadata field${removed.length === 1 ? '' : 's'} that the case format does not use: ${removed.join(', ')}.`,
      ids: removed,
    },
  ];
}

// ================================================================ schema

interface AjvError {
  instancePath: string;
  keyword: string;
  params: Record<string, unknown>;
  message?: string;
}
type AjvValidate = ((data: unknown) => boolean) & { errors?: AjvError[] | null };

let validators: Promise<{ case: AjvValidate; centerlines: AjvValidate }> | null = null;

/** ajv is loaded on first use so it stays out of the first screen's bundle. */
function getValidators() {
  validators ??= import('ajv/dist/2020.js').then(({ Ajv2020 }) => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    return {
      case: ajv.compile(schema) as AjvValidate,
      centerlines: ajv.compile({ $ref: 'urn:threadsim:case:1#/$defs/centerlines' }) as AjvValidate,
    };
  });
  return validators;
}

function plain(e: AjvError): { path: string; text: string } {
  const p = e.params;
  switch (e.keyword) {
    case 'required':
      return { path: `${e.instancePath}/${String(p['missingProperty'])}`, text: 'is missing' };
    case 'additionalProperties':
      return { path: `${e.instancePath}/${String(p['additionalProperty'])}`, text: 'is not part of the case format' };
    case 'const':
      return { path: e.instancePath, text: `must be ${JSON.stringify(p['allowedValue'])}` };
    case 'enum':
      return { path: e.instancePath, text: `must be one of ${(p['allowedValues'] as unknown[]).map((v) => JSON.stringify(v)).join(', ')}` };
    case 'type':
      return { path: e.instancePath, text: `must be ${String(p['type'])}` };
    default:
      return { path: e.instancePath, text: e.message ?? `fails ${e.keyword}` };
  }
}

function schemaErrors(file: string, errors: AjvError[]): ValidationResult[] {
  return errors
    .filter((e) => e.keyword !== 'if')
    .map((e) => {
      const { path, text } = plain(e);
      return { check: 'schema', severity: 'error', message: `${file} ${path || '(top level)'} ${text}.`, path: path || '/' };
    });
}

/** Schema check on case.json and centerlines.json, then the references between them. */
export async function checkSchema(caseRaw: unknown, centerlinesRaw: unknown): Promise<ValidationResult[]> {
  const v = await getValidators();
  const results: ValidationResult[] = [];
  if (!v.case(caseRaw)) results.push(...schemaErrors('case.json', v.case.errors ?? []));
  if (!v.centerlines(centerlinesRaw)) results.push(...schemaErrors('centerlines.json', v.centerlines.errors ?? []));
  if (results.length === 0) results.push(...checkReferences(caseRaw as CaseJson, centerlinesRaw as CenterlinesJson));
  if (results.length > MAX_SCHEMA_MESSAGES) {
    const more = results.length - MAX_SCHEMA_MESSAGES;
    results.length = MAX_SCHEMA_MESSAGES;
    results.push({ check: 'schema', severity: 'error', message: `…and ${more} more schema problem${more === 1 ? '' : 's'}.` });
  }
  return results;
}

/** Duplicate ids and references to things that do not exist. Field-level schema errors. */
export function checkReferences(c: CaseJson, cl: CenterlinesJson): ValidationResult[] {
  const results: ValidationResult[] = [];
  const err = (file: string, path: string, text: string, id: string): void => {
    results.push({ check: 'schema', severity: 'error', message: `${file} ${path} ${text}.`, path, ids: [id] });
  };
  const unique = (file: string, list: { id: string }[], key: string): Set<string> => {
    const seen = new Set<string>();
    list.forEach((x, i) => {
      if (seen.has(x.id)) err(file, `/${key}/${i}/id`, `repeats the id "${x.id}"`, x.id);
      seen.add(x.id);
    });
    return seen;
  };
  const vessels = unique('case.json', c.vessels, 'vessels');
  unique('case.json', c.entries, 'entries');
  unique('case.json', c.targets, 'targets');
  unique('case.json', c.riskZones, 'riskZones');
  const nodes = unique('centerlines.json', cl.nodes, 'nodes');
  const edges = unique('centerlines.json', cl.edges, 'edges');

  for (const key of ['entries', 'targets'] as const) {
    c[key].forEach((x, i) => {
      if (!nodes.has(x.node)) err('case.json', `/${key}/${i}/node`, `names node "${x.node}", which centerlines.json does not have`, x.id);
    });
  }
  c.riskZones.forEach((z, i) => {
    if (!edges.has(z.edge)) err('case.json', `/riskZones/${i}/edge`, `names edge "${z.edge}", which centerlines.json does not have`, z.id);
    if (z.to_mm < z.from_mm) err('case.json', `/riskZones/${i}/to_mm`, 'is before from_mm', z.id);
  });
  cl.edges.forEach((e, i) => {
    for (const end of ['from', 'to'] as const) {
      if (!nodes.has(e[end])) err('centerlines.json', `/edges/${i}/${end}`, `names node "${e[end]}", which does not exist`, e.id);
    }
    if (!vessels.has(e.vessel)) err('centerlines.json', `/edges/${i}/vessel`, `names vessel "${e.vessel}", which case.json does not list`, e.id);
  });
  return results;
}

// ================================================================ radii

/** Drop risk zones that sit on removed edges; returns their ids. */
function dropZonesOn(c: CaseJson, edgeId: string): string[] {
  const dropped = c.riskZones.filter((z) => z.edge === edgeId).map((z) => z.id);
  c.riskZones = c.riskZones.filter((z) => z.edge !== edgeId);
  return dropped;
}

/** One radius per point, all > 0. A failing edge is removed (with its risk zones), not the case. */
export function checkRadii(c: CaseJson, cl: CenterlinesJson): ValidationResult[] {
  const results: ValidationResult[] = [];
  const kept: CenterlineEdge[] = [];
  cl.edges.forEach((e, i) => {
    let problem: string | null = null;
    let path = `/edges/${i}/radii_mm`;
    if (e.radii_mm.length !== e.points.length) {
      problem = `has ${e.radii_mm.length} radii for ${e.points.length} points`;
    } else {
      const bad = e.radii_mm.findIndex((r) => !(r > 0) || !Number.isFinite(r));
      if (bad >= 0) {
        problem = `has a radius of ${e.radii_mm[bad]} mm at point ${bad}`;
        path = `${path}/${bad}`;
      }
    }
    if (problem === null) {
      kept.push(e);
      return;
    }
    const zones = dropZonesOn(c, e.id);
    results.push({
      check: 'radii',
      severity: 'warning',
      message: `Edge ${e.id} ${problem}, so it was removed${zones.length ? ` with risk zone${zones.length === 1 ? '' : 's'} ${zones.join(', ')}` : ''}.`,
      path,
      ids: [e.id, ...zones],
    });
  });
  cl.edges = kept;
  return results;
}

// ================================================================ graph

export function polylineLength(points: readonly Vec3[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    total += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return total;
}

/**
 * Removes zero-length edges, then checks every entry reaches every target over the remaining
 * edges (both directions: a wire can go either way along a vessel). Returns the targets no entry
 * reaches.
 */
export function checkGraph(c: CaseJson, cl: CenterlinesJson): { results: ValidationResult[]; unreachable: Set<string> } {
  const results: ValidationResult[] = [];
  const kept: CenterlineEdge[] = [];
  for (const e of cl.edges) {
    if (polylineLength(e.points) > ZERO_LENGTH_MM) {
      kept.push(e);
      continue;
    }
    const zones = dropZonesOn(c, e.id);
    const i = cl.edges.indexOf(e);
    results.push({
      check: 'graph',
      severity: 'warning',
      message: `Edge ${e.id} has zero length, so it was removed${zones.length ? ` with risk zone${zones.length === 1 ? '' : 's'} ${zones.join(', ')}` : ''}.`,
      path: `/edges/${i}/points`,
      ids: [e.id, ...zones],
    });
  }
  cl.edges = kept;

  const adj = new Map<string, string[]>();
  for (const e of kept) {
    adj.set(e.from, [...(adj.get(e.from) ?? []), e.to]);
    adj.set(e.to, [...(adj.get(e.to) ?? []), e.from]);
  }
  const reach = (start: string): Set<string> => {
    const seen = new Set([start]);
    const stack = [start];
    while (stack.length) {
      for (const n of adj.get(stack.pop()!) ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    return seen;
  };
  const fromEntry = c.entries.map((entry) => ({ entry, seen: reach(entry.node) }));

  const unreachable = new Set<string>();
  c.targets.forEach((t, i) => {
    const missing = fromEntry.filter((x) => !x.seen.has(t.node)).map((x) => x.entry);
    if (missing.length === 0) return;
    const none = missing.length === fromEntry.length;
    if (none) unreachable.add(t.id);
    results.push({
      check: 'graph',
      severity: 'warning',
      message: none
        ? `${t.name} cannot be reached from any entry site; it is marked unreachable.`
        : `${t.name} cannot be reached from ${missing.map((e) => e.name).join(', ')}.`,
      path: `/targets/${i}/node`,
      ids: [t.id, ...missing.map((e) => e.id)],
    });
  });
  return { results, unreachable };
}

// ================================================================ units

const fmt = (n: number) => (Math.abs(n) >= 0.01 || n === 0 ? `${Number(n.toPrecision(4))}` : n.toExponential(2));

/** Largest aorta radius must be within AORTA_RADIUS_RANGE_MM, or a ×1000 / ÷1000 rescale is offered. */
export function checkUnits(cl: CenterlinesJson): ValidationResult[] {
  const aorta = cl.edges.filter((e) => e.vessel === AORTA_VESSEL_ID);
  if (aorta.length === 0) {
    return [{ check: 'units', severity: 'notice', message: `No "${AORTA_VESSEL_ID}" vessel, so units were not checked.` }];
  }
  const largest = Math.max(...aorta.flatMap((e) => e.radii_mm));
  const [lo, hi] = AORTA_RADIUS_RANGE_MM;
  const within = (r: number) => r >= lo && r <= hi;
  if (within(largest)) return [];
  const range = `${lo}–${hi} mm`;
  const ids = aorta.map((e) => e.id);
  if (within(largest * 1000)) {
    return [{ check: 'units', severity: 'warning', message: `The aorta's largest radius is ${fmt(largest)} mm, outside ${range}. The case looks like it is in metres: rescale ×1000?`, ids, fix: { kind: 'rescale', factor: 1000 } }];
  }
  if (within(largest / 1000)) {
    return [{ check: 'units', severity: 'warning', message: `The aorta's largest radius is ${fmt(largest)} mm, outside ${range}. The case looks like it is in micrometres: rescale ÷1000?`, ids, fix: { kind: 'rescale', factor: 0.001 } }];
  }
  return [{ check: 'units', severity: 'warning', message: `The aorta's largest radius is ${fmt(largest)} mm, outside ${range}, and no ×1000 or ÷1000 rescale fixes it. Check the export's units.`, ids }];
}

// ================================================================ axes

/**
 * Head up: targets (arch branches) sit superior to the entry sites (femoral, radial). If on
 * average they sit below, the S axis is probably flipped, and a flip is offered.
 */
export function checkAxes(c: CaseJson, cl: CenterlinesJson): ValidationResult[] {
  const pos = new Map(cl.nodes.map((n) => [n.id, n.pos]));
  const meanS = (list: { node: string }[]) => {
    const s = list.map((x) => pos.get(x.node)?.[2]).filter((v): v is number => v !== undefined);
    return s.length ? s.reduce((a, b) => a + b, 0) / s.length : NaN;
  };
  const entryS = meanS(c.entries);
  const targetS = meanS(c.targets);
  if (!(targetS < entryS)) return [];
  return [
    {
      check: 'axes',
      severity: 'warning',
      message: 'The targets sit below the entry sites, so the preview would show the patient upside down. Flip the head–foot axis?',
      path: '/axes',
      fix: { kind: 'flip_axes', axis: 'S' },
    },
  ];
}

// ================================================================ mesh budget

export function checkMeshBudget(triangles: number): ValidationResult[] {
  if (triangles <= MESH_TRIANGLE_BUDGET) return [];
  return [
    {
      check: 'mesh_budget',
      severity: 'warning',
      message: `The mesh has ${triangles.toLocaleString('en-US')} triangles, over the ${MESH_TRIANGLE_BUDGET.toLocaleString('en-US')} budget. Simplify it?`,
      fix: { kind: 'decimate', targetTriangles: MESH_TRIANGLE_BUDGET },
    },
  ];
}

// ================================================================ physics

/**
 * Physics only for the four CathSim phantoms, served by the physics process. A package that
 * claims physics any other way (an import, a bundled folder, another source kind) is planning only.
 */
export function checkPhysics(c: CaseJson, origin: CaseOrigin): { results: ValidationResult[]; allowed: boolean } {
  if (!c.physics.available) return { results: [], allowed: false };
  const phantom = c.physics.phantom;
  let reason: string | null = null;
  if (phantom === undefined || !KNOWN_PHANTOMS.includes(phantom)) reason = 'it does not name a known CathSim phantom';
  else if (c.source.kind !== 'cathsim') reason = 'it is not a CathSim phantom';
  else if (origin !== 'physics') reason = 'phantom cases come only from the physics process';
  if (reason === null) return { results: [], allowed: true };
  return {
    results: [{ check: 'physics', severity: 'warning', message: `Planning only: the case asks for physics, but ${reason}.`, path: '/physics/available' }],
    allowed: false,
  };
}
