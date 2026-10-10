import { defineConfig, devices } from '@playwright/test';

const databaseUrl =
  process.env.E2E_DATABASE_URL ?? 'postgres://uhishange:uhishange@localhost:54329/uhishange_e2e';
process.env.DATABASE_URL = databaseUrl;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], locale: 'en-US', timezoneId: 'America/Los_Angeles' },
    },
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 13'],
        defaultBrowserType: 'chromium',
        locale: 'en-GB',
        timezoneId: 'Asia/Tokyo',
      },
    },
  ],
  webServer: {
    command: 'npm run bootstrap && npm run build && node dist/server/server/server.js',
    url: 'http://127.0.0.1:3001',
    timeout: 120_000,
    reuseExistingServer: false,
    env: { DATABASE_URL: databaseUrl, NODE_ENV: 'production', PORT: '3001', SEED_DEMO: 'true' },
  },
});
