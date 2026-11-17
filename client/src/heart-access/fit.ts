/**
 * Fit the template heart into a CT case: one rotation, one uniform scale and one translation (a similarity), so the
 * template keeps its shape and only its pose and size change.
 *
 * Method: iterative closest point with both directions trimmed, plus an anchor.
 *  - CT → template: each point on the CT heart surface pulls the nearest template point. The CT surface is the outer
 *    envelope (TotalSegmentator labels the whole heart as one piece), so it finds the template's outer walls, not its
 *    inner (cavity) faces. The farthest 15% are dropped.
 *  - Template → CT: each template point pulls toward the nearest CT point; only the closest 50% count, because the
 *    template also has inner faces, pulmonary veins and caval stubs that the CT surface does not.
 *  - Anchor: the template's aortic valve centre pulls toward the CT aorta's root, and a point 25 mm up the template's
 *    aorta toward the same distance up the CT aorta, so the valve and the ascending aorta line up.
 * Several starting rotations are tried and the fit with the smallest trimmed CT → template distance is kept.
 *
 * Every number is geometry. The fit puts a shape-model average where a patient's heart is; it does not turn the
 * template into that patient's heart (chamber sizes, wall thickness and valve shapes stay the template's).
 */
import { add, angleDeg, apply, decompose, dist, fitSimilarity, IDENTITY, mul, PointGrid, rotationAbout, scale, similarity, sub, toYupColumnMajor, unit, type M4, type V3 } from './geometry';
import { AORTA_FAR_MM, AORTA_NEAR_MM, centroid, every, surfaceSamples, type CaseHeart, type MeshPart, type TemplateHeart } from './heart';

export const HEART_FIT_SCHEMA = 'cathy.heart-fit/1';

/**
 * When a fit counts as good enough for the access module to use that case as its patient. Set from the first three
 * fits (DECISIONS.md 2026-11-17); a fit outside any of them is "approximate", with the reasons listed.
 */
export const FIT_LIMITS = {
  /** Median CT-surface-to-template distance, mm. */
  medianMm: 5,
  /** Fitted LV apex to the CT heart surface, mm. The apex decides the transapical entry, so it has its own limit. */
  apexMm: 10,
  /** Fitted aortic valve centre to the CT aorta's root, mm. */
  aorticRootMm: 15,
  /** Ascending aorta direction, degrees. */
  aortaAxisDeg: 35,
} as const;

export interface FitOptions {
  /** Template samples used by the fit (the rest are used to score it). Default 6000. */
  templateSamples?: number;
  iterations?: number;
  /** Share of CT → template pairs kept. */
  keepCtToTemplate?: number;
  /** Share of template → CT pairs kept. */
  keepTemplateToCt?: number;
  /** Weight of each anchor pair, as a share of all other pairs. */
  anchorWeight?: number;
  /** Starting rotations, degrees about x, y and z (RAS). */
  starts?: number;
  /** Template samples for the coarse pass that compares the starts. Default 1500. */
  coarseSamples?: number;
}

export interface HeartFitMetrics {
  /** Distance from each CT heart surface point to the fitted template's surface, mm. */
  ctToTemplateMeanMm: number;
  ctToTemplateMedianMm: number;
  ctToTemplateP95Mm: number;
  /** Share of CT surface points within 5 mm of the fitted template, %. */
  ctWithin5mmPct: number;
  /** Fitted aortic valve centre to the CT aorta's root, mm. */
  aorticRootMm: number;
  /** Angle between the fitted template's ascending aorta and the CT aorta, both from 10 to 35 mm up, degrees. */
  aortaAxisDeg: number;
  /** Fitted LV apex to the nearest point of the CT heart surface, mm: whether the apex lands where the CT's is. */
  apexToCtMm: number;
  scale: number;
  /** Rotation from the template's own orientation, degrees. */
  rotationDeg: number;
}

export interface HeartFit {
  schema: typeof HEART_FIT_SCHEMA;
  heart: string;
  case: string;
  method: string;
  /** Template RAS mm → case RAS mm, row-major 4×4, acting on column vectors. */
  matrixRasMm: number[];
  /** The same move in the viewer's Y-up metres, column-major (three.js Matrix4.fromArray). */
  matrixYupM: number[];
  metrics: HeartFitMetrics;
  /** "good" when every FIT_LIMITS check passes; otherwise "approximate", with the checks it missed. */
  verdict: 'good' | 'approximate';
  reasons: string[];
  /** Which start won, and the trimmed cost of every start, for the record. */
  starts: { rotation: [number, number, number]; costMm: number }[];
  note: string;
}

/**
 * The template's aortic valve centre and its ascending aorta's axis: points AORTA_NEAR_MM and AORTA_FAR_MM up from
 * the valve, RAS mm. The axis is the line from the valve to the centre of the aorta's wall in a shell around that
 * distance (the template's aorta is a clean tube, so no trim is needed).
 */
export function templateAorta(t: TemplateHeart): { valve: V3; near: V3; far: V3 } {
  const av = t.parts.get('av_plane');
  const aorta = t.parts.get('aorta');
  if (!av || !aorta) throw new Error(`${t.id}: the heart needs av_plane and aorta parts`);
  const valve = centroid(av.pts);
  // The aorta's own vertices in a shell around the valve, on the side away from the ventricle.
  const lv = t.parts.get('lv_myocardium');
  const away = lv ? unit(sub(valve, centroid(lv.pts))) : ([0, 0, 1] as V3);
  const mid = (AORTA_NEAR_MM + AORTA_FAR_MM) / 2;
  const shell = aorta.pts.filter((p) => {
    const d = dist(p, valve);
    return d > mid - 8 && d < mid + 8 && (p[0] - valve[0]) * away[0] + (p[1] - valve[1]) * away[1] + (p[2] - valve[2]) * away[2] > 0;
  });
  const dir = unit(sub(centroid(shell), valve));
  return { valve, near: add(valve, scale(dir, AORTA_NEAR_MM)), far: add(valve, scale(dir, AORTA_FAR_MM)) };
}

/** The template's LV apex: the LV wall vertex farthest from the mitral valve's centre. */
export function templateApex(t: TemplateHeart): V3 {
  const lv = t.parts.get('lv_myocardium');
  const mv = t.parts.get('mv_plane');
  if (!lv || !mv) throw new Error(`${t.id}: the heart needs lv_myocardium and mv_plane parts`);
  const c = centroid(mv.pts);
  return lv.pts.reduce((best, p) => (dist(p, c) > dist(best, c) ? p : best));
}

const percentile = (xs: number[], q: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
};

function allPoints(parts: Iterable<MeshPart>): V3[] {
  const out: V3[] = [];
  for (const p of parts) out.push(...p.pts);
  return out;
}

/** Fit the template heart into the case. Deterministic: the same inputs give the same matrix. */
export function fitHeart(template: TemplateHeart, ct: CaseHeart, opts: FitOptions = {}): HeartFit {
  const nT = opts.templateSamples ?? 6000;
  const iterations = opts.iterations ?? 40;
  const keepCt = opts.keepCtToTemplate ?? 0.85;
  const keepT = opts.keepTemplateToCt ?? 0.5;
  const anchorShare = opts.anchorWeight ?? 0.05;

  const tAll = allPoints(template.parts.values());
  const tPts = every(tAll, Math.ceil(tAll.length / nT));
  const tCoarse = every(tAll, Math.ceil(tAll.length / (opts.coarseSamples ?? 1500)));
  const ctPts = surfaceSamples(ct.surface);
  const ctCoarse = every(ctPts, 3);
  const anchor = templateAorta(template);

  // Start: centroids together, sizes matched by RMS radius, then rotated.
  const cT = centroid(tPts);
  const cC = centroid(ctPts);
  const rms = (pts: V3[], c: V3) => Math.sqrt(pts.reduce((s, p) => s + dist(p, c) ** 2, 0) / pts.length);
  const s0 = rms(ctPts, cC) / rms(tPts, cT);
  const angles: [number, number, number][] = [[0, 0, 0]];
  const STEP = 20;
  if ((opts.starts ?? 7) > 1)
    for (const axis of [0, 1, 2])
      for (const sgn of [1, -1]) {
        const a: [number, number, number] = [0, 0, 0];
        a[axis] = sgn * STEP;
        angles.push(a);
      }

  const startMatrix = (angle: [number, number, number]): M4 => {
    const R = [rotationAbout([1, 0, 0], angle[0]), rotationAbout([0, 1, 0], angle[1]), rotationAbout([0, 0, 1], angle[2])].reduce((acc, r) => {
      const out = new Array<number>(9).fill(0);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) out[3 * i + j]! += r[3 * i + k]! * acc[3 * k + j]!;
      return out;
    }, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    // p ↦ s0 R (p − cT) + cC
    const Rc: V3 = [R[0]! * cT[0] + R[1]! * cT[1] + R[2]! * cT[2], R[3]! * cT[0] + R[4]! * cT[1] + R[5]! * cT[2], R[6]! * cT[0] + R[7]! * cT[1] + R[8]! * cT[2]];
    return similarity(R, s0, sub(cC, scale(Rc, s0)));
  };

  const runOne = (start: M4, tPts: V3[], ctPts: V3[], iterations: number): { m: M4; cost: number } => {
    const ctGrid = new PointGrid(ctPts, 6);
    let m = start;
    let cost = Infinity;
    for (let it = 0; it < iterations; it++) {
      const moved = tPts.map((p) => apply(m, p));
      const tGrid = new PointGrid(moved, 6);
      const A: V3[] = [];
      const B: V3[] = [];
      // CT → template.
      const ctPairs: { a: V3; b: V3; d: number }[] = [];
      for (const c of ctPts) {
        const hit = tGrid.nearest(c, 30);
        if (hit.at >= 0) ctPairs.push({ a: tPts[hit.at]!, b: c, d: hit.d });
      }
      ctPairs.sort((x, y) => x.d - y.d);
      const keptCt = ctPairs.slice(0, Math.floor(keepCt * ctPairs.length));
      // Template → CT.
      const tPairs: { a: V3; b: V3; d: number }[] = [];
      moved.forEach((p, n) => {
        const hit = ctGrid.nearest(p, 30);
        if (hit.at >= 0) tPairs.push({ a: tPts[n]!, b: ctPts[hit.at]!, d: hit.d });
      });
      tPairs.sort((x, y) => x.d - y.d);
      const keptT = tPairs.slice(0, Math.floor(keepT * tPairs.length));
      for (const p of [...keptCt, ...keptT]) {
        A.push(p.a);
        B.push(p.b);
      }
      const w = A.map(() => 1);
      const wa = anchorShare * A.length;
      A.push(anchor.valve, anchor.near, anchor.far);
      B.push(ct.aorticRoot, ct.aortaNear, ct.aortaFar);
      w.push(wa, wa, wa);
      const next = fitSimilarity(A, B, w, [0.7, 1.4]);
      cost = keptCt.reduce((s, p) => s + p.d, 0) / Math.max(1, keptCt.length);
      const change = Math.max(...next.map((v, i) => Math.abs(v - m[i]!) * (i % 4 === 3 ? 1 : 100)));
      m = next;
      if (change < 1e-3) break;
    }
    return { m, cost };
  };

  // Coarse pass for every start, then the best one refined on the full samples.
  const runs = angles.map((a) => ({ angle: a, ...runOne(startMatrix(a), tCoarse, ctCoarse, 25) }));
  const winner = runs.reduce((x, y) => (y.cost < x.cost - 1e-9 ? y : x));
  const best = runOne(winner.m, tPts, ctPts, iterations);

  const { metrics, verdict, reasons } = scoreFit(template, ct, best.m);
  return {
    schema: HEART_FIT_SCHEMA,
    heart: template.id,
    case: ct.caseId,
    method: 'similarity ICP, both directions trimmed (CT→template 85%, template→CT 50%), anchored at the aortic root and along the ascending aorta (10 to 35 mm), 7 starting rotations compared at low resolution and the best refined',
    matrixRasMm: best.m,
    matrixYupM: toYupColumnMajor(best.m),
    metrics,
    verdict,
    reasons,
    starts: runs.map((r) => ({ rotation: r.angle, costMm: r.cost })),
    note: 'A shape-model average placed and scaled into this CT case. Chamber sizes, wall thickness and valves are the template\'s, not this patient\'s. The CT heart surface also has vessels the template lacks (the pulmonary arteries past the trunk), so the mean and 95th-percentile distances overstate the misfit; the median and the share within 5 mm do not. Research and education only.',
  };
}

/**
 * Score a placement of the template in a case, on every template vertex: the metrics, the verdict and its reasons.
 * fitHeart uses it for its own result; tests use it to check a saved fit without fitting again.
 */
export function scoreFit(template: TemplateHeart, ct: CaseHeart, m: M4): Pick<HeartFit, 'metrics' | 'verdict' | 'reasons'> {
  const tAll = allPoints(template.parts.values());
  const ctPts = surfaceSamples(ct.surface);
  const fitted = new PointGrid(tAll.map((p) => apply(m, p)), 4);
  const dCt = ctPts.map((c) => fitted.nearest(c, 40).d).map((d) => (Number.isFinite(d) ? d : 40));
  const metrics: HeartFitMetrics = {
    ctToTemplateMeanMm: dCt.reduce((x, y) => x + y, 0) / dCt.length,
    ctToTemplateMedianMm: percentile(dCt, 0.5),
    ctToTemplateP95Mm: percentile(dCt, 0.95),
    ctWithin5mmPct: (dCt.filter((x) => x <= 5).length / dCt.length) * 100,
    ...scoreLandmarks(template, ct, m),
  };
  const reasons: string[] = [];
  if (metrics.ctToTemplateMedianMm > FIT_LIMITS.medianMm) reasons.push(`median surface distance ${metrics.ctToTemplateMedianMm.toFixed(1)} mm is over ${FIT_LIMITS.medianMm} mm`);
  if (metrics.apexToCtMm > FIT_LIMITS.apexMm) reasons.push(`the LV apex lands ${metrics.apexToCtMm.toFixed(1)} mm from the CT heart surface (limit ${FIT_LIMITS.apexMm} mm): this heart is shaped differently from the template there`);
  if (metrics.aorticRootMm > FIT_LIMITS.aorticRootMm) reasons.push(`aortic root ${metrics.aorticRootMm.toFixed(1)} mm off (limit ${FIT_LIMITS.aorticRootMm} mm)`);
  if (metrics.aortaAxisDeg > FIT_LIMITS.aortaAxisDeg) reasons.push(`aorta direction ${metrics.aortaAxisDeg.toFixed(0)}° off (limit ${FIT_LIMITS.aortaAxisDeg}°)`);
  return { metrics, verdict: reasons.length === 0 ? 'good' : 'approximate', reasons };
}

/**
 * The cheap part of a fit's score: where the aortic valve, the ascending aorta and the LV apex land, and the scale and
 * rotation. A handful of points, so tests can check a saved fit in milliseconds.
 */
export function scoreLandmarks(template: TemplateHeart, ct: CaseHeart, m: M4): Pick<HeartFitMetrics, 'aorticRootMm' | 'aortaAxisDeg' | 'apexToCtMm' | 'scale' | 'rotationDeg'> {
  const anchor = templateAorta(template);
  const valve = apply(m, anchor.valve);
  const near = apply(m, anchor.near);
  const far = apply(m, anchor.far);
  const apex = apply(m, templateApex(template));
  const { scale: s, rotationDeg } = decompose(m);
  return {
    aorticRootMm: dist(valve, ct.aorticRoot),
    aortaAxisDeg: angleDeg(sub(far, near), ct.aortaAxis),
    apexToCtMm: new PointGrid(surfaceSamples(ct.surface), 6).nearest(apex, 60).d,
    scale: s,
    rotationDeg,
  };
}

/** Move every part of the template by a fit. */
export function placeTemplate(template: TemplateHeart, fit: Pick<HeartFit, 'matrixRasMm'>): Map<string, MeshPart> {
  const out = new Map<string, MeshPart>();
  for (const [name, p] of template.parts) out.set(name, { name, pts: p.pts.map((q) => apply(fit.matrixRasMm, q)), tris: p.tris });
  return out;
}

export { IDENTITY, mul };
