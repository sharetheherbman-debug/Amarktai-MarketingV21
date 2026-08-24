import { defineConfig, devices } from '@playwright/test';

const apiUrl = process.env.E2E_API_URL || 'http://127.0.0.1:4000';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  // The one-time MFA recovery code is intentionally consumed by this journey.
  // Retrying without re-seeding would cease to be an honest replay.
  retries: 0,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  use: {
    baseURL: process.env.E2E_WEB_URL || 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node scripts/e2e-provider-stub.mjs',
      url: 'http://127.0.0.1:4100/v1/models',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'npm start --workspace=@amarktai/api',
      url: `${apiUrl}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npm start --workspace=@amarktai/web -- -p 3000',
      url: 'http://127.0.0.1:3000/login',
      env: { NODE_ENV: 'production' },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
