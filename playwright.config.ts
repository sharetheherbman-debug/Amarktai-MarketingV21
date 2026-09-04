import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const apiUrl = process.env.E2E_API_URL || 'http://127.0.0.1:4000';
const webUrl = process.env.E2E_WEB_URL || 'http://127.0.0.1:3000';
const parsedWebUrl = new URL(webUrl);
const webPort = parsedWebUrl.port || (parsedWebUrl.protocol === 'https:' ? '443' : '80');
const systemChromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium';
const launchOptions = existsSync(systemChromiumPath) ? { executablePath: systemChromiumPath } : undefined;

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
    baseURL: webUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions } }],
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
      command: 'node scripts/e2e-generation-worker.mjs',
      url: 'http://127.0.0.1:4101/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `npm start --workspace=@amarktai/web -- -p ${webPort}`,
      url: `${webUrl}/login`,
      env: { NODE_ENV: 'production' },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
