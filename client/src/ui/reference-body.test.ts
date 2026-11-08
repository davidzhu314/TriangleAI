import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REFERENCE_GLB, serves } from './body-context';

const response = (status: number, bytes: Uint8Array): Response => new Response(new Blob([bytes as BlobPart]), { status });
const fakeFetch = (r: Response | Error): typeof fetch => (async () => {
  if (r instanceof Error) throw r;
  return r;
}) as typeof fetch;

describe('the shipped reference body (anatomy/vascular.glb): used if present, else the placeholder', () => {
  it('reads a GLB from its first bytes, as a ranged (206) or full (200) response', async () => {
    const glb = new Uint8Array(readFileSync(join(process.cwd(), 'client', 'public', REFERENCE_GLB)));
    expect(await serves('x', fakeFetch(response(206, glb.slice(0, 12))))).toBe(true);
    expect(await serves('x', fakeFetch(response(200, glb)))).toBe(true);
  });

  it('treats a 404, an HTML fallback page or a network error as no reference body', async () => {
    expect(await serves('x', fakeFetch(response(404, new TextEncoder().encode('The page could not be found'))))).toBe(false);
    expect(await serves('x', fakeFetch(response(200, new TextEncoder().encode('<!doctype html><html>'))))).toBe(false);
    expect(await serves('x', fakeFetch(new Error('offline')))).toBe(false);
  });

  it('ships the staged asset unmodified, with its attribution beside it', () => {
    const shipped = readFileSync(join(process.cwd(), 'client', 'public', REFERENCE_GLB));
    const staged = readFileSync(join(process.cwd(), 'assets', 'vascular', 'bodyparts3d-aortic.glb'));
    expect(shipped.equals(staged), 'byte-identical to assets/vascular/bodyparts3d-aortic.glb').toBe(true);
    const credit = readFileSync(join(process.cwd(), 'client', 'public', 'anatomy', 'ATTRIBUTION.md'), 'utf8');
    expect(credit).toBe(readFileSync(join(process.cwd(), 'assets', 'vascular', 'ATTRIBUTION.md'), 'utf8'));
    expect(credit).toContain('Creative Commons Attribution-Share Alike 2.1 Japan');
  });
});
