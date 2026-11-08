/**
 * Which anatomical model a case's 3D view gets (team/requests/to-aroovee-from-vaibhav-body-context-layer.md).
 *
 * - A bundled case with a context.glb beside its vessels.glb (David exports one for the real CT cases, from the same
 *   scan): the case's own body context, placed exactly with the case's mesh.toWorld, never fitted or stretched. The
 *   generic placeholder is never drawn on such a case.
 * - Any other case (generated, imported, or no file): the reference body when the app ships one at
 *   anatomy/vascular.glb (BodyParts3D, CC BY-SA 2.1 JP: client/public/anatomy/ATTRIBUTION.md) or VITE_ANATOMY_GLB names
 *   one, placed with the case's visual alignment, or not shown where the case has none (alignedAnatomy). With neither,
 *   the placeholder.
 *
 * The probe is quiet: a missing file, a server error or a response that isn't a GLB just means "no body context". It
 * logs nothing and shows no notice. (The browser's own network panel may still list a 404 for the request.)
 */
import { RAS_MM_TO_YUP_M, type LoadedCase } from '../contracts';
import { alignedAnatomy, anatomyConfig, type AnatomyConfig } from '../render/anatomy-config';
import type { CatalogEntry } from './store';

const probes = new Map<string, Promise<string | null>>();

/** The file's bytes as a blob URL when the response really is a GLB ("glTF" magic), else null. */
async function probe(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    const magic = bytes.byteLength >= 12 ? new TextDecoder().decode(new Uint8Array(bytes, 0, 4)) : '';
    if (magic !== 'glTF') return null; // an HTML fallback page, or anything else
    return URL.createObjectURL(new Blob([bytes], { type: 'model/gltf-binary' }));
  } catch {
    return null;
  }
}

/** The case's context.glb, or null. Bundled cases only: an imported case.zip has no folder to look in. */
export function contextGlb(e: CatalogEntry | undefined, c: LoadedCase): Promise<string | null> {
  if (!e || e.origin !== 'bundled' || c.origin !== 'bundled' || e.source.kind !== 'url') return Promise.resolve(null);
  const url = new URL('context.glb', new URL(e.source.baseUrl, location.href)).href;
  let p = probes.get(url);
  if (!p) probes.set(url, (p = probe(url)));
  return p;
}

/**
 * Whether `url` serves a GLB, read from its first 12 bytes only (a Range request; a server that ignores Range sends the
 * whole file, which is still checked the same way). A 404, an error, or an HTML fallback page means no. Quiet, like
 * the context probe.
 */
export async function serves(url: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(url, { headers: { Range: 'bytes=0-11' } });
    if (!res.ok) return false;
    const head = new Uint8Array(await res.arrayBuffer(), 0, 4);
    return head.length === 4 && new TextDecoder().decode(head) === 'glTF';
  } catch {
    return false;
  }
}

/** Where the app ships its reference body (client/public/anatomy/vascular.glb), when it ships one. */
export const REFERENCE_GLB = 'anatomy/vascular.glb';
let reference: Promise<string | null> | null = null;

/** The shipped reference body's URL, or null when the build has none (then the placeholder stays). Probed once. */
export function referenceGlb(): Promise<string | null> {
  if (!reference) {
    const url = new URL(`${import.meta.env.BASE_URL}${REFERENCE_GLB}`, location.href).href;
    reference = serves(url).then((ok) => (ok ? url : null));
  }
  return reference;
}

/** The model for this case's anatomy layer: its body context when it has one, else the reference body or placeholder. */
export async function anatomyFor(e: CatalogEntry | undefined, c: LoadedCase): Promise<AnatomyConfig> {
  const blobUrl = await contextGlb(e, c);
  if (blobUrl) return { url: blobUrl, fit: 'none', toWorld: c.mesh.toWorld, placeholder: false, context: true };
  const base = anatomyConfig();
  if (base.placeholder) {
    const shipped = await referenceGlb();
    if (shipped) return alignedAnatomy({ url: shipped, fit: 'none', toWorld: RAS_MM_TO_YUP_M, placeholder: false }, c.id);
  }
  return alignedAnatomy(base, c.id);
}
