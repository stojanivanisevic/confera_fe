import { resolve } from 'node:path';

import type { NextConfig } from 'next';

// A test build (`--dev-pages`, see scripts/next.mjs) carries the component
// gallery and the spike fixtures. A production build does not contain them at
// all: their page files have the extension `.dev.tsx`, which only a test build
// treats as a page, and the fixture module is swapped for an empty one
// (ADR-20, ADR-24: dev tools are absent, not switched off).
const devPages = process.env.CONFERA_DEV_PAGES === '1';

// The container image (Dockerfile, M4-FE-05) is built with CONFERA_STANDALONE=1: the server and only
// the files it needs, traced across the workspace, in .next/standalone. Never with the dev pages.
const standalone = process.env.CONFERA_STANDALONE === '1';
if (standalone && devPages) throw new Error('A standalone (image) build never carries the dev pages (ADR-24).');

// `next dev` serves its own resources only to the host names listed here (and to "localhost").
// Both surfaces must work in development, so both configured host names are listed.
const hostnameOf = (origin: string | undefined): string | null => {
  try {
    return origin ? new URL(origin).hostname : null;
  } catch {
    return null;
  }
};
const devHosts = [hostnameOf(process.env.CONFERA_PUBLIC_ORIGIN), hostnameOf(process.env.CONFERA_ADMIN_ORIGIN)].filter((host): host is string => host !== null);

const nextConfig: NextConfig = {
  // The two builds never share an output directory.
  distDir: devPages ? '.next-test' : '.next',

  // The image build: `next build` runs in apps/web (scripts/next.mjs), the workspace root is two up.
  ...(standalone ? { output: 'standalone' as const, outputFileTracingRoot: resolve(process.cwd(), '..', '..') } : {}),

  // ---- Framework settings of ADR-20 ---------------------------------------
  poweredByHeader: false, // no version header
  productionBrowserSourceMaps: false, // no public source maps
  images: { unoptimized: true }, // the image optimiser (a fetch-any-address feature) is off
  devIndicators: false,
  allowedDevOrigins: devHosts, // development server only
  reactStrictMode: true,
  // The proxy (src/proxy.ts) gets the URL of the request as the router has it. Otherwise the framework
  // builds that URL with "localhost" while the router names itself by the address it listens on
  // (LISTEN_HOST, scripts/next.mjs), and the rewrite to the "not found" page would look like a
  // rewrite to another server (a 500). The proxy uses its path and query, and builds that rewrite on it.
  skipProxyUrlNormalize: true,

  // The framework copies the body of every request its proxy sees and keeps only the first 10 MB of
  // it (SEC-M1-09). An upload of a form is up to 20 MB by default and at most 50 MB (FR-FILE-01): on
  // a developer's machine and in the browser tests the web application forwards it to the API, so a
  // test build takes 51 MB. A production build keeps the framework's 10 MB: there the reverse proxy
  // routes /public/v1 and /api/v1 to the API itself, and an upload never passes through here (ADR-20).
  experimental: devPages ? { proxyClientMaxBodySize: '51mb' } : {},

  pageExtensions: devPages ? ['tsx', 'ts', 'dev.tsx', 'dev.ts'] : ['tsx', 'ts'],

  // Fixed at build time: read by the configuration module only.
  env: { CONFERA_DEV_PAGES: devPages ? '1' : '0' },

  // The internal packages are TypeScript source.
  transpilePackages: ['@confera/ui', '@confera/form-renderer', '@confera/embed-loader', '@confera/api-client', '@confera/template-editor'],

  turbopack: {
    resolveAlias: {
      '#dev-fixtures': devPages ? './src/server/dev-fixtures.dev.ts' : './src/server/dev-fixtures.none.ts',
    },
  },

  // Type checking and lint are separate steps of `pnpm check`.
  typescript: { ignoreBuildErrors: false },

  // The framework's own files (/_next/static/: scripts, stylesheets, fonts) do not pass the proxy
  // (src/proxy.ts) and keep their long cache. They are never read as another type than they are sent.
  // Every other response gets its headers from the proxy, by kind (ADR-28).
  headers: () => Promise.resolve([{ source: '/_next/static/:path*', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }] }]),
};

export default nextConfig;
