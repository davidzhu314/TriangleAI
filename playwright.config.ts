import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the production build (spec Phase 8).
// E2E_BASE_URL points them at a deployed copy instead (e.g. the Vercel rail demo); then no local server starts.
const deployed = process.env['E2E_BASE_URL'];

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: 'list',
  use: { baseURL: deployed ?? 'http://localhost:4173', trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  ...(deployed ? {} : {
    webServer: {
      command: 'pnpm build && pnpm preview',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
  }),
});
