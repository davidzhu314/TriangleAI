/** Hash routes: #/library, #/settings, #/study (and /new[/<case>/<line>], /edit/<id>), #/case/<key> and its /access, /apex, /plan, /compare, /drive and /results. Anything else goes to the Library. */

export type Route =
  | { name: 'library' }
  | { name: 'settings' }
  | { name: 'study' }
  | { name: 'study-new'; caseKey?: string; line?: string }
  | { name: 'study-edit'; id: string }
  | { name: 'brief'; key: string }
  | { name: 'access'; key: string }
  | { name: 'apex'; key: string }
  | { name: 'plan'; key: string }
  | { name: 'compare'; key: string }
  | { name: 'drive'; key: string }
  | { name: 'results'; key: string };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts.length === 1 && parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'study') {
    if (parts.length === 1) return { name: 'study' };
    if (parts[1] === 'new' && parts.length <= 4) {
      const [caseKey, line] = parts.slice(2).map(decodeURIComponent);
      return { name: 'study-new', ...(caseKey ? { caseKey } : {}), ...(line ? { line } : {}) };
    }
    if (parts[1] === 'edit' && parts[2] && parts.length === 3) return { name: 'study-edit', id: decodeURIComponent(parts[2]) };
  }
  if (parts[0] === 'case' && parts[1]) {
    const key = decodeURIComponent(parts[1]);
    if (parts.length === 2) return { name: 'brief', key };
    if (parts.length === 3 && parts[2] === 'access') return { name: 'access', key };
    if (parts.length === 3 && parts[2] === 'apex') return { name: 'apex', key };
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
  study: (): string => '#/study',
  studyNew: (caseKey?: string, line?: string): string => ['#/study/new', ...(caseKey ? [encodeURIComponent(caseKey)] : []), ...(caseKey && line ? [encodeURIComponent(line)] : [])].join('/'),
  studyEdit: (id: string): string => `#/study/edit/${encodeURIComponent(id)}`,
  brief: (key: string): string => `#/case/${encodeURIComponent(key)}`,
  access: (key: string): string => `#/case/${encodeURIComponent(key)}/access`,
  apex: (key: string): string => `#/case/${encodeURIComponent(key)}/apex`,
  plan: (key: string): string => `#/case/${encodeURIComponent(key)}/plan`,
  compare: (key: string): string => `#/case/${encodeURIComponent(key)}/compare`,
  drive: (key: string): string => `#/case/${encodeURIComponent(key)}/drive`,
  results: (key: string): string => `#/case/${encodeURIComponent(key)}/results`,
};
