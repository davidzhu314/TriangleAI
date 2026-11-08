/** Hash routes: #/library, #/settings, #/case/<key> and its /plan, /compare, /drive and /results. Anything else goes to the Library. */

export type Route =
  | { name: 'library' }
  | { name: 'settings' }
  | { name: 'brief'; key: string }
  | { name: 'plan'; key: string }
  | { name: 'compare'; key: string }
  | { name: 'drive'; key: string }
  | { name: 'results'; key: string };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts.length === 1 && parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'case' && parts[1]) {
    const key = decodeURIComponent(parts[1]);
    if (parts.length === 2) return { name: 'brief', key };
    if (parts.length === 3 && parts[2] === 'plan') return { name: 'plan', key };
    if (parts.length === 3 && parts[2] === 'compare') return { name: 'compare', key };
    if (parts.length === 3 && parts[2] === 'drive') return { name: 'drive', key };
    if (parts.length === 3 && parts[2] === 'results') return { name: 'results', key };
  }
  return { name: 'library' };
}

export const href = {
  library: (): string => '#/library',
  settings: (): string => '#/settings',
  brief: (key: string): string => `#/case/${encodeURIComponent(key)}`,
  plan: (key: string): string => `#/case/${encodeURIComponent(key)}/plan`,
  compare: (key: string): string => `#/case/${encodeURIComponent(key)}/compare`,
  drive: (key: string): string => `#/case/${encodeURIComponent(key)}/drive`,
  results: (key: string): string => `#/case/${encodeURIComponent(key)}/results`,
};
