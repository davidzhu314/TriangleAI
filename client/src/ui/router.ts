/** Hash routes: #/library, #/case/<key>, #/case/<key>/plan. Anything else goes to the Library. */

export type Route =
  | { name: 'library' }
  | { name: 'brief'; key: string }
  | { name: 'plan'; key: string }
  | { name: 'compare'; key: string };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'case' && parts[1]) {
    const key = decodeURIComponent(parts[1]);
    if (parts.length === 2) return { name: 'brief', key };
    if (parts.length === 3 && parts[2] === 'plan') return { name: 'plan', key };
    if (parts.length === 3 && parts[2] === 'compare') return { name: 'compare', key };
  }
  return { name: 'library' };
}

export const href = {
  library: (): string => '#/library',
  brief: (key: string): string => `#/case/${encodeURIComponent(key)}`,
  plan: (key: string): string => `#/case/${encodeURIComponent(key)}/plan`,
  compare: (key: string): string => `#/case/${encodeURIComponent(key)}/compare`,
};
