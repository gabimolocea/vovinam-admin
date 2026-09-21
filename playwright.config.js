import { defineConfig, devices } from '@playwright/test';

// These three apps are also the three covered by the Vitest unit/component
// suites (see apps/*/vitest.config.js) - e2e here focuses on what can only
// be verified in a real browser: cross-app SSO redirects (public-site <->
// app) and router-level auth guards, both driven against real dev servers
// with the Django backend replaced by page.route() mocks (see e2e/*/*.spec.js)
// so CI doesn't need a live backend/database to run these.
const PUBLIC_SITE_URL = 'http://localhost:5179';
const APP_URL = 'http://localhost:5175';
const COMPETITION_ADMIN_URL = 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'html',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'public-site',
      testDir: './e2e/public-site',
      use: { ...devices['Desktop Chrome'], baseURL: PUBLIC_SITE_URL },
    },
    {
      name: 'app',
      testDir: './e2e/app',
      use: { ...devices['Desktop Chrome'], baseURL: APP_URL },
    },
    {
      name: 'competition-admin',
      testDir: './e2e/competition-admin',
      use: { ...devices['Desktop Chrome'], baseURL: COMPETITION_ADMIN_URL },
    },
  ],
  // All three dev servers are started together regardless of which
  // project's tests run, since the app<->public-site redirect spec needs
  // both origins up at once.
  webServer: [
    {
      command: 'npm run dev --workspace @vovinam/public-site -- --port 5179 --strictPort',
      url: PUBLIC_SITE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npm run dev --workspace @vovinam/app -- --port 5175 --strictPort',
      url: APP_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npm run dev --workspace @vovinam/competition-admin -- --port 5173 --strictPort',
      url: COMPETITION_ADMIN_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
