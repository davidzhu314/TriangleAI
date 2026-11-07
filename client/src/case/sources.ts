/**
 * Where a case package comes from. Every source answers the same question, "give me case.json,
 * centerlines.json and vessels.glb", so loadCase treats bundled, imported and physics-served
 * cases the same way (spec §3.2: one loader).
 */
import { CASE_FILES, type BundledCaseIndex, type CaseOrigin } from '../contracts';
import { openZip, ZipError } from './unzip';

export type CaseFileName = (typeof CASE_FILES)[keyof typeof CASE_FILES];

export type CaseSource =
  /** A folder over HTTP: bundled cases (client/public/cases/<id>/) and physics-served phantoms. */
  | { kind: 'url'; baseUrl: string; origin: 'bundled' | 'physics' }
  /** A case.zip the player dropped or picked. Read in the browser; never uploaded. */
  | { kind: 'zip'; data: Blob | ArrayBuffer | Uint8Array }
  /** Files already in memory (tests, tools). */
  | { kind: 'files'; origin: CaseOrigin; files: Partial<Record<CaseFileName, Uint8Array>> };

export class PackageError extends Error {}

export interface PackageFiles {
  origin: CaseOrigin;
  /** null when the file is missing. */
  files: Record<CaseFileName, Uint8Array | null>;
}

const NAMES = Object.values(CASE_FILES) as CaseFileName[];

const joinUrl = (base: string, name: string) => (base.endsWith('/') ? base + name : `${base}/${name}`);

async function toBytes(data: Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(await data.arrayBuffer());
}

/** Read the three package files. Throws PackageError when the package cannot be read at all. */
export async function readPackage(source: CaseSource, fetchFn: typeof fetch = fetch): Promise<PackageFiles> {
  if (source.kind === 'files') {
    const files = {} as PackageFiles['files'];
    for (const n of NAMES) files[n] = source.files[n] ?? null;
    return { origin: source.origin, files };
  }

  if (source.kind === 'url') {
    const files = {} as PackageFiles['files'];
    await Promise.all(
      NAMES.map(async (n) => {
        let res: Response;
        try {
          res = await fetchFn(joinUrl(source.baseUrl, n));
        } catch {
          throw new PackageError(`Could not reach ${joinUrl(source.baseUrl, n)}.`);
        }
        files[n] = res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
      }),
    );
    return { origin: source.origin, files };
  }

  try {
    const zip = openZip(await toBytes(source.data));
    // Accept files at the root or inside one folder (zipping a folder adds one). Skip macOS extras.
    const usable = zip.entries.filter((e) => !e.name.startsWith('__MACOSX/') && !e.name.endsWith('/'));
    const caseEntry = usable.find((e) => e.name === CASE_FILES.case) ?? usable.find((e) => e.name.endsWith(`/${CASE_FILES.case}`));
    const prefix = caseEntry ? caseEntry.name.slice(0, -CASE_FILES.case.length) : '';
    const files = {} as PackageFiles['files'];
    for (const n of NAMES) {
      const entry = usable.find((e) => e.name === prefix + n);
      files[n] = entry ? await zip.read(entry) : null;
    }
    return { origin: 'imported', files };
  } catch (err) {
    if (err instanceof ZipError) throw new PackageError(`The zip could not be read: ${err.message}.`);
    throw err;
  }
}

/** Default folder for bundled cases (client/public/cases/). */
export const BUNDLED_CASES_URL = `${import.meta.env.BASE_URL}cases/`;

/** The bundled cases the Library lists, each as a ready-to-load source. */
export async function listBundledCases(
  baseUrl: string = BUNDLED_CASES_URL,
  fetchFn: typeof fetch = fetch,
): Promise<{ id: string; source: CaseSource }[]> {
  const res = await fetchFn(joinUrl(baseUrl, 'index.json'));
  if (!res.ok) throw new PackageError(`Could not read the case index (${res.status}).`);
  const index = (await res.json()) as BundledCaseIndex;
  return index.cases.map((c) => ({ id: c.id, source: { kind: 'url', baseUrl: joinUrl(baseUrl, c.path), origin: 'bundled' } }));
}
