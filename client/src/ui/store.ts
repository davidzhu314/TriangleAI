/**
 * The cases the screens know about: bundled (listed by cases/index.json), imported this session (a dropped
 * case.zip, never uploaded) and physics-served (only while the physics process answers).
 *
 * Accepted fixes are the UI's to save (D2 handoff). They are saved per catalogue key:
 * - bundled and physics cases: the case id;
 * - imported cases: the case id plus a hash of the file, so a fix accepted on one file never applies to another
 *   package that happens to share its id (every broken test package is "fixture-y").
 */
import { listBundledCases, loadCase, type CaseSource } from '../case';
import type { CaseLoadResult, LoadedCase, Stars, ValidationFix, Weights, WirePresetId } from '../contracts';
import { bestStars, nextCase as nextOpenCase, type ProgressRecord } from '../score';

export type CatalogOrigin = 'bundled' | 'imported' | 'physics';

export interface CatalogEntry {
  /** Route key: #/case/<key>. */
  key: string;
  origin: CatalogOrigin;
  source: CaseSource;
  fixes: ValidationFix[];
  result: CaseLoadResult;
}

const FIXES_KEY = 'threadsim.fixes.v1';

function readFixes(): Record<string, ValidationFix[]> {
  try {
    const raw = localStorage.getItem(FIXES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, ValidationFix[]>) : {};
  } catch {
    return {};
  }
}

function savedFixes(storeKey: string): ValidationFix[] {
  return readFixes()[storeKey] ?? [];
}

function saveFixes(storeKey: string, fixes: ValidationFix[]): void {
  try {
    localStorage.setItem(FIXES_KEY, JSON.stringify({ ...readFixes(), [storeKey]: fixes }));
  } catch {
    // Storage blocked (private mode): the fix still applies for this session.
  }
}

const entries = new Map<string, CatalogEntry>();
/** Storage key per catalogue key (imported entries are stored by content hash). */
const storeKeys = new Map<string, string>();
let bundledOrder: string[] = [];
let bundledLoad: Promise<void> | null = null;

/** Load every bundled case once, with its saved fixes. Rejects only if the case list itself can't be read. */
export function loadBundled(): Promise<void> {
  bundledLoad ??= (async () => {
    const listed = await listBundledCases();
    bundledOrder = listed.map((c) => c.id);
    await Promise.all(
      listed.map(async ({ id, source }) => {
        const fixes = savedFixes(id);
        const result = await loadOrError(source, fixes);
        entries.set(id, { key: id, origin: 'bundled', source, fixes, result });
        storeKeys.set(id, id);
      }),
    );
  })().catch((err: unknown) => {
    bundledLoad = null; // allow a retry
    throw err;
  });
  return bundledLoad;
}

async function loadOrError(source: CaseSource, fixes: readonly ValidationFix[]): Promise<CaseLoadResult> {
  try {
    return await loadCase(source, { fixes });
  } catch (err) {
    // A package that can't be read at all (not a zip, missing file): show it as one error in words.
    const message = err instanceof Error ? err.message : 'The package could not be read.';
    return { ok: false, results: [{ check: 'schema', severity: 'error', message }] };
  }
}

/** Bundled cases in index order, then this session's imports in the order they were added. */
export function catalog(): CatalogEntry[] {
  const bundled = bundledOrder.map((id) => entries.get(id)).filter((e): e is CatalogEntry => !!e);
  const rest = [...entries.values()].filter((e) => e.origin !== 'bundled');
  return [...bundled, ...rest];
}

export function entry(key: string): CatalogEntry | undefined {
  return entries.get(key);
}

// ---------------------------------------------------------------- progress (V6 rules, client/src/score)
const HISTORY_KEY = 'threadsim.progress.v1';
/** Open mode: every case playable on a fresh browser (V6 handoff: the demo build uses 'open'). */
const LADDER_MODE = 'open';

/** Saved attempts. Nothing writes them until the Results screen (A6), so today this is empty. */
export function progressHistory(): ProgressRecord[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as ProgressRecord[]) : [];
  } catch {
    return [];
  }
}

/** Loaded cases with each case id once, catalogue order first (V6 throws on a repeated id; imports can share one). */
function uniqueCases(list: CatalogEntry[]): LoadedCase[] {
  const seen = new Set<string>();
  return list.flatMap((e) => {
    const c = loadedCase(e);
    if (!c || seen.has(c.id)) return [];
    seen.add(c.id);
    return [c];
  });
}

/** Best stars for a case, or undefined if it was never attempted: then the UI says so instead of showing 0. */
export function starsFor(key: string): Stars | undefined {
  const c = loadedCase(entries.get(key));
  const history = progressHistory();
  if (!c || !history.some((r) => r.caseId === c.id)) return undefined;
  return bestStars(c.id, history);
}

/** The Library's next case: V6's nextCase, mapped back to its catalogue entry. */
export function nextCase(list: CatalogEntry[]): CatalogEntry | undefined {
  const id = nextOpenCase(uniqueCases(list), progressHistory(), LADDER_MODE);
  return id === null ? undefined : list.find((e) => loadedCase(e)?.id === id);
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join(''); // taste-skill-ignore: hex digits of a hash, not a label
}

export interface ImportOutcome {
  /** Catalogue key when the case loaded; absent when it was rejected. */
  key?: string;
  storeKey: string;
  result: CaseLoadResult;
}

/** Check a dropped case.zip in the browser. The file is read here and never leaves the machine. */
export async function importZip(file: Blob): Promise<ImportOutcome> {
  const bytes = await file.arrayBuffer();
  const storeKey = `imported:${await sha256(bytes)}`;
  const source: CaseSource = { kind: 'zip', data: bytes };
  const fixes = savedFixes(storeKey);
  const result = await loadOrError(source, fixes);
  if (!result.ok) return { storeKey, result };
  const key = `${result.case.id}@${storeKey.slice('imported:'.length, 'imported:'.length + 8)}`;
  entries.set(key, { key, origin: 'imported', source, fixes, result });
  storeKeys.set(key, storeKey);
  return { key, storeKey, result };
}

/** Accept a fix: save it, load again with every accepted fix, and return the new result. */
export async function acceptFix(key: string, fix: ValidationFix): Promise<CaseLoadResult> {
  const current = entries.get(key);
  if (!current) throw new Error(`No case ${key}`);
  const fixes = [...current.fixes, fix];
  saveFixes(storeKeys.get(key) ?? key, fixes);
  const result = await loadOrError(current.source, fixes);
  entries.set(key, { ...current, fixes, result });
  return result;
}

/** Register a physics-served case (only while the physics process answers). */
export async function addPhysicsCase(id: string, baseUrl: string): Promise<CatalogEntry> {
  const source: CaseSource = { kind: 'url', baseUrl, origin: 'physics' };
  const fixes = savedFixes(id);
  const result = await loadOrError(source, fixes);
  const e: CatalogEntry = { key: id, origin: 'physics', source, fixes, result };
  entries.set(id, e);
  storeKeys.set(id, id);
  return e;
}

export function loadedCase(e: CatalogEntry | undefined): LoadedCase | undefined {
  return e?.result.ok ? e.result.case : undefined;
}

// ---------------------------------------------------------------- the plan handed from Plan to Compare
export interface SavedPlan {
  entryId: string;
  targetId: string;
  presetId: WirePresetId;
  edges: string[];
  /** The weights the player chose the route at (Compare); V5 scores regret at these. */
  weights?: Weights;
}

const PLANS_KEY = 'threadsim.plans.v1';

/** Plans live in this tab's session storage, so a refresh on Compare keeps the route. Never sent anywhere. */
function readPlans(): Record<string, SavedPlan> {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(PLANS_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, SavedPlan>) : {};
  } catch {
    return {};
  }
}

/** Keep the player's plan for this session: Compare reads it, and Plan shows it again. */
export function savePlan(key: string, plan: SavedPlan): void {
  const copy: SavedPlan = { ...plan, edges: [...plan.edges], ...(plan.weights ? { weights: { ...plan.weights } } : {}) };
  try {
    sessionStorage.setItem(PLANS_KEY, JSON.stringify({ ...readPlans(), [key]: copy }));
  } catch {
    memoryPlans.set(key, copy); // storage blocked: keep it in memory for this page
  }
}

const memoryPlans = new Map<string, SavedPlan>();

export function savedPlan(key: string): SavedPlan | undefined {
  return readPlans()[key] ?? memoryPlans.get(key);
}
