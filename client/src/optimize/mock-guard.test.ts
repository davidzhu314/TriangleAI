/**
 * Mock build guard. A build without VITE_ENGINE=mock must not contain any mock module, which we
 * detect by each module's marker string. A mock build must contain all three, which proves the
 * markers survive bundling, so the negative check means something.
 *
 * It runs two real Vite builds with the repo's vite.config.ts: the app (client/index.html), plus a
 * guard entry that reaches every engine entry point.
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { afterAll, describe, expect, it, vi } from 'vitest';

const REPO = join(import.meta.dirname, '../../..');
const MARKERS = ['THREADSIM_MOCK_OPTIMIZER', 'THREADSIM_MOCK_SCORE', 'THREADSIM_MOCK_WIRE'];
const dirs: string[] = [];

function readAll(dir: string): string {
  let text = '';
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    text += statSync(p).isDirectory() ? readAll(p) : readFileSync(p, 'latin1');
  }
  return text;
}

async function bundleWith(engine: string | undefined): Promise<string> {
  const outDir = mkdtempSync(join(tmpdir(), 'threadsim-guard-'));
  dirs.push(outDir);
  const prev = process.env['VITE_ENGINE'];
  if (engine === undefined) delete process.env['VITE_ENGINE'];
  else process.env['VITE_ENGINE'] = engine;
  try {
    await build({
      configFile: join(REPO, 'vite.config.ts'),
      mode: 'production',
      logLevel: 'silent',
      build: {
        outDir,
        emptyOutDir: true,
        rollupOptions: {
          input: { app: join(REPO, 'client/index.html'), guard: join(REPO, 'client/src/optimize/mock-guard.entry.ts') },
          preserveEntrySignatures: 'strict',
        },
      },
    });
  } finally {
    if (prev === undefined) delete process.env['VITE_ENGINE'];
    else process.env['VITE_ENGINE'] = prev;
  }
  return readAll(outDir);
}

afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe('mock build guard', () => {
  it('a build without VITE_ENGINE=mock contains no mock module', async () => {
    const out = await bundleWith(undefined);
    // the guard entry really was bundled (its real-mode error text is there)
    expect(out).toContain('optimize: pass the LoadedCase');
    expect(out).toContain('score: case mismatch'); // the real scorer (V5)
    // and the measure Worker was bundled too (its handler's error text)
    expect(out).toContain('no case loaded');
    for (const m of MARKERS) expect(out.includes(m), `${m} found in a real build`).toBe(false);
  }, 120_000);

  it('a build with another value is also real', async () => {
    const out = await bundleWith('real');
    for (const m of MARKERS) expect(out.includes(m), `${m} found with VITE_ENGINE=real`).toBe(false);
  }, 120_000);

  it('a VITE_ENGINE=mock build contains every marker (positive control)', async () => {
    const out = await bundleWith('mock');
    for (const m of MARKERS) expect(out.includes(m), `${m} missing from the mock build`).toBe(true);
  }, 120_000);
});

describe('engine entry points', () => {
  it('are real by default and refuse to fake results', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_ENGINE', '');
    try {
      const o = await import('./index');
      const s = await import('../score/index');
      expect(o.engineMode).toBe('real');
      expect(s.engineMode).toBe('real');
      await expect(o.optimize({ caseId: 'fixture-y', targetId: 'left_branch' })).rejects.toThrow(/LoadedCase/);
      // the real optimizer, not the mock: no placeholder three-route frontier, no recorded runs
      const { loadFixtureY } = await import('./fixture-y.testutil');
      const real = await o.optimize({ caseId: 'fixture-y', targetId: 'left_branch' }, loadFixtureY());
      expect(real.kind).toBe('frontier');
      if (real.kind === 'frontier') {
        expect(real.recordedRunsUsed).toBe(false);
        expect(real.routes.map((r) => r.presetId).sort()).toEqual(['soft_angled', 'standard_j']);
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('serve the mocks under VITE_ENGINE=mock', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_ENGINE', 'mock');
    try {
      const o = await import('./index');
      const s = await import('../score/index');
      expect(o.engineMode).toBe('mock');
      const r = await o.optimize({ caseId: 'fixture-y', targetId: 'left_branch' });
      expect(r.kind).toBe('frontier');
      const result = await s.scoreAttempt({ log: {} as never, optimized: r, weights: {}, case: {} as never });
      expect(result.feedback).toHaveLength(3);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
