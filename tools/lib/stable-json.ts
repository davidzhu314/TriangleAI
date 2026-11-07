/**
 * Deterministic JSON for generated case packages: sorted object keys, 2-space indent, trailing
 * newline. Numbers are written as JavaScript prints them; round them before calling.
 */
export function stableStringify(value: unknown, indent = 2): string {
  return JSON.stringify(sortKeys(value), null, indent) + '\n';
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = sortKeys(x);
    }
    return out;
  }
  return v;
}

/** Round to a fixed number of decimals so files do not carry float noise. −0 becomes 0. */
export function roundTo(x: number, decimals: number): number {
  const f = 10 ** decimals;
  const r = Math.round(x * f) / f;
  return r === 0 ? 0 : r;
}
