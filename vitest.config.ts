import { defineConfig } from 'vitest/config';

// Unit tests only. Playwright end-to-end tests live in tests/e2e and run with `pnpm test:e2e`.
export default defineConfig({
  test: {
    include: ['client/src/**/*.test.ts', 'tests/**/*.test.ts', 'tools/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    environment: 'node',
  },
});
