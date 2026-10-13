import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Unit tests (ADR-24). Browser behaviour is tested with Playwright (`pnpm e2e`).
export default defineConfig({
  resolve: {
    alias: {
      '@/': fromRoot('./apps/web/src/'),
      '#dev-fixtures': fromRoot('./apps/web/src/server/dev-fixtures.dev.ts'),
    },
  },
  test: {
    include: [
      'apps/*/src/**/*.test.{ts,tsx}',
      'packages/*/src/**/*.test.{ts,tsx}',
      'scripts/**/*.test.mjs',
      'tests/**/*.test.ts',
    ],
    environment: 'node',
    testTimeout: 60_000,
    restoreMocks: true,
  },
});
