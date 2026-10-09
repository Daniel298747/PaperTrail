import { defineConfig, devices } from '@playwright/test'

/**
 * Browser tests against a running stack (API + storage + web). Defaults target the local setup
 * (vite preview on :4173); point E2E_BASE_URL at http://localhost:3000 for Docker Compose.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4173',
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'flow', testMatch: /(flow|pdf-preview)\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'screenshots', testMatch: /screens\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
  ],
})
