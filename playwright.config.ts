import { defineConfig, devices } from '@playwright/test';

import { ADMIN_ORIGIN, DEV_PORT, DEV_PUBLIC_ORIGIN, HARNESS_ORIGIN, PUBLIC_ORIGIN, REAL_API_ORIGIN, WEB_PORT, webEnv } from './e2e/env';

// Browser tests (ADR-24): three engines, each started with third-party
// cookies blocked, because the embedded form must not depend on them.
//   Chromium  the browser's own switch that turns third-party cookies off
//   Firefox   network.cookie.cookieBehavior = 1 (reject third-party cookies)
//   WebKit    blocks third-party cookies by default; nothing to set
// e2e/embed.spec.ts contains a control that proves the blocking is in effect.
const reuse = !process.env.CI;

// The cross-repo smoke test (M1-QA-02; README, "Against the real API"). With CONFERA_E2E_API_ORIGIN
// set, the web application forwards to a real confera_be, and one more project runs: e2e/real-api.spec.ts,
// which asks what only the real API can answer. Without the variable that file belongs to no project.
const REAL_API_SPEC = '**/real-api.spec.ts';
// The flows of "To show" of 0.2.0 with their mail (M2-QA-02): only a real API can answer them.
const REAL_API_FLOWS = '**/qa-real-api-flows.spec.ts';
// A web application that is already running was started with another API address: it is never taken over.
const reuseWeb = reuse && REAL_API_ORIGIN === null;

export default defineConfig({
  // The Windows account guard (e2e/support/os-isolation.ts): one canary launch before any test, one last look after.
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
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
    // What a failed test leaves in the report: every action with the page as it was then (DOM
    // snapshots), the console, the network, and a picture of the moment it failed.
    // No film strip. A trace with one is recorded for every test, failed or not, by capturing each
    // frame the page paints. WebKit paints at device scale 2 and without a graphics card here, and the
    // gallery never stops painting (a spinner, skeletons), so the cost grew with the time a test took,
    // not with what it did: three WebKit workers at once slowed each other down until tests of a few
    // seconds passed their limit. Measured on the gallery specs in WebKit, three workers: 317 s of
    // test time with the film strip, 157 s without it (128 s with no trace at all).
    trace: { mode: 'retain-on-failure', screenshots: false },
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: ['**/hydration-dev.spec.ts', REAL_API_SPEC, REAL_API_FLOWS],
      use: {
        ...devices['Desktop Chrome'],
        // The full Chromium build in its new headless mode (README, "Browser tests").
        // It is started on an isolated profile by e2e/support/fixtures.ts, never by the runner itself.
        channel: 'chromium',
        viewport: { width: 1440, height: 900 },
        launchOptions: { args: ['--test-third-party-cookie-phaseout'] },
      },
    },
    {
      name: 'firefox',
      testIgnore: ['**/hydration-dev.spec.ts', '**/config-guard.spec.ts', '**/qa-hosts.spec.ts', REAL_API_SPEC, REAL_API_FLOWS], // the start-up guard and the Host-header requests involve no browser: once is enough
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1440, height: 900 },
        launchOptions: { firefoxUserPrefs: { 'network.cookie.cookieBehavior': 1 } },
      },
    },
    {
      name: 'webkit',
      testIgnore: ['**/hydration-dev.spec.ts', '**/config-guard.spec.ts', '**/qa-hosts.spec.ts', REAL_API_SPEC, REAL_API_FLOWS], // the start-up guard and the Host-header requests involve no browser: once is enough
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } },
    },
    {
      // The same gallery served by `next dev`: React's development build reports every hydration mismatch.
      name: 'hydration-dev',
      testMatch: '**/hydration-dev.spec.ts',
      use: { ...devices['Desktop Chrome'], channel: 'chromium', baseURL: DEV_PUBLIC_ORIGIN, viewport: { width: 1440, height: 900 } },
    },
    ...(REAL_API_ORIGIN === null
      ? []
      : [
          {
            // The smoke test against a real confera_be: HTTP requests, and one page in Chromium.
            name: 'real-api',
            testMatch: [REAL_API_SPEC, REAL_API_FLOWS],
            use: { ...devices['Desktop Chrome'], channel: 'chromium', baseURL: ADMIN_ORIGIN, viewport: { width: 1440, height: 900 }, launchOptions: { args: ['--test-third-party-cookie-phaseout'] } },
          },
        ]),
  ],
  webServer: [
    {
      name: 'web (test build)',
      command: 'node e2e/servers/web.mjs start',
      url: `${PUBLIC_ORIGIN}/dev/gallery`,
      env: webEnv(WEB_PORT),
      reuseExistingServer: reuseWeb,
      timeout: 300_000,
      stdout: 'pipe',
    },
    {
      name: 'web (next dev)',
      command: 'node e2e/servers/web.mjs dev',
      url: `${DEV_PUBLIC_ORIGIN}/dev/gallery`,
      env: webEnv(DEV_PORT),
      reuseExistingServer: reuseWeb,
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
