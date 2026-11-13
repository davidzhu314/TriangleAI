/**
 * loadCase: read a package, validate it (§3.5) and convert it, once, to the metres Y-up LoadedCase.
 *
 * Order: read files → privacy strip → schema (errors stop here) → apply accepted fixes → radii →
 * graph → units → axes → mesh budget → physics → convert. Results are reported in the §3.5 order.
 *
 * Fixes: a warning may carry a `fix`. To accept it, call loadCase again with the same source and
 * `fixes: [...previous, fix]`; validation re-runs on the fixed package. Nothing is uploaded.
 */
import {
  CASE_FILES,
  RAS_MM_TO_YUP_M,
  rasMmToYupM,
  type CaseJson,
  type CaseLoadResult,
  type CenterlinesJson,
  type LoadedCase,
  type ValidationFix,
  type ValidationResult,
  type Vec3,
} from '../contracts';
import { decimateInWorker, type Decimator } from './decimate-client';
import { countTriangles, encodeGlb, GlbError, parseGlb, stripExtras } from './glb';
import { PackageError, readPackage, type CaseSource } from './sources';
import {
  CHECK_ORDER,
  checkAxes,
  checkGraph,
  checkMeshBudget,
  checkPhysics,
  checkRadii,
  checkSchema,
  checkUnits,
  polylineLength,
  privacyResult,
  stripUnknownFields,
} from './validate';

export interface LoadOptions {
  /** Fixes the player accepted, applied in order before validation. */
  fixes?: readonly ValidationFix[];
  /** For tests. Default: global fetch. */
  fetch?: typeof fetch;
  /** For tests. Default: decimate in a Web Worker. */
  decimate?: Decimator;
}

const AXIS_INDEX = { R: 0, A: 1, S: 2 } as const;

function rejected(results: ValidationResult[]): CaseLoadResult {
  return { ok: false, results: sortResults(results) };
}

function sortResults(results: ValidationResult[]): ValidationResult[] {
  return results
    .map((r, i) => ({ r, i }))
    .sort((a, b) => CHECK_ORDER.indexOf(a.r.check) - CHECK_ORDER.indexOf(b.r.check) || a.i - b.i)
    .map((x) => x.r);
}

const fileError = (message: string, file?: string): ValidationResult => ({
  check: 'schema',
  severity: 'error',
  message,
  ...(file ? { ids: [file] } : {}),
});

function parseJson(bytes: Uint8Array | null, name: string): { value: unknown } | ValidationResult {
  if (!bytes) return fileError(`The package has no ${name}.`, name);
  try {
    return { value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return fileError(`${name} is not valid JSON.`, name);
  }
}

/** Multiply every stored length (positions, radii, risk-zone spans) by `factor`. */
function rescale(c: CaseJson, cl: CenterlinesJson, factor: number): void {
  const scale = (p: Vec3): Vec3 => [p[0] * factor, p[1] * factor, p[2] * factor];
  for (const n of cl.nodes) n.pos = scale(n.pos);
  for (const e of cl.edges) {
    e.points = e.points.map(scale);
    e.radii_mm = e.radii_mm.map((r) => r * factor);
  }
  for (const z of c.riskZones) {
    z.from_mm *= factor;
    z.to_mm *= factor;
  }
}

function flip(cl: CenterlinesJson, axis: 0 | 1 | 2): void {
  const f = (p: Vec3): Vec3 => {
    const q: Vec3 = [p[0], p[1], p[2]];
    q[axis] = -q[axis];
    return q;
  };
  for (const n of cl.nodes) n.pos = f(n.pos);
  for (const e of cl.edges) e.points = e.points.map(f);
}

/** RAS_MM_TO_YUP_M after a per-axis scale in file space: column j of the 3×3 part times d[j]. */
function toWorldMatrix(d: Vec3): number[] {
  const m = [...RAS_MM_TO_YUP_M];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) m[j * 4 + i]! *= d[j]!;
  return m.map((v) => v + 0); // no -0 in the output
}

export async function loadCase(source: CaseSource, options: LoadOptions = {}): Promise<CaseLoadResult> {
  // ---------------------------------------------------------------- read
  let pkg;
  try {
    pkg = await readPackage(source, options.fetch ?? fetch);
  } catch (err) {
    if (err instanceof PackageError) return rejected([fileError(err.message)]);
    throw err;
  }
  const results: ValidationResult[] = [];
  const caseParsed = parseJson(pkg.files[CASE_FILES.case], CASE_FILES.case);
  const clParsed = parseJson(pkg.files[CASE_FILES.centerlines], CASE_FILES.centerlines);
  let glbBytes = pkg.files[CASE_FILES.mesh];
  let glb: ReturnType<typeof parseGlb> | null = null;
  if (!glbBytes) results.push(fileError(`The package has no ${CASE_FILES.mesh}.`, CASE_FILES.mesh));
  else {
    try {
      glb = parseGlb(glbBytes);
    } catch (err) {
      if (!(err instanceof GlbError)) throw err;
      results.push(fileError(`${CASE_FILES.mesh} is not a valid GLB file: ${err.message}.`, CASE_FILES.mesh));
    }
  }
  if (!('value' in caseParsed)) results.push(caseParsed);
  if (!('value' in clParsed)) results.push(clParsed);
  if (!('value' in caseParsed) || !('value' in clParsed) || !glb || !glbBytes) return rejected(results);

  // ---------------------------------------------------------------- privacy, then schema
  const removed = stripUnknownFields(caseParsed.value, clParsed.value);
  const glbRemoved = stripExtras(glb.json);
  if (glbRemoved.length > 0) glbBytes = encodeGlb(glb);
  results.push(...privacyResult([...removed, ...glbRemoved.map((p) => `${CASE_FILES.mesh}${p}`)]));

  results.push(...(await checkSchema(caseParsed.value, clParsed.value)));
  let triangles = 0;
  try {
    triangles = countTriangles(glb.json);
  } catch (err) {
    if (!(err instanceof GlbError)) throw err;
    results.push(fileError(`${CASE_FILES.mesh} is not a valid GLB file: ${err.message}.`, CASE_FILES.mesh));
  }
  if (results.some((r) => r.severity === 'error')) return rejected(results);

  const c = caseParsed.value as CaseJson;
  const cl = clParsed.value as CenterlinesJson;

  // ---------------------------------------------------------------- accepted fixes
  const fileScale: Vec3 = [1, 1, 1];
  for (const fix of options.fixes ?? []) {
    if (fix.kind === 'rescale') {
      rescale(c, cl, fix.factor);
      for (let i = 0; i < 3; i++) fileScale[i]! *= fix.factor;
    } else if (fix.kind === 'flip_axes') {
      const axis = AXIS_INDEX[fix.axis];
      flip(cl, axis);
      fileScale[axis] = -fileScale[axis]!;
    } else {
      try {
        glbBytes = await (options.decimate ?? decimateInWorker)(glbBytes, fix.targetTriangles);
        triangles = countTriangles(parseGlb(glbBytes).json);
      } catch (err) {
        results.push({ check: 'mesh_budget', severity: 'warning', message: `Simplifying the mesh failed: ${err instanceof Error ? err.message : String(err)}.` });
      }
    }
  }

  // ---------------------------------------------------------------- checks
  results.push(...checkRadii(c, cl));
  const graph = checkGraph(c, cl);
  results.push(...graph.results);
  results.push(...checkUnits(cl));
  results.push(...checkAxes(c, cl));
  results.push(...checkMeshBudget(triangles));
  const physics = checkPhysics(c, pkg.origin);
  results.push(...physics.results);

  // ---------------------------------------------------------------- convert once: mm RAS → m Y-up
  const loaded: LoadedCase = {
    id: c.id,
    title: c.title,
    origin: pkg.origin,
    source: { ...c.source },
    physics: physics.allowed ? { available: true, phantom: c.physics.phantom! } : { available: false },
    planningOnly: !physics.allowed,
    ...(c.scenario !== undefined ? { scenario: c.scenario } : {}),
    ...(c.difficulty !== undefined ? { difficulty: c.difficulty } : {}),
    ...(c.fluoro_budget_s !== undefined ? { fluoroBudgetS: c.fluoro_budget_s } : {}),
    ...(c.anatomy !== undefined ? { anatomy: { ...c.anatomy } } : {}),
    ...(c.subject !== undefined ? { subject: { ...c.subject } } : {}),
    vessels: c.vessels.map((v) => ({ ...v })),
    entries: c.entries.map((e) => ({ ...e })),
    targets: c.targets.map((t) => ({ ...t, reachable: !graph.unreachable.has(t.id) })),
    riskZones: c.riskZones.map((z) => ({ id: z.id, kind: z.kind, tier: z.tier, edge: z.edge, fromM: z.from_mm / 1000, toM: z.to_mm / 1000 })),
    nodes: cl.nodes.map((n) => ({ id: n.id, pos: rasMmToYupM(n.pos), kind: n.kind })),
    edges: cl.edges.map((e) => {
      const points = e.points.map(rasMmToYupM);
      return { id: e.id, from: e.from, to: e.to, vessel: e.vessel, points, radiiM: e.radii_mm.map((r) => r / 1000), lengthM: polylineLength(points) };
    }),
    mesh: { glb: glbBytes.slice().buffer, toWorld: toWorldMatrix(fileScale), triangles },
    validation: sortResults(results),
  };
  return { ok: true, case: loaded };
}
