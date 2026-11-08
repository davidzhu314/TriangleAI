/**
 * Fluoro stops counting once the wire has reached the target (rehearsal 1, issue 2; DECISIONS.md 2026-11-07).
 * The drive still ends on "Finish drive"; only the recorded fluoro time is capped. Scoring reads fluoro from the
 * log's samples alone, so capping the saved log makes Results match the HUD.
 */
import type { EventLog } from '../../contracts';

/** Time of the first target_reached event, or null when the wire never reached the target. */
export function targetReachedAt(log: EventLog): number | null {
  return log.events.find((e) => e.kind === 'target_reached')?.t ?? null;
}

/** A copy of the log with fluoro off on every sample after the first target_reached. Nothing else changes. */
export function capFluoroAtTarget(log: EventLog): EventLog {
  const at = targetReachedAt(log);
  if (at === null || !log.samples.some((s) => s.t > at && s.fluoro)) return log;
  return { ...log, samples: log.samples.map((s) => (s.t > at && s.fluoro ? { ...s, fluoro: false } : s)) };
}
