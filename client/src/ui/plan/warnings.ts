/**
 * Warnings as the route grows, in words, naming edges and zones from the case data. Blocking violations come
 * first (the route is removed by §4.4), then heavy crossings, then proximity. Numbers come from the violation's
 * own fields. "Feasible" is only ever said when routeFor says so; "optimal" is never said (spec §9.4).
 */
import type { LoadedCase, Route, RiskTier, WirePreset } from '../../contracts';

export type WarningLevel = 'blocked' | 'heavy' | 'proximity';

export interface PlanWarning {
  level: WarningLevel;
  tier: RiskTier | null;
  text: string;
}

function vesselOfEdge(c: LoadedCase, edgeId: string): string {
  const edge = c.edges.find((e) => e.id === edgeId);
  return c.vessels.find((v) => v.id === edge?.vessel)?.name ?? edgeId;
}

const ZONE_KIND: Record<string, string> = { plaque: 'plaque', aneurysm: 'aneurysm', dissection: 'dissection', critical_branch: 'critical branch' };

function zoneName(c: LoadedCase, zoneId: string): string {
  const z = c.riskZones.find((r) => r.id === zoneId);
  if (!z) return zoneId;
  return `the ${ZONE_KIND[z.kind] ?? z.kind} in the ${vesselOfEdge(c, z.edge)}`;
}

const mm = (m: number): string => (m * 1000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const deg = (d: number): string => Math.round(d).toLocaleString('en-US');

export function warningsFor(c: LoadedCase, route: Route | null, preset: WirePreset): PlanWarning[] {
  if (!route) return [];
  const out: PlanWarning[] = [];
  for (const v of route.violations) {
    switch (v.kind) {
      case 'forbidden_zone':
        out.push({ level: 'blocked', tier: 'forbidden', text: `Blocked: the route passes through ${zoneName(c, v.zone)}, a no-go zone.` });
        break;
      case 'turn_too_sharp':
        out.push({ level: 'blocked', tier: null, text: `Blocked: the ${deg(v.turnDeg)}° turn into the ${vesselOfEdge(c, v.edge)} is sharper than the ${preset.name} wire can take (${deg(v.maxTurnDeg)}°).` });
        break;
      case 'too_narrow':
        out.push({ level: 'blocked', tier: null, text: `Blocked: the ${vesselOfEdge(c, v.edge)} narrows to ${mm(v.diameterM)} mm across; the ${preset.name} wire needs ${mm(v.requiredM)} mm.` });
        break;
      case 'arch_never_reached':
        out.push({ level: 'blocked', tier: null, text: `Blocked: the ${preset.name} wire never reached this target in the recorded runs.` });
        break;
      default: {
        // A violation kind added to the contract after this screen was written: still shown, never dropped.
        const edge = (v as { edge?: unknown }).edge;
        out.push({ level: 'blocked', tier: null, text: typeof edge === 'string' ? `Blocked: the ${preset.name} wire can't take the route into the ${vesselOfEdge(c, edge)}.` : `Blocked: the ${preset.name} wire can't take this route.` });
      }
    }
  }
  for (const x of route.crossings) {
    if (x.tier === 'heavy') out.push({ level: 'heavy', tier: 'heavy', text: `Crosses ${zoneName(c, x.zone)}, a heavy risk zone.` });
  }
  for (const x of route.crossings) {
    if (x.tier === 'proximity') out.push({ level: 'proximity', tier: 'proximity', text: `Passes close to ${zoneName(c, x.zone)}.` });
  }
  return out;
}

export function vesselName(c: LoadedCase, edgeId: string): string {
  return vesselOfEdge(c, edgeId);
}
