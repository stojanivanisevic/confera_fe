import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Unit tests (ADR-24). Browser behaviour is tested with Playwright (`pnpm e2e`).
export default defineConfig({
  // The screens of apps/web are written for Next, whose tsconfig says `jsx: preserve`; the tests read them with the automatic runtime.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    // `@/…` is the application's own path alias (apps/web/tsconfig.json).
    alias: [
      { find: /^@\//, replacement: fromRoot('./apps/web/src/') },
      { find: '#dev-fixtures', replacement: fromRoot('./apps/web/src/server/dev-fixtures.dev.ts') },
    ],
  },
  test: {
    include: [
      'apps/*/src/**/*.test.{ts,tsx}',
      'packages/*/src/**/*.test.{ts,tsx}',
      'scripts/**/*.test.mjs',
      'tests/**/*.test.{ts,tsx}',
    ],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 120_000,
    restoreMocks: true,
  },
});
