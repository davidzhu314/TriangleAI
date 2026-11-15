/**
 * Does segmentation error change what the route engine says? The same optimizer (Vaibhav's, unchanged) runs on
 * the true case and on the recovered one, target by target, and the answers are compared: the frontier, the
 * route ranked best at the default weights, and whether each candidate route is still feasible.
 */
import type { LoadedCase, OptimizeResult, Route } from '../../contracts';
import { buildGraph, createRanker, DEFAULT_WEIGHTS, optimizeCase } from '../../optimize';

export interface TargetComparison {
  targetId: string;
  /** Same kind of answer (a frontier, or "no safe route") with the same frontier routes. */
  frontierSame: boolean;
  /** |shared frontier routes| / |all frontier routes on either side|; 1 when both have none. */
  frontierJaccard: number;
  /** Same best route at the default weights. */
  bestSame: boolean;
  bestTrue: string | null;
  bestRecovered: string | null;
  /** Candidate routes on the true case. */
  candidates: number;
  /** Candidates whose feasible / not feasible verdict differs, or that the recovered case no longer has. */
  verdictFlips: number;
  /** Largest differences over candidates present on both sides. */
  maxLengthErrPct: number;
  maxTotalTurningErrDeg: number;
  maxSharpestTurnErrDeg: number;
  maxNarrowestErrPct: number;
}

export interface Downstream {
  targets: TargetComparison[];
  targetsCompared: number;
  frontiersSame: number;
  bestSame: number;
  candidates: number;
  verdictFlips: number;
}

const frontierIds = (r: OptimizeResult | null): string[] => (r && r.kind === 'frontier' ? r.routes.map((x) => x.id) : []);
const candidatesOf = (r: OptimizeResult | null): Route[] => (r && r.kind === 'frontier' ? r.candidates : []);
const bestOf = (r: OptimizeResult | null): string | null => (r && r.kind === 'frontier' ? (createRanker(r)(DEFAULT_WEIGHTS).order[0]?.routeId ?? null) : null);

export function compareRoutes(truthCase: LoadedCase, recovered: LoadedCase): Downstream {
  const gt = buildGraph(truthCase);
  let gr: ReturnType<typeof buildGraph> | null = null;
  try {
    gr = buildGraph(recovered);
  } catch {
    gr = null; // the recovered case is too broken to build a graph from: every target counts as changed
  }
  const targets: TargetComparison[] = [];
  for (const t of truthCase.targets) {
    if (!t.reachable) continue;
    const a = optimizeCase(gt, { caseId: truthCase.id, targetId: t.id });
    let b: OptimizeResult | null = null;
    try {
      b = gr ? optimizeCase(gr, { caseId: recovered.id, targetId: t.id }) : null;
    } catch {
      b = null;
    }
    const fa = frontierIds(a);
    const fb = frontierIds(b);
    const shared = fa.filter((x) => fb.includes(x)).length;
    const union = new Set([...fa, ...fb]).size;
    const ca = candidatesOf(a);
    const cb = new Map(candidatesOf(b).map((r) => [r.id, r]));
    let flips = 0;
    let dLen = 0;
    let dSum = 0;
    let dMax = 0;
    let dNarrow = 0;
    for (const r of ca) {
      const o = cb.get(r.id);
      if (!o) {
        flips++;
        continue;
      }
      if (o.feasible !== r.feasible) flips++;
      dLen = Math.max(dLen, (Math.abs(o.cost.lengthM - r.cost.lengthM) / r.cost.lengthM) * 100);
      dSum = Math.max(dSum, Math.abs(o.cost.totalTurningDeg - r.cost.totalTurningDeg));
      dMax = Math.max(dMax, Math.abs(o.cost.sharpestTurnDeg - r.cost.sharpestTurnDeg));
      dNarrow = Math.max(dNarrow, (Math.abs(o.cost.narrowestRadiusM - r.cost.narrowestRadiusM) / r.cost.narrowestRadiusM) * 100);
    }
    const bestTrue = bestOf(a);
    const bestRecovered = bestOf(b);
    targets.push({
      targetId: t.id,
      frontierSame: b !== null && a.kind === b.kind && shared === union,
      frontierJaccard: union > 0 ? shared / union : b !== null && a.kind === b.kind ? 1 : 0,
      bestSame: b !== null && bestTrue === bestRecovered,
      bestTrue,
      bestRecovered,
      candidates: ca.length,
      verdictFlips: flips,
      maxLengthErrPct: dLen,
      maxTotalTurningErrDeg: dSum,
      maxSharpestTurnErrDeg: dMax,
      maxNarrowestErrPct: dNarrow,
    });
  }
  return {
    targets,
    targetsCompared: targets.length,
    frontiersSame: targets.filter((t) => t.frontierSame).length,
    bestSame: targets.filter((t) => t.bestSame).length,
    candidates: targets.reduce((s, t) => s + t.candidates, 0),
    verdictFlips: targets.reduce((s, t) => s + t.verdictFlips, 0),
  };
}
