/**
 * Phantom cases appear in the Library only while the physics process answers (DECISIONS.md, kickoff).
 * There is no case-serving or health endpoint yet (D3a/D5); the URL and shape are asked of David in
 * team/requests/to-david-from-aroovee-physics-index.md. Until then this probe fails closed: no URL, no cards.
 */

/** Set when David answers. Expected shape, like cases/index.json: { cases: [{ id, path }] }. */
export const PHYSICS_CASES_URL: string | null = null;
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
