/**
 * Phantom cases appear in the Library only while the physics process answers (DECISIONS.md, kickoff).
 * The physics process serves its case list on localhost (team/requests/done/to-david-from-aroovee-physics-index.md);
 * there is no health endpoint, so the list itself is probed. The probe fails closed: when the process is down,
 * unreachable (Vercel, any laptop without physics) or answers badly, no phantom card shows.
 */

/** Same URL as PHYSICS_CASES_URL in wire/physics-source.ts. Shape, like cases/index.json: { cases: [{ id, path }] }. */
export const PHYSICS_CASES_URL: string | null = 'http://127.0.0.1:8765/cases/index.json';
const PROBE_TIMEOUT_MS = 1500;

export interface PhysicsCaseStub {
  id: string;
  baseUrl: string;
}

export async function probePhysicsCases(url: string | null = PHYSICS_CASES_URL): Promise<PhysicsCaseStub[]> {
  if (!url) return [];
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    if (!response.ok) return [];
    const body: unknown = await response.json();
    const cases = (body as { cases?: unknown }).cases;
    if (!Array.isArray(cases)) return [];
    return cases.flatMap((c: unknown) => {
      const { id, path } = (c ?? {}) as { id?: unknown; path?: unknown };
      return typeof id === 'string' && typeof path === 'string' ? [{ id, baseUrl: new URL(path, url).href }] : [];
    });
  } catch {
    return []; // offline, timed out or malformed: fail closed
  }
}
