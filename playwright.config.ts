import { defineConfig, devices } from '@playwright/test';

import { DEV_PORT, DEV_PUBLIC_ORIGIN, HARNESS_ORIGIN, PUBLIC_ORIGIN, WEB_PORT, webEnv } from './e2e/env';

// Browser tests (ADR-24): three engines, each started with third-party
// cookies blocked, because the embedded form must not depend on them.
//   Chromium  the browser's own switch that turns third-party cookies off
//   Firefox   network.cookie.cookieBehavior = 1 (reject third-party cookies)
//   WebKit    blocks third-party cookies by default; nothing to set
// e2e/embed.spec.ts contains a control that proves the blocking is in effect.
const reuse = !process.env.CI;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Three engines at once is what this suite is sized for; more only makes the scans slower.
  workers: process.env.CI ? 2 : 3,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: PUBLIC_ORIGIN,
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: '**/hydration-dev.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        // The full Chromium build in its new headless mode (README, "Browser tests").
        channel: 'chromium',
        viewport: { width: 1440, height: 900 },
        launchOptions: { args: ['--test-third-party-cookie-phaseout'] },
      },
    },
    {
      name: 'firefox',
      testIgnore: ['**/hydration-dev.spec.ts', '**/config-guard.spec.ts'], // the start-up guard involves no browser: once is enough
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1440, height: 900 },
        launchOptions: { firefoxUserPrefs: { 'network.cookie.cookieBehavior': 1 } },
      },
    },
    {
      name: 'webkit',
      testIgnore: ['**/hydration-dev.spec.ts', '**/config-guard.spec.ts'], // the start-up guard involves no browser: once is enough
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } },
    },
    {
      // The same gallery served by `next dev`: React's development build reports every hydration mismatch.
      name: 'hydration-dev',
      testMatch: '**/hydration-dev.spec.ts',
      use: { ...devices['Desktop Chrome'], channel: 'chromium', baseURL: DEV_PUBLIC_ORIGIN, viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      name: 'web (test build)',
      command: 'node e2e/servers/web.mjs start',
      url: `${PUBLIC_ORIGIN}/dev/gallery`,
      env: webEnv(WEB_PORT),
      reuseExistingServer: reuse,
      timeout: 300_000,
      stdout: 'pipe',
    },
    {
      name: 'web (next dev)',
      command: 'node e2e/servers/web.mjs dev',
      url: `${DEV_PUBLIC_ORIGIN}/dev/gallery`,
      env: webEnv(DEV_PORT),
      reuseExistingServer: reuse,
      timeout: 300_000,
      stdout: 'pipe',
    },
    {
      name: 'harness sites and API stub',
      command: 'node e2e/servers/harness.mjs',
      url: `${HARNESS_ORIGIN}/healthz`,
      reuseExistingServer: reuse,
      timeout: 60_000,
    },
  ],
});
