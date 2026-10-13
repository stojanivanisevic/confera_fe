import type { NextConfig } from 'next';

// A test build (`--dev-pages`, see scripts/next.mjs) carries the component
// gallery and the spike fixtures. A production build does not contain them at
// all: their page files have the extension `.dev.tsx`, which only a test build
// treats as a page, and the fixture module is swapped for an empty one
// (ADR-20, ADR-24: dev tools are absent, not switched off).
const devPages = process.env.CONFERA_DEV_PAGES === '1';

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

  // ---- Framework settings of ADR-20 ---------------------------------------
  poweredByHeader: false, // no version header
  productionBrowserSourceMaps: false, // no public source maps
  images: { unoptimized: true }, // the image optimiser (a fetch-any-address feature) is off
  devIndicators: false,
  allowedDevOrigins: devHosts, // development server only
  reactStrictMode: true,

  pageExtensions: devPages ? ['tsx', 'ts', 'dev.tsx', 'dev.ts'] : ['tsx', 'ts'],

  // Fixed at build time: read by the configuration module only.
  env: { CONFERA_DEV_PAGES: devPages ? '1' : '0' },

  // The internal packages are TypeScript source.
  transpilePackages: ['@confera/ui', '@confera/form-renderer', '@confera/embed-loader', '@confera/api-client'],

  turbopack: {
    resolveAlias: {
      '#dev-fixtures': devPages ? './src/server/dev-fixtures.dev.ts' : './src/server/dev-fixtures.none.ts',
    },
  },

  // Type checking and lint are separate steps of `pnpm check`.
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
