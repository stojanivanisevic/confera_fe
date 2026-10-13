import { defineConfig, devices } from '@playwright/test';

// `pnpm ds:visual`: the visual comparison of design system v1 and v2
// (ADR-21, M1-FE-06). It renders every preview of the design system as the
// plain script it is, in both versions, and writes the pictures and their
// difference to .artifacts/ds-visual/ for the reviewers.
export default defineConfig({
  testDir: './e2e/ds-visual',
  testMatch: '**/*.visual.ts',
  outputDir: './test-results/ds-visual',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  timeout: 300_000,
  use: { baseURL: 'http://127.0.0.1:4100' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chromium', viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 } }],
  webServer: {
    name: 'design-system previews',
    command: 'node e2e/servers/ds-previews.mjs',
    url: 'http://127.0.0.1:4100/healthz',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
