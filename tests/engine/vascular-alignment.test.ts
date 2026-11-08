/**
 * Compatibility between the route simulator and an imported anatomical model (feature/vascular-integration).
 *
 * 1. Route and mesh share one frame: every bundled case's route geometry (LoadedCase edges, which the route trace
 *    draws) is its centerlines.json under rasMmToYupM, and its vessels.glb is placed by the same map.
 * 2. The misalignment check works: each case's own mesh sits on its centerlines, and a 20 mm shift is caught.
 * 3. The model's alignment to each case is a separately configured transform (tests/fixtures/engine/
 *    vascular-alignment/<case>.json): proper, sane and no worse than recorded. Real CT cases must line up well.
 * 4. Isolation: nothing in planning, comparison, driving or scoring can read the model or its alignment.
 *
 * Regenerate the alignments and metrics/gibran/vascular-alignment.md with UPDATE_FIXTURES=1 (slow: fits run).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RAS_MM_TO_YUP_M, rasMmToYupM } from '../../client/src/contracts';
import { CASES_DIR, ENGINE_FIXTURES, loadBundled, REPO } from './engine.testutil';
import {
  alignmentMatrix,
  apply,
  caseCenterlines,
  centroid,
  coverage,
  det3,
  eulerDeg,
  fitSimilarity,
  landmarkFit,
  matchedSurface,
  meshVertices,
  MODEL_PATH,
  PointGrid,
  rotation,
  VESSEL_MAP,
  type V3,
  type VisualAlignment,
} from './vascular-alignment.testutil';

const UPDATE = process.env['UPDATE_FIXTURES'] === '1';
const ALIGN_DIR = join(ENGINE_FIXTURES, 'vascular-alignment');
const CASE_IDS = readdirSync(CASES_DIR).filter((d) => existsSync(join(CASES_DIR, d, 'centerlines.json'))).sort();
/** Cases from CT (real anatomy): the reference body must line up with these. Generated arches are reported only. */
const isCt = (id: string): boolean => JSON.parse(readFileSync(join(CASES_DIR, id, 'case.json'), 'utf8')).source?.kind === 'ct';

/** A case's own mesh must hug its centerlines (decimated meshes included). */
const SELF_INSIDE = 0.99;
const SELF_MEDIAN_MM = 0.5;
/** The real CT cases must line up with the reference body at least this well (recorded: 74–75%). */
const CT_INSIDE = 0.7;
/** A regeneration may not lose more than this share of coverage against the recorded alignment. */
const DRIFT = 0.02;

interface AlignmentFixture extends VisualAlignment {
  recorded: { inside: number; medianExcessMm: number; rmsMm: number };
}

// ---------------------------------------------------------------- 1. one frame for routes and meshes

describe('route geometry and case meshes share one frame', () => {
  it.each(CASE_IDS)('%s: the route trace is the centerlines under rasMmToYupM, and vessels.glb uses the same map', async (id) => {
    const c = await loadBundled(id);
    const raw = JSON.parse(readFileSync(join(CASES_DIR, id, 'centerlines.json'), 'utf8')) as { edges: { id: string; points: V3[] }[] };
    for (const e of raw.edges) {
      const loaded = c.edges.find((x) => x.id === e.id)!;
      expect(loaded.points).toHaveLength(e.points.length);
      e.points.forEach((p, i) => {
        const want = rasMmToYupM(p);
        for (let k = 0; k < 3; k++) expect(loaded.points[i]![k]).toBeCloseTo(want[k]!, 9);
      });
    }
    expect(c.mesh.toWorld).toEqual([...RAS_MM_TO_YUP_M]);
  });
});

// ---------------------------------------------------------------- 2. the check itself

describe('the misalignment check', () => {
  it.each(CASE_IDS)('%s: its own mesh sits on its centerlines, and a 20 mm shift is caught', (id) => {
    const cl = [...caseCenterlines(id).values()].flat();
    const own = [...meshVertices(join(CASES_DIR, id, 'vessels.glb')).values()].flat();
    const fit = coverage(cl, new PointGrid(own, 4));
    expect(fit.inside).toBeGreaterThanOrEqual(SELF_INSIDE);
    expect(Math.abs(fit.medianExcessMm)).toBeLessThanOrEqual(SELF_MEDIAN_MM);
    const shifted = coverage(cl, new PointGrid(own.map((p) => [p[0] + 20, p[1], p[2]] as V3), 4));
    expect(shifted.inside).toBeLessThan(SELF_INSIDE - 0.09);
  });

  it.each(CASE_IDS)('%s: right is right (RAS +x): the right carotid lies right of the left', (id) => {
    const cl = caseCenterlines(id);
    const r = cl.get('rcca');
    const l = cl.get('lcca');
    if (!r || !l) return; // fixture-y has no carotids
    expect(centroid(r.map((x) => x.p))[0]).toBeGreaterThan(centroid(l.map((x) => x.p))[0]);
  });

  it('recovers a known similarity exactly (the fit\'s own maths)', () => {
    const truth = { scale: 0.9, rotationDeg: [5, -10, 20] as V3, translationMm: [12, -40, 300] as V3 };
    const m = alignmentMatrix(truth);
    const src: V3[] = [[0, 0, 0], [100, 0, 0], [0, 80, 0], [0, 0, 60], [30, 40, 50]];
    const fit = fitSimilarity(src, src.map((p) => apply(m, p)));
    expect(fit.scale).toBeCloseTo(0.9, 9);
    eulerDeg(fit.R).forEach((v, k) => expect(v).toBeCloseTo(truth.rotationDeg[k]!, 6));
    fit.t.forEach((v, k) => expect(v).toBeCloseTo(truth.translationMm[k]!, 6));
    expect(fit.rmsMm).toBeLessThan(1e-6);
    expect(eulerDeg(rotation([5, -10, 20]))).toEqual(expect.arrayContaining([expect.closeTo(5, 9)]));
  });
});

// ---------------------------------------------------------------- 3. the configured alignments

describe('the anatomical model\'s alignment to each case', () => {
  const model = meshVertices(MODEL_PATH);
  const alignable = CASE_IDS.filter((id) => Object.keys(VESSEL_MAP).filter((v) => caseCenterlines(id).has(v)).length >= 4);

  if (UPDATE) {
    it('regenerates the alignments and the report', () => {
      mkdirSync(ALIGN_DIR, { recursive: true });
      const rows: string[] = [];
      for (const id of alignable) {
        const a = landmarkFit(id, model);
        const matched = [...caseCenterlines(id).entries()].filter(([v]) => VESSEL_MAP[v]).flatMap(([, p]) => p);
        const cov = coverage(matched, matchedSurface(model, a));
        const round = (v: number, d = 4): number => Number(v.toFixed(d));
        const fixture: AlignmentFixture = {
          schema: a.schema,
          caseId: id,
          model: a.model,
          scale: round(a.scale, 6),
          rotationDeg: a.rotationDeg.map((v) => round(v)) as V3,
          translationMm: a.translationMm.map((v) => round(v, 3)) as V3,
          method: a.method,
          landmarks: a.landmarks!,
          recorded: { inside: round(cov.inside), medianExcessMm: round(cov.medianExcessMm, 2), rmsMm: round(a.rmsMm, 2) },
        };
        writeFileSync(join(ALIGN_DIR, `${id}.json`), `${JSON.stringify(fixture, null, 2)}\n`);
        rows.push(`| \`${id}\` | ${isCt(id) ? 'CT' : 'generated'} | ${fixture.scale.toFixed(3)} | ${fixture.rotationDeg.map((v) => v.toFixed(1)).join(', ')} | ${fixture.recorded.rmsMm.toFixed(1)} | ${(fixture.recorded.inside * 100).toFixed(0)}% | ${fixture.recorded.medianExcessMm.toFixed(1)} |`);
      }
      writeFileSync(join(REPO, 'metrics/gibran/vascular-alignment.md'), report(rows, CASE_IDS.filter((id) => !alignable.includes(id))));
    }, 900_000);
    return;
  }

  it.each(alignable)('%s: a recorded alignment exists, proper and sane, and the model lines up no worse than recorded', (id) => {
    const path = join(ALIGN_DIR, `${id}.json`);
    expect(existsSync(path), `${relative(REPO, path)} (regenerate with UPDATE_FIXTURES=1)`).toBe(true);
    const a = JSON.parse(readFileSync(path, 'utf8')) as AlignmentFixture;
    expect(a.schema).toBe('threadsim.visual-alignment/1');
    expect(a.caseId).toBe(id);
    const m = alignmentMatrix(a);
    expect(m.every(Number.isFinite)).toBe(true);
    expect(det3(m)).toBeGreaterThan(0); // never mirrored: left stays left
    expect(a.scale).toBeGreaterThan(0.5);
    expect(a.scale).toBeLessThan(2);
    for (const d of a.rotationDeg) expect(Math.abs(d)).toBeLessThanOrEqual(45); // small turns only: no flipped body
    expect(Object.keys(a.landmarks ?? {}).length).toBeGreaterThanOrEqual(3);

    // Laterality survives the alignment.
    const r = centroid(model.get('r_carotid_arteries')!.map((p) => apply(m, p)));
    const l = centroid(model.get('l_carotid_arteries')!.map((p) => apply(m, p)));
    expect(r[0]).toBeGreaterThan(l[0]);

    const matched = [...caseCenterlines(id).entries()].filter(([v]) => VESSEL_MAP[v]).flatMap(([, p]) => p);
    const cov = coverage(matched, matchedSurface(model, a));
    expect(cov.inside).toBeGreaterThanOrEqual(a.recorded.inside - DRIFT);
    if (isCt(id)) expect(cov.inside).toBeGreaterThanOrEqual(CT_INSIDE);
  }, 60_000);
});

// ---------------------------------------------------------------- 4. isolation from the engine

describe('planning, comparison, driving and scoring cannot see the visual model', () => {
  const ENGINE_DIRS = ['client/src/optimize', 'client/src/score', 'client/src/case', 'client/src/contracts'];
  const engineFiles = (): string[] => {
    const out: string[] = [];
    const walk = (dir: string): void => {
      for (const f of readdirSync(join(REPO, dir), { withFileTypes: true })) {
        const p = `${dir}/${f.name}`;
        if (f.isDirectory()) walk(p);
        else if (/\.ts$/.test(f.name) && !/\.test\.ts$|\.testutil\.ts$/.test(f.name)) out.push(p);
      }
    };
    for (const d of ENGINE_DIRS) walk(d);
    for (const f of readdirSync(join(REPO, 'client/src/wire'))) if (/^rail.*\.ts$/.test(f) && !/\.test\.ts$/.test(f)) out.push(`client/src/wire/${f}`);
    return out;
  };

  it('no engine, case or contract file imports the renderer, the anatomy layer or the model', () => {
    const files = engineFiles();
    expect(files.length).toBeGreaterThan(20);
    const offenders = files.filter((f) => /from\s+['"][^'"]*(\/render\/|anatomy|assets\/vascular|vascular-alignment)[^'"]*['"]/.test(readFileSync(join(REPO, f), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('the case format has no place for a visual alignment: it stays render configuration', () => {
    const schema = readFileSync(join(REPO, 'client/src/contracts/case.schema.json'), 'utf8');
    expect(schema).not.toMatch(/alignment/i);
  });
});

function report(rows: string[], skipped: string[]): string {
  return `# Visual alignment of the anatomical model to each case

Written by \`UPDATE_FIXTURES=1 pnpm exec vitest run tests/engine/vascular-alignment.test.ts\` (Gibran, feature/vascular-integration).

**Model:** \`assets/vascular/bodyparts3d-aortic.glb\`, BodyParts3D 4.3 (CC BY-SA 2.1 JP). It's one reference body, in RAS mm with BodyParts3D's origin.

**Alignment:** model RAS mm to case RAS mm, as a similarity (uniform scale, rotation, translation), stored per case in \`tests/fixtures/engine/vascular-alignment/<case>.json\`. The renderer would apply the case's \`RAS_MM_TO_YUP_M\` after it, as for \`vessels.glb\`. It is fitted in two steps:
1. **Origins:** the points where the branch vessels both share leave the aorta.
2. **Closest points:** a refinement over every matched vessel. It's kept only when it covers more.

**Coverage:** the share of the case's centerline points, on matched vessels, with a model surface vertex within 2 × radius + 2 mm. **Excess** is the nearest-vertex distance minus the radius; the median is shown, capped at 40 mm.

| Case | Source | Scale | Rotation X, Y, Z (°) | Fit RMS (mm) | Coverage | Median excess (mm) |
| --- | --- | --- | --- | --- | --- | --- |
${rows.join('\n')}

**Not aligned:** ${skipped.map((s) => `\`${s}\``).join(', ') || 'none'}. Fewer than 4 vessels map to the model (fixture-y is a synthetic Y).

**Reading it:**
- The real CT cases line up with the reference body at about three quarters coverage. The test holds them to at least ${CT_INSIDE * 100}%.
- The generated arches are parametric, not modelled on a body, so they line up less well. Their figures are recorded only, and a regeneration may not lose more than ${DRIFT * 100} points of coverage.
- Misalignment never reaches routes or scores: the alignment is render configuration only.
`;
}
