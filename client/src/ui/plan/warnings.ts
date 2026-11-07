/**
 * Warnings as the route grows, in words, naming edges and zones from the case data. Blocking violations come
 * first (the route is removed by §4.4), then heavy crossings, then proximity. Numbers come from the violation's
 * own fields. "Feasible" is only ever said when routeFor says so; "optimal" is never said (spec §9.4).
 */
import type { ConstraintViolation, LoadedCase, Route, RiskTier, WirePreset } from '../../contracts';

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

/** One violation in words. `presetName` is optional: a no-safe-route reason may span presets. */
export function violationText(c: LoadedCase, v: ConstraintViolation, presetName?: string): string {
  const wire = presetName ? `the ${presetName} wire` : 'the wire';
  switch (v.kind) {
    case 'forbidden_zone':
      return `Blocked: the route passes through ${zoneName(c, v.zone)}, a no-go zone.`;
    case 'turn_too_sharp':
      return `Blocked: the ${deg(v.turnDeg)}° turn into the ${vesselOfEdge(c, v.edge)} is sharper than ${wire} can take (${deg(v.maxTurnDeg)}°).`;
    case 'too_narrow':
      return `Blocked: the ${vesselOfEdge(c, v.edge)} narrows to ${mm(v.diameterM)} mm across; ${wire} needs ${mm(v.requiredM)} mm.`;
    case 'arch_never_reached':
      return `Blocked: ${wire} never reached this target in the recorded runs.`;
    default: {
      // A violation kind added to the contract after this screen was written: still shown, never dropped.
      const edge = (v as { edge?: unknown }).edge;
      return typeof edge === 'string' ? `Blocked: ${wire} can't take the route into the ${vesselOfEdge(c, edge)}.` : `Blocked: ${wire} can't take this route.`;
    }
  }
}

export function zoneLabel(c: LoadedCase, zoneId: string): string {
  return zoneName(c, zoneId);
}

export function warningsFor(c: LoadedCase, route: Route | null, preset: WirePreset): PlanWarning[] {
  if (!route) return [];
  const out: PlanWarning[] = route.violations.map((v) => ({ level: 'blocked' as const, tier: v.kind === 'forbidden_zone' ? ('forbidden' as const) : null, text: violationText(c, v, preset.name) }));
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
