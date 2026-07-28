import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: 'http://127.0.0.1:3310',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node test/e2e/server.mjs',
    url: 'http://127.0.0.1:3310/api/health',
    reuseExistingServer: false,
    env: {
      WEBXRAY_DATA_DIR: '/tmp/webxray-playwright-data',
      WEBXRAY_AUTH_TOKEN: 'webxray-playwright-token-20260728',
      WEBXRAY_HOST: '127.0.0.1',
      WEBXRAY_PORT: '3310'
    }
  }
});
