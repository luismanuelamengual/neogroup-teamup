import { defineConfig, devices } from '@playwright/test'
import { E2E_BASE_URL, E2E_PORT, E2E_SERVER_ENV } from './tests/e2e/env'

/**
 * Playwright configuration for the browser e2e suite (tests/e2e).
 *
 * These are full end-to-end tests: they drive a real Chromium browser against
 * a real Next.js server (`next dev`, started automatically below) backed by a
 * dedicated, disposable SQLite database — never the real Postgres configured
 * in .env/.env.local. See tests/e2e/env.ts and tests/e2e/global-setup.ts.
 *
 * This is a different layer than tests/ (vitest): those exercise the
 * tournament engine directly (models/services), with no HTTP layer and no
 * browser. This suite drives the actual UI through a real browser instead.
 *
 * Run with:  yarn test:e2e         (headless, CI-like)
 *            yarn test:e2e:ui      (Playwright's interactive UI mode)
 *            yarn test:e2e:headed  (headed, visible browser)
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false, // single Next.js dev server + single SQLite file — keep it simple and deterministic
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: `yarn dev -p ${E2E_PORT}`,
    url: E2E_BASE_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: E2E_SERVER_ENV,
    stdout: 'pipe',
    stderr: 'pipe'
  }
})
