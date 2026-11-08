/**
 * Which anatomical model a case's 3D view gets (team/requests/to-aroovee-from-vaibhav-body-context-layer.md).
 *
 * - A bundled case with a context.glb beside its vessels.glb (David exports one for the real CT cases, from the same
 *   scan): the case's own body context, placed exactly with the case's mesh.toWorld, never fitted or stretched. The
 *   generic placeholder is never drawn on such a case.
 * - Any other case (generated, imported, or no file): the app's usual model (the placeholder, or VITE_ANATOMY_GLB,
 *   placed with the case's visual alignment, or not shown where the case has none: alignedAnatomy).
 *
 * The probe is quiet: a missing file, a server error or a response that isn't a GLB just means "no body context". It
 * logs nothing and shows no notice. (The browser's own network panel may still list a 404 for the request.)
 */
import type { LoadedCase } from '../contracts';
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

/** The model for this case's anatomy layer: its body context when it has one, else the app's usual model. */
export async function anatomyFor(e: CatalogEntry | undefined, c: LoadedCase): Promise<AnatomyConfig> {
  const blobUrl = await contextGlb(e, c);
  if (blobUrl) return { url: blobUrl, fit: 'none', toWorld: c.mesh.toWorld, placeholder: false, context: true };
  return alignedAnatomy(anatomyConfig(), c.id);
}
